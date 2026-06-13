import { genererBilanHebdo } from '@/domaine/bilanHebdo';
import { ajouterJours } from '@/domaine/dates';
import type { ChargeExercice, EntreeJournal, SeanceRealisee } from '@/domaine/types';
import { describe, expect, it } from 'vitest';

const FIN = '2026-06-28';

function entree(date: string, douleur: number, energie = 4): EntreeJournal {
  return { date, douleur, energie, digestion: 4, nbSelles: 1, ballonnements: false, tags: [] };
}

function course(date: string, rpe: number, dureeMin: number): SeanceRealisee {
  return { id: date + rpe, date, type: 'course', variante: 'normale', rpe, dureeMin };
}

function salle(date: string, charges: ChargeExercice[]): SeanceRealisee {
  return {
    id: `${date}s`,
    date,
    type: 'salle',
    variante: 'normale',
    rpe: 7,
    dureeMin: 60,
    charges,
  };
}

describe('genererBilanHebdo — charge', () => {
  it('somme le sRPE de la semaine et calcule l’ACWR', () => {
    const seances = Array.from({ length: 5 }, (_, i) => course(ajouterJours(FIN, -i * 7), 6, 60)); // une séance/semaine sur 5 semaines, 360 sRPE chacune
    const b = genererBilanHebdo([], seances, FIN);
    expect(b.charge.srpe).toBe(360);
    expect(b.charge.vsMoyenne4Semaines).toBeCloseTo(1, 5); // 360 / (1440/4)
    expect(b.finSemaine).toBe(FIN);
  });

  it('ACWR null tant que l’historique est court (< 21 j)', () => {
    const b = genererBilanHebdo([], [course(FIN, 6, 60)], FIN);
    expect(b.charge.acwr).toBeNull();
    expect(b.charge.zone).toBeNull();
  });
});

describe('genererBilanHebdo — santé', () => {
  it('moyenne le score, compte les jours dégradés, décide un ajustement', () => {
    // 4 jours très dégradés (douleur 9) cette semaine → score bas, ≥ 3 jours dégradés.
    const journal = [0, 1, 2, 3].map((d) => entree(ajouterJours(FIN, -d), 9, 1));
    const b = genererBilanHebdo(journal, [], FIN);
    expect(b.sante.scoreMoyen).not.toBeNull();
    expect(b.sante.joursDegrades).toBeGreaterThanOrEqual(3);
    expect(b.decision).toBe('ajustement_propose');
  });

  it('semaine saine ⇒ décision « telle que prévue »', () => {
    const journal = [0, 1, 2].map((d) => entree(ajouterJours(FIN, -d), 0, 5));
    const b = genererBilanHebdo(journal, [], FIN);
    expect(b.sante.joursDegrades).toBe(0);
    expect(b.decision).toBe('tel_que_prevu');
  });

  it('tendance douleur en hausse vs la semaine précédente', () => {
    const semainePrecedente = [7, 8, 9].map((d) => entree(ajouterJours(FIN, -d), 1));
    const semaineCourante = [0, 1, 2].map((d) => entree(ajouterJours(FIN, -d), 5));
    const b = genererBilanHebdo([...semainePrecedente, ...semaineCourante], [], FIN);
    expect(b.sante.tendanceDouleur).toBe('hausse');
  });

  it('tendance null si la semaine précédente est vide', () => {
    const journal = [0, 1].map((d) => entree(ajouterJours(FIN, -d), 2));
    expect(genererBilanHebdo(journal, [], FIN).sante.tendanceDouleur).toBeNull();
  });
});

describe('genererBilanHebdo — progression & insight', () => {
  it('liste les records de salle établis cette semaine', () => {
    const seances = [salle(FIN, [{ exercice: 'squat', series: 3, reps: 10, chargeKg: 80 }])];
    const b = genererBilanHebdo([], seances, FIN);
    expect(b.progression.recordsBattus.some((r) => r.includes('squat'))).toBe(true);
  });

  it('sans corrélation significative, l’insight retombe sur la charge (ou null)', () => {
    const b = genererBilanHebdo([], [course(FIN, 6, 60)], FIN);
    // ACWR null ici → zone null → pas d'insight de charge, pas de corrélation.
    expect(b.insight).toBeNull();
  });
});
