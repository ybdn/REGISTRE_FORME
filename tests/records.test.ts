import { ajouterJours } from '@/domaine/dates';
import {
  calculerRecords,
  epley,
  meilleurs1RM,
  recordsCourse,
  serieJournal,
} from '@/domaine/records';
import type { ChargeExercice, EntreeJournal, SeanceRealisee } from '@/domaine/types';
import { describe, expect, it } from 'vitest';

function seanceSalle(date: string, charges: ChargeExercice[]): SeanceRealisee {
  return { id: date, date, type: 'salle', variante: 'normale', rpe: 7, dureeMin: 60, charges };
}

function seanceCourse(
  date: string,
  distanceKm: number,
  tempsSec: number,
  dureeMin: number,
): SeanceRealisee {
  return {
    id: date,
    date,
    type: 'course',
    variante: 'normale',
    rpe: 6,
    dureeMin,
    distanceKm,
    tempsSec,
  };
}

describe('epley', () => {
  it('estime le 1RM par la formule charge × (1 + reps/30)', () => {
    expect(epley(100, 0)).toBe(100);
    expect(epley(60, 30)).toBe(120);
    expect(epley(50, 12)).toBe(70); // 50 × 1,4
  });

  it('met 50×12 et 55×8 sur une même échelle comparable', () => {
    // 50 × 1,4 = 70 ; 55 × 1,2667 ≈ 69,7 → 50×12 estimé légèrement plus lourd.
    expect(epley(50, 12)).toBeCloseTo(70, 1);
    expect(epley(55, 8)).toBeCloseTo(69.7, 1);
    expect(epley(50, 12)).toBeGreaterThan(epley(55, 8));
  });
});

describe('meilleurs1RM', () => {
  it('retient la meilleure performance par exercice, plus lourde d’abord', () => {
    const seances = [
      seanceSalle('2026-06-01', [{ exercice: 'squat', series: 3, reps: 10, chargeKg: 60 }]),
      seanceSalle('2026-06-08', [{ exercice: 'squat', series: 3, reps: 8, chargeKg: 70 }]),
      seanceSalle('2026-06-08', [{ exercice: 'développé', series: 3, reps: 10, chargeKg: 40 }]),
    ];
    const res = meilleurs1RM(seances);
    expect(res[0]?.exercice).toBe('squat');
    expect(res[0]?.chargeKg).toBe(70);
    expect(res[0]?.reps).toBe(8);
    expect(res.map((r) => r.exercice)).toEqual(['squat', 'développé']);
  });

  it('à 1RM égal, garde la date la plus ancienne (record établi en premier)', () => {
    const seances = [
      seanceSalle('2026-06-10', [{ exercice: 'squat', series: 1, reps: 10, chargeKg: 60 }]),
      seanceSalle('2026-06-01', [{ exercice: 'squat', series: 1, reps: 10, chargeKg: 60 }]),
    ];
    expect(meilleurs1RM(seances)[0]?.date).toBe('2026-06-01');
  });

  it('ignore les charges nulles ou poids du corps (0 kg)', () => {
    const seances = [
      seanceSalle('2026-06-01', [{ exercice: 'gainage', series: 3, reps: 0, chargeKg: 0 }]),
    ];
    expect(meilleurs1RM(seances)).toEqual([]);
  });
});

describe('recordsCourse', () => {
  it('retient le meilleur chrono sur ~3000 m (tolérance ±100 m)', () => {
    const seances = [
      seanceCourse('2026-06-01', 3.0, 900, 15), // 3000 m en 15:00
      seanceCourse('2026-06-08', 3.05, 840, 14), // 3000 m en 14:00 → record
      seanceCourse('2026-06-15', 5.0, 1500, 25), // pas un 3000 m
    ];
    const r = recordsCourse(seances);
    expect(r.meilleur3000?.tempsSec).toBe(840);
    expect(r.meilleur3000?.date).toBe('2026-06-08');
  });

  it('retient la plus longue sortie toutes distances confondues', () => {
    const seances = [
      seanceCourse('2026-06-01', 5, 1800, 30),
      seanceCourse('2026-06-08', 12, 4800, 80),
    ];
    expect(recordsCourse(seances).plusLongueSortie?.distanceKm).toBe(12);
  });

  it('retient la meilleure allure EF tenue ≥ 30 min (ignore les sorties courtes plus rapides)', () => {
    const seances = [
      seanceCourse('2026-06-01', 2, 480, 8), // 4:00/km mais seulement 8 min → exclue
      seanceCourse('2026-06-08', 8, 2400, 40), // 5:00/km sur 40 min
      seanceCourse('2026-06-15', 10, 2850, 47), // 4:45/km sur 47 min → record EF
    ];
    const r = recordsCourse(seances);
    expect(r.meilleureAllureEF?.date).toBe('2026-06-15');
    expect(r.meilleureAllureEF?.allureMinKm).toBeCloseTo(4.75, 2);
  });

  it('renvoie un objet vide sans donnée de course exploitable', () => {
    expect(recordsCourse([seanceSalle('2026-06-01', [])])).toEqual({});
  });
});

