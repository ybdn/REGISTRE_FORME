import type { ExerciceModele } from '@/domaine/modelesSeances';
import { estEnPlateau, historiqueExercice, prochaineCible } from '@/domaine/progressionExercice';
import type { SeanceRealisee } from '@/domaine/types';
import { describe, expect, it } from 'vitest';

// Fabriques pour des données de test lisibles.

const presse: ExerciceModele = {
  nom: 'Presse à cuisses',
  series: 3,
  reps: 10,
  repsMin: 8,
  repsMax: 12,
  groupeMusculaire: 'bas',
  chargeDepartKg: 40,
};

const developpe: ExerciceModele = {
  nom: 'Développé épaules machine',
  series: 3,
  reps: 10,
  repsMin: 8,
  repsMax: 12,
  groupeMusculaire: 'haut',
  chargeDepartKg: 15,
};

const gainage: ExerciceModele = {
  nom: 'Gainage planche (respiration libre)',
  series: 3,
  reps: 30,
  groupeMusculaire: 'gainage',
};

function seanceSalle(
  date: string,
  exercice: ExerciceModele,
  chargeKg: number,
  reps: number,
  rpe = 6,
): SeanceRealisee {
  return {
    id: `${date}-salle`,
    date,
    type: 'salle',
    variante: 'normale',
    rpe,
    dureeMin: 50,
    charges: [{ exercice: exercice.nom, series: exercice.series, reps, chargeKg }],
  };
}

describe('historiqueExercice', () => {
  it('extrait les occurrences du même exercice, les plus récentes en premier', () => {
    const seances = [
      seanceSalle('2026-01-05', presse, 40, 8),
      seanceSalle('2026-01-12', presse, 40, 9),
      seanceSalle('2026-01-08', developpe, 15, 8),
    ];
    const h = historiqueExercice(seances, presse.nom);
    expect(h.map((p) => p.date)).toEqual(['2026-01-12', '2026-01-05']);
    expect(h[0]?.chargeKg).toBe(40);
  });

  it('ne garde que les 10 dernières séances où l’exercice apparaît', () => {
    const seances = Array.from({ length: 14 }, (_, i) =>
      seanceSalle(`2026-01-${String(i + 1).padStart(2, '0')}`, presse, 40, 8),
    );
    expect(historiqueExercice(seances, presse.nom)).toHaveLength(10);
  });
});

describe('prochaineCible — double progression', () => {
  const date = '2026-01-15';

  it('sans historique : départ au chargeDepartKg, bas de fourchette', () => {
    const cible = prochaineCible([], presse, { date });
    expect(cible.chargeKg).toBe(40);
    expect(cible.reps).toBe(8);
    expect(cible.dernierePerf).toBeNull();
  });

  it('séance réussie sous le haut de fourchette : +1 rep, charge inchangée', () => {
    const seances = [seanceSalle('2026-01-12', presse, 50, 10, 7)];
    const cible = prochaineCible(seances, presse, { date });
    expect(cible.reps).toBe(11);
    expect(cible.chargeKg).toBe(50);
    expect(cible.raison).toContain('+1 rep');
  });

  it('haut de fourchette atteint, bas du corps : +min(5 kg, 5 %) et retour bas de fourchette', () => {
    // 5 % de 50 kg = 2,5 kg < 5 kg → +2,5 kg.
    const seances = [seanceSalle('2026-01-12', presse, 50, 12, 7)];
    const cible = prochaineCible(seances, presse, { date });
    expect(cible.chargeKg).toBe(52.5);
    expect(cible.reps).toBe(8);
  });

  it('bas du corps, charge lourde : l’incrément est plafonné à 5 kg', () => {
    // 5 % de 120 kg = 6 kg > 5 kg → +5 kg.
    const seances = [seanceSalle('2026-01-12', presse, 120, 12, 7)];
    const cible = prochaineCible(seances, presse, { date });
    expect(cible.chargeKg).toBe(125);
  });

  it('haut du corps : +min(2,5 kg, 2,5 %), arrondi au demi-kilo (micro-charge)', () => {
    // 2,5 % de 15 kg = 0,375 kg → arrondi/plancher à 0,5 kg.
    const seances = [seanceSalle('2026-01-12', developpe, 15, 12, 7)];
    const cible = prochaineCible(seances, developpe, { date });
    expect(cible.chargeKg).toBe(15.5);
    expect(cible.reps).toBe(8);
  });

  it('séance difficile (RPE > 8) : on consolide la même cible, aucun incrément', () => {
    const seances = [seanceSalle('2026-01-12', presse, 50, 12, 9)];
    const cible = prochaineCible(seances, presse, { date });
    expect(cible.chargeKg).toBe(50);
    expect(cible.reps).toBe(12);
    expect(cible.raison).toContain('RPE 9');
  });

  it('ralentir_progression actif : aucun incrément de charge au haut de fourchette', () => {
    const seances = [seanceSalle('2026-01-12', presse, 50, 12, 7)];
    const cible = prochaineCible(seances, presse, { date, ralentirProgression: true });
    expect(cible.chargeKg).toBe(50);
    expect(cible.reps).toBe(12);
  });

  it('ralentir_progression actif : la progression de reps reste permise', () => {
    const seances = [seanceSalle('2026-01-12', presse, 50, 10, 7)];
    const cible = prochaineCible(seances, presse, { date, ralentirProgression: true });
    expect(cible.reps).toBe(11);
    expect(cible.chargeKg).toBe(50);
  });

  it('gainage : exclu de la progression de charge', () => {
    const seances = [seanceSalle('2026-01-12', presse, 50, 10, 7)];
    const cible = prochaineCible(seances, gainage, { date });
    expect(cible.chargeKg).toBeNull();
    expect(cible.reps).toBe(30);
  });

  it('chaque raison est rédigée en français avec les chiffres de la cible', () => {
    const seances = [seanceSalle('2026-01-12', presse, 50, 12, 7)];
    const cible = prochaineCible(seances, presse, { date });
    expect(cible.raison).toContain('52.5');
  });
});

