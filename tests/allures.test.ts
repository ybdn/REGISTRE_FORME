import { alluresCibles, estimerVMA, formaterAllure, formaterDureeSec } from '@/domaine/allures';
import { entreeVeille, tagsParRecence } from '@/domaine/journalExpress';
import type { EntreeJournal, SeanceRealisee } from '@/domaine/types';
import { describe, expect, it } from 'vitest';

function chrono(date: string, distanceKm: number, tempsSec: number): SeanceRealisee {
  return {
    id: `${date}-chrono`,
    date,
    type: 'course',
    variante: 'normale',
    rpe: 9,
    dureeMin: 45,
    distanceKm,
    tempsSec,
  };
}

describe('estimerVMA', () => {
  it('aucun chrono ⇒ null (les écrans course restent comme en v1)', () => {
    const courseSansChrono: SeanceRealisee = {
      id: 'c1',
      date: '2026-01-10',
      type: 'course',
      variante: 'normale',
      rpe: 5,
      dureeMin: 35,
      distanceKm: 5, // distance saisie mais pas de chrono : pas un test
    };
    expect(estimerVMA([])).toBeNull();
    expect(estimerVMA([courseSansChrono])).toBeNull();
  });

  it('un test 3000 m : VMA = vitesse moyenne × 1,05', () => {
    // 3 km en 1000 s → 10,8 km/h → VMA 11,34 → arrondie 11,3.
    expect(estimerVMA([chrono('2026-01-10', 3, 1000)])).toBe(11.3);
  });

  it('un demi-Cooper (≤ 8 min) : la vitesse moyenne EST la VMA', () => {
    // 1,1 km en 6 min (360 s) → 11 km/h → VMA 11.
    expect(estimerVMA([chrono('2026-01-10', 1.1, 360)])).toBe(11);
  });

  it('plusieurs tests : lissage 70 % nouveau / 30 % ancien, dans l’ordre chronologique', () => {
    const seances = [
      chrono('2026-02-10', 3, 900), // 12 km/h → 12,6 (le plus récent)
      chrono('2026-01-10', 3, 1000), // 10,8 km/h → 11,34 (le plus ancien)
    ];
    // 0,7 × 12,6 + 0,3 × 11,34 = 12,222 → 12,2.
    expect(estimerVMA(seances)).toBe(12.2);
  });
});

describe('alluresCibles', () => {
  const a = alluresCibles(12);

  it('EF : zone 60-70 % VMA, formatée en min/km, borne rapide en premier', () => {
    // 70 % de 12 = 8,4 km/h → 7:09 /km ; 60 % = 7,2 km/h → 8:20 /km.
    expect(a.ef.texte).toBe('entre 7:09 et 8:20 /km');
  });

  it('30/30 : 100 % VMA avec repère en mètres par 30 s', () => {
    // 12 km/h → 5:00 /km ; 12 km/h × 30 s = 100 m.
    expect(a.trenteTrente.texte).toBe('~5:00 /km, soit ~100 m par 30 s');
  });

  it('400 m : temps cible à 95 % VMA', () => {
    // 95 % de 12 = 11,4 km/h → 400 m en 126 s ≈ 2:06.
    expect(a.quatreCents.tempsSec).toBe(126);
    expect(a.quatreCents.texte).toBe('400 m en ~2:06');
  });
});

describe('formatage', () => {
  it('formaterAllure arrondit à la seconde et gère le passage de minute', () => {
    expect(formaterAllure(7.5)).toBe('7:30');
    expect(formaterAllure(7.999)).toBe('8:00');
  });

  it('formaterDureeSec affiche m:ss', () => {
    expect(formaterDureeSec(115)).toBe('1:55');
    expect(formaterDureeSec(60)).toBe('1:00');
  });
});

describe('journal express', () => {
  function entree(date: string, tags: string[] = []): EntreeJournal {
    return { date, douleur: 1, energie: 4, digestion: 4, nbSelles: 1, ballonnements: false, tags };
  }

  it('entreeVeille retrouve l’entrée d’hier (et seulement elle)', () => {
    const journal = [entree('2026-01-13'), entree('2026-01-14')];
    expect(entreeVeille(journal, '2026-01-15')?.date).toBe('2026-01-14');
    expect(entreeVeille(journal, '2026-01-17')).toBeUndefined();
  });

  it('tagsParRecence : les plus récents d’abord, défauts ensuite, sans doublon', () => {
    const journal = [
      entree('2026-01-12', ['stress']),
      entree('2026-01-14', ['voyage', 'repas-gras']),
      entree('2026-01-13', ['tag-perso']),
    ];
    expect(tagsParRecence(journal, ['repas-gras', 'stress', 'hydratation-ok'])).toEqual([
      'voyage',
      'repas-gras',
      'tag-perso',
      'stress',
      'hydratation-ok',
    ]);
  });
});
