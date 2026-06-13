import type { Baseline } from '@/domaine/baseline';
import { calculerScoreForme, niveauSeanceSelonScore } from '@/domaine/scoreForme';
import type { EntreeJournal } from '@/domaine/types';
import { describe, expect, it } from 'vitest';

function entree(p: Partial<EntreeJournal> = {}): EntreeJournal {
  return {
    date: '2026-07-01',
    douleur: 0,
    energie: 5,
    digestion: 5,
    nbSelles: 1,
    ballonnements: false,
    tags: [],
    ...p,
  };
}

const baseline = (valeur: number, mad = 0): Baseline => ({ valeur, mad, nbEntrees: 14 });

describe('calculerScoreForme', () => {
  it('journée parfaite, ACWR optimal ⇒ 100', () => {
    const { score } = calculerScoreForme({ entree: entree(), baseline: null, acwr: 1.0 });
    expect(score).toBe(100);
  });

  it('ACWR null ⇒ composante charge neutre (pas de pénalité)', () => {
    const sansAcwr = calculerScoreForme({ entree: entree(), baseline: null, acwr: null }).score;
    const acwrOptimal = calculerScoreForme({ entree: entree(), baseline: null, acwr: 1.0 }).score;
    expect(sansAcwr).toBe(acwrOptimal);
    expect(sansAcwr).toBe(100);
  });

  it('douleur jugée vs baseline, pas dans l’absolu', () => {
    // Douleur 5 sur une baseline 2 : sous-score douleur = 1 − (5−2)/6 = 0,5.
    const ref = calculerScoreForme({
      entree: entree({ douleur: 5 }),
      baseline: baseline(2),
      acwr: null,
    });
    const douleurComp = ref.composantes.find((c) => c.cle === 'douleur');
    expect(douleurComp?.sousScore).toBeCloseTo(0.5, 5);
    // Sur une baseline élevée (5), la même douleur 5 ne pèse plus rien (sous-score 1).
    const haute = calculerScoreForme({
      entree: entree({ douleur: 5 }),
      baseline: baseline(5),
      acwr: null,
    });
    expect(haute.composantes.find((c) => c.cle === 'douleur')?.sousScore).toBe(1);
  });

  it('la surcharge (ACWR élevé) pénalise la composante charge', () => {
    const optimal = calculerScoreForme({ entree: entree(), baseline: null, acwr: 1.0 }).score;
    const surcharge = calculerScoreForme({ entree: entree(), baseline: null, acwr: 1.8 }).score;
    expect(surcharge).toBeLessThan(optimal);
  });

  it('la décomposition somme exactement au score (arrondi près)', () => {
    const { score, composantes } = calculerScoreForme({
      entree: entree({ douleur: 3, energie: 3, digestion: 4 }),
      baseline: baseline(1),
      acwr: 0.9,
    });
    const somme = composantes.reduce((acc, c) => acc + c.points, 0);
    expect(Math.round(somme)).toBe(score);
    // Les poids restent fidèles au barème 35/25/15/25.
    expect(composantes.map((c) => c.poids)).toEqual([0.35, 0.25, 0.15, 0.25]);
  });
});

describe('niveauSeanceSelonScore — 4 niveaux gradués', () => {
  it('respecte les bornes 75 / 50 / 30', () => {
    expect(niveauSeanceSelonScore(75)).toBe('normale');
    expect(niveauSeanceSelonScore(74)).toBe('moderee');
    expect(niveauSeanceSelonScore(50)).toBe('moderee');
    expect(niveauSeanceSelonScore(49)).toBe('allegee');
    expect(niveauSeanceSelonScore(30)).toBe('allegee');
    expect(niveauSeanceSelonScore(29)).toBe('repos');
  });
});