describe('prochaineCible — plateau', () => {
  const date = '2026-01-29';

  it('3 séances consécutives sans progression ⇒ décharge ciblée −10 % proposée', () => {
    const seances = [
      seanceSalle('2026-01-05', presse, 50, 10, 7), // référence
      seanceSalle('2026-01-12', presse, 50, 10, 7), // stagnation 1
      seanceSalle('2026-01-19', presse, 50, 10, 7), // stagnation 2
      seanceSalle('2026-01-26', presse, 50, 10, 7), // stagnation 3
    ];
    const cible = prochaineCible(seances, presse, { date });
    expect(cible.plateau).toBe(true);
    expect(cible.chargeKg).toBe(45);
    expect(cible.raison).toContain('Plateau');
  });

  it('une progression de rep dans la fenêtre annule le plateau', () => {
    const seances = [
      seanceSalle('2026-01-05', presse, 50, 10, 7),
      seanceSalle('2026-01-12', presse, 50, 10, 7),
      seanceSalle('2026-01-19', presse, 50, 11, 7), // a progressé
      seanceSalle('2026-01-26', presse, 50, 11, 7),
    ];
    const cible = prochaineCible(seances, presse, { date });
    expect(cible.plateau).toBe(false);
  });

  it('estEnPlateau exige assez d’historique (n+1 séances)', () => {
    const h = historiqueExercice(
      [
        seanceSalle('2026-01-12', presse, 50, 10, 7),
        seanceSalle('2026-01-19', presse, 50, 10, 7),
        seanceSalle('2026-01-26', presse, 50, 10, 7),
      ],
      presse.nom,
    );
    expect(estEnPlateau(h)).toBe(false);
  });
});

describe('prochaineCible — reprise après absence', () => {
  it('14 j sans salle ⇒ −20 % sur la dernière charge, bas de fourchette', () => {
    const seances = [seanceSalle('2026-01-01', presse, 50, 12, 7)];
    const cible = prochaineCible(seances, presse, { date: '2026-01-15' });
    expect(cible.chargeKg).toBe(40);
    expect(cible.reps).toBe(8);
    expect(cible.raison).toContain('Reprise');
  });

  it('absence très longue ⇒ réduction plafonnée à −30 %', () => {
    const seances = [seanceSalle('2026-01-01', presse, 50, 12, 7)];
    const cible = prochaineCible(seances, presse, { date: '2026-03-01' });
    expect(cible.chargeKg).toBe(35);
  });

  it('une séance de salle récente (autre exercice) neutralise la reprise', () => {
    const seances = [
      seanceSalle('2026-01-01', presse, 50, 10, 7),
      seanceSalle('2026-01-12', developpe, 15, 8, 7), // salle B il y a 3 jours
    ];
    const cible = prochaineCible(seances, presse, { date: '2026-01-15' });
    expect(cible.raison).not.toContain('Reprise');
    expect(cible.reps).toBe(11); // progression normale : +1 rep
  });

  it('une séance de course ne compte pas comme présence en salle', () => {
    const course: SeanceRealisee = {
      id: 'c1',
      date: '2026-01-12',
      type: 'course',
      variante: 'normale',
      rpe: 5,
      dureeMin: 35,
    };
    const seances = [seanceSalle('2026-01-01', presse, 50, 10, 7), course];
    const cible = prochaineCible(seances, presse, { date: '2026-01-15' });
    expect(cible.raison).toContain('Reprise');
  });
});