describe('serieJournal', () => {
  const fin = '2026-06-28';

  it('compte la plus longue série et la série en cours', () => {
    // 10 jours consécutifs se terminant à `fin`.
    const journal: EntreeJournal[] = Array.from({ length: 10 }, (_, i) => ({
      date: ajouterJours(fin, -i),
      douleur: 1,
      energie: 4,
      digestion: 4,
      nbSelles: 1,
      consistanceSelles: 4,
      sangSelles: false,
      glaires: false,
      urgenceFecale: false,
      difficulteEvacuation: false,
      ballonnements: false,
      tags: [],
    }));
    const s = serieJournal(journal, fin);
    expect(s.actuelle).toBe(10);
    expect(s.record).toBe(10);
  });

  it('série en cours = 0 si rien saisi le jour évalué, record préservé', () => {
    const journal: EntreeJournal[] = Array.from({ length: 5 }, (_, i) => ({
      date: ajouterJours(fin, -3 - i), // se termine 3 jours avant `fin`
      douleur: 1,
      energie: 4,
      digestion: 4,
      nbSelles: 1,
      consistanceSelles: 4,
      sangSelles: false,
      glaires: false,
      urgenceFecale: false,
      difficulteEvacuation: false,
      ballonnements: false,
      tags: [],
    }));
    const s = serieJournal(journal, fin);
    expect(s.actuelle).toBe(0);
    expect(s.record).toBe(5);
  });

  it('un trou casse la série (stricte, sans grâce)', () => {
    const dates = [
      ajouterJours(fin, 0),
      ajouterJours(fin, -1),
      ajouterJours(fin, -3), // trou au jour -2
      ajouterJours(fin, -4),
      ajouterJours(fin, -5),
    ];
    const journal: EntreeJournal[] = dates.map((date) => ({
      date,
      douleur: 1,
      energie: 4,
      digestion: 4,
      nbSelles: 1,
      consistanceSelles: 4,
      sangSelles: false,
      glaires: false,
      urgenceFecale: false,
      difficulteEvacuation: false,
      ballonnements: false,
      tags: [],
    }));
    const s = serieJournal(journal, fin);
    expect(s.actuelle).toBe(2); // fin et fin-1
    expect(s.record).toBe(3); // fin-3, fin-4, fin-5
  });

  it('journal vide → séries nulles', () => {
    expect(serieJournal([], fin)).toEqual({ actuelle: 0, record: 0 });
  });
});

describe('calculerRecords', () => {
  it('agrège salle, course, total et série journal', () => {
    const seances = [
      seanceSalle('2026-06-01', [{ exercice: 'squat', series: 3, reps: 10, chargeKg: 60 }]),
      seanceCourse('2026-06-08', 3, 900, 15),
    ];
    const journal: EntreeJournal[] = [
      {
        date: '2026-06-08',
        douleur: 1,
        energie: 4,
        digestion: 4,
        nbSelles: 1,
        consistanceSelles: 4,
        sangSelles: false,
        glaires: false,
        urgenceFecale: false,
        difficulteEvacuation: false,
        ballonnements: false,
        tags: [],
      },
    ];
    const r = calculerRecords(seances, journal, '2026-06-08');
    expect(r.totalSeances).toBe(2);
    expect(r.salle).toHaveLength(1);
    expect(r.course.meilleur3000).toBeDefined();
    expect(r.serieJournal.actuelle).toBe(1);
  });
});
