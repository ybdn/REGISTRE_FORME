import { describe, expect, it } from 'vitest';
import {
  CORRESPONDANCE_TYPES_EXERCICE,
  type SessionExterneBrute,
  dateLocaleDepuisInstant,
  estimerRpe,
  filtrerNouvellesSessions,
  mapperSessionExterne,
  nomApplication,
  typeSeanceDepuisExercice,
} from '../src/domaine/importSanteConnect';

/** Fabrique une session Health Connect minimale, surchargée champ par champ. */
function session(surcharges: Partial<SessionExterneBrute> = {}): SessionExterneBrute {
  return {
    id: 'a1b2c3d4-0000-0000-0000-000000000001',
    application: 'com.strava',
    typeExercice: 56, // RUNNING
    titre: 'Course matinale',
    debut: '2026-06-10T07:30:00.000Z',
    fin: '2026-06-10T08:00:30.000Z', // 30 min 30 s
    ...surcharges,
  };
}

describe('typeSeanceDepuisExercice', () => {
  it('mappe chaque constante connue de la table de correspondance', () => {
    expect(typeSeanceDepuisExercice(56)).toBe('course'); // RUNNING
    expect(typeSeanceDepuisExercice(57)).toBe('course'); // RUNNING_TREADMILL
    expect(typeSeanceDepuisExercice(70)).toBe('salle'); // STRENGTH_TRAINING
    expect(typeSeanceDepuisExercice(36)).toBe('freeletics'); // HIIT
    expect(typeSeanceDepuisExercice(10)).toBe('freeletics'); // BOOT_CAMP
    expect(typeSeanceDepuisExercice(13)).toBe('freeletics'); // CALISTHENICS
  });

  it("retombe sur 'sante' pour tout type inconnu (défaut prudent)", () => {
    expect(typeSeanceDepuisExercice(79)).toBe('sante'); // WALKING
    expect(typeSeanceDepuisExercice(8)).toBe('sante'); // BIKING
    expect(typeSeanceDepuisExercice(0)).toBe('sante'); // OTHER_WORKOUT
    expect(typeSeanceDepuisExercice(9999)).toBe('sante');
  });

  it('la table de correspondance ne contient que des types de séance valides', () => {
    for (const type of Object.values(CORRESPONDANCE_TYPES_EXERCICE)) {
      expect(['course', 'salle', 'freeletics', 'sante']).toContain(type);
    }
  });
});

describe('nomApplication', () => {
  it('traduit les packages connus en libellés lisibles', () => {
    expect(nomApplication('com.strava')).toBe('Strava');
    expect(nomApplication('com.freeletics.lite')).toBe('Freeletics');
    expect(nomApplication('com.google.android.apps.fitness')).toBe('Google Fit');
  });

  it('retombe sur le nom du package pour une app inconnue', () => {
    expect(nomApplication('com.exemple.inconnue')).toBe('com.exemple.inconnue');
  });
});

describe('estimerRpe', () => {
  it('priorité 1 : FC moyenne en % de FCmax, palier par palier', () => {
    const fcMax = 200;
    const cas: Array<[number, number]> = [
      [110, 2], // 55 % → très doux
      [120, 4], // 60 %
      [140, 6], // 70 %
      [160, 8], // 80 %
      [180, 9], // 90 %
    ];
    for (const [fc, rpeAttendu] of cas) {
      const resultat = estimerRpe(session({ fcMoyenne: fc }), 'course', fcMax);
      expect(resultat.rpe).toBe(rpeAttendu);
      expect(resultat.explication).toContain('% de FCmax');
    }
  });

  it('priorité 2 : défaut par type quand la FC est absente ou inexploitable', () => {
    expect(estimerRpe(session(), 'course').rpe).toBe(6);
    expect(estimerRpe(session(), 'salle').rpe).toBe(6);
    expect(estimerRpe(session(), 'freeletics').rpe).toBe(7);
    expect(estimerRpe(session(), 'sante').rpe).toBe(3);
    // FC connue mais FCmax absente → défaut aussi
    expect(estimerRpe(session({ fcMoyenne: 150 }), 'course').rpe).toBe(6);
    expect(estimerRpe(session(), 'course').explication).toBe('défaut course');
  });
});

describe('dateLocaleDepuisInstant', () => {
  it("convertit un instant UTC en date locale de l'appareil", () => {
    // 12:00 UTC tombe le même jour dans tous les fuseaux usuels (UTC±11).
    expect(dateLocaleDepuisInstant('2026-06-10T12:00:00.000Z')).toBe('2026-06-10');
  });
});

describe('mapperSessionExterne', () => {
  it('construit une séance complète, traçable et explicable', () => {
    const seance = mapperSessionExterne(session({ distanceM: 5230 }));
    expect(seance).toMatchObject({
      date: '2026-06-10',
      type: 'course',
      variante: 'normale',
      rpe: 6,
      dureeMin: 31, // round(30 min 30 s)
      distanceKm: 5.23,
      tempsSec: 31 * 60,
      source: 'sante_connect',
      idExterne: 'a1b2c3d4-0000-0000-0000-000000000001',
    });
    expect(seance.note).toContain('Importé de Strava via Santé Connect');
    expect(seance.note).toContain('Course matinale');
    expect(seance.note).toContain('RPE');
  });

  it('durée minimale de 1 minute pour les sessions très courtes', () => {
    const courte = session({ fin: '2026-06-10T07:30:12.000Z' });
    expect(mapperSessionExterne(courte).dureeMin).toBe(1);
  });

  it('omet distance et temps quand la distance est absente ou nulle (ex. musculation)', () => {
    const muscu = mapperSessionExterne(session({ typeExercice: 70, distanceM: 0 }));
    expect(muscu.type).toBe('salle');
    expect(muscu.distanceKm).toBeUndefined();
    expect(muscu.tempsSec).toBeUndefined();
    expect(mapperSessionExterne(session()).distanceKm).toBeUndefined();
  });

  it('reste lisible sans titre de session', () => {
    const seance = mapperSessionExterne(session({ titre: undefined }));
    expect(seance.note).toContain('Importé de Strava via Santé Connect.');
  });

  it("transmet la FCmax du profil à l'estimation du RPE", () => {
    const seance = mapperSessionExterne(session({ fcMoyenne: 160 }), { fcMax: 200 });
    expect(seance.rpe).toBe(8); // 80 % de FCmax
  });
});

describe('filtrerNouvellesSessions', () => {
  it("écarte les sessions déjà importées en préservant l'ordre", () => {
    const s1 = session({ id: 'id-1' });
    const s2 = session({ id: 'id-2' });
    const s3 = session({ id: 'id-3' });
    expect(filtrerNouvellesSessions([s1, s2, s3], ['id-2'])).toEqual([s1, s3]);
  });

  it("laisse tout passer quand rien n'a encore été importé", () => {
    const liste = [session({ id: 'id-1' }), session({ id: 'id-2' })];
    expect(filtrerNouvellesSessions(liste, [])).toEqual(liste);
  });

  it('renvoie une liste vide quand tout est déjà importé', () => {
    expect(filtrerNouvellesSessions([session({ id: 'id-1' })], ['id-1'])).toEqual([]);
  });

  it('accepte une liste de sessions vide', () => {
    expect(filtrerNouvellesSessions([], ['id-1'])).toEqual([]);
  });
});
