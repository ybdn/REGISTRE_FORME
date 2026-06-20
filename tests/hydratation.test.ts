import {
  type ContexteHydratation,
  avertissementHydratationAvantEffort,
  calculerBilanHydrique,
  formaterVolume,
  profilBoisson,
} from '@/domaine/hydratation';
import type { PriseHydrique, SeanceRealisee } from '@/domaine/types';
import { describe, expect, it } from 'vitest';

const DATE = '2026-06-20';

function prise(boisson: string, volumeMl: number): PriseHydrique {
  return { boisson, volumeMl };
}

function seance(rpe: number, dureeMin: number): SeanceRealisee {
  return {
    id: `s-${rpe}-${dureeMin}`,
    date: DATE,
    type: 'course',
    variante: 'normale',
    rpe,
    dureeMin,
  };
}

function ctx(p: Partial<ContexteHydratation> = {}): ContexteHydratation {
  return {
    date: DATE,
    prises: [],
    poidsKg: null,
    nbSelles: null,
    seancesDuJour: [],
    ...p,
  };
}

describe('profilBoisson', () => {
  it('renvoie le profil du catalogue pour une boisson connue', () => {
    expect(profilBoisson('café').cafeineMgParLitre).toBeGreaterThan(0);
    expect(profilBoisson('eau').coeffHydrique).toBe(1);
    expect(profilBoisson('lait').coeffHydrique).toBeGreaterThan(1);
  });

  it('normalise la casse et les espaces', () => {
    expect(profilBoisson('  Café ').cle).toBe('café');
  });

  it('traite une boisson inconnue comme de l’eau (coeff 1, sans caféine ni alcool)', () => {
    const p = profilBoisson('kombucha maison');
    expect(p.coeffHydrique).toBe(1);
    expect(p.cafeineMgParLitre).toBe(0);
    expect(p.alcoolGParLitre).toBe(0);
  });
});

describe('formaterVolume', () => {
  it('affiche les mL sous 1 L', () => {
    expect(formaterVolume(750)).toBe('750 mL');
  });
  it('passe aux litres avec virgule au-delà de 1 L', () => {
    expect(formaterVolume(1800)).toBe('1,8 L');
  });
});

describe('calculerBilanHydrique — apports pondérés', () => {
  it('compte 1:1 pour l’eau (coeff 1)', () => {
    const b = calculerBilanHydrique(ctx({ prises: [prise('eau', 1000)] }));
    expect(b.apportsBrutsMl).toBe(1000);
    expect(b.eauEquivalenteMl).toBe(1000);
    expect(b.apportNetMl).toBe(1000);
  });

  it('valorise le lait au-dessus de l’eau (coeff 1,5)', () => {
    const b = calculerBilanHydrique(ctx({ prises: [prise('lait', 1000)] }));
    expect(b.eauEquivalenteMl).toBe(1500);
  });

  it('journée vide → apport net nul', () => {
    const b = calculerBilanHydrique(ctx());
    expect(b.apportNetMl).toBe(0);
    expect(b.statut).toBe('deshydratation');
  });
});

describe('calculerBilanHydrique — dette diurétique (le cœur « intelligent »)', () => {
  it('1 à 2 cafés ne sont PAS pénalisés (sous le seuil de caféine)', () => {
    // 2 cafés de 100 mL = 160 mg de caféine < 300 mg → aucune dette.
    const b = calculerBilanHydrique(ctx({ prises: [prise('café', 100), prise('café', 100)] }));
    expect(b.detteCafeineMl).toBe(0);
  });

  it('une grosse dose de caféine crée une dette au-delà du seuil', () => {
    // 500 mL de café = 400 mg → (400 − 300) × 1 = 100 mL de dette.
    const b = calculerBilanHydrique(ctx({ prises: [prise('café', 500)] }));
    expect(b.detteCafeineMl).toBe(100);
  });

  it('l’alcool coûte de l’eau dès le premier verre', () => {
    const b = calculerBilanHydrique(ctx({ prises: [prise('bière', 330)] }));
    expect(b.detteAlcoolMl).toBeGreaterThan(50);
    // L'apport net d'une bière reste positif mais réduit par la diurèse.
    expect(b.apportNetMl).toBeLessThan(b.eauEquivalenteMl);
  });

  it('les spiritueux peuvent rendre l’apport net quasi nul', () => {
    const b = calculerBilanHydrique(ctx({ prises: [prise('spiritueux', 40)] }));
    expect(b.detteAlcoolMl).toBeGreaterThan(b.eauEquivalenteMl - 30);
  });
});

describe('calculerBilanHydrique — objectif adaptatif', () => {
  it('le poids fixe le besoin de base (~33 mL/kg)', () => {
    const b = calculerBilanHydrique(ctx({ poidsKg: 70 }));
    expect(b.besoinBaseMl).toBe(Math.round(70 * 33));
    expect(b.objectifMl).toBe(b.besoinBaseMl);
  });

  it('applique le plancher pour un poids faible', () => {
    const b = calculerBilanHydrique(ctx({ poidsKg: 40 }));
    expect(b.besoinBaseMl).toBe(1500); // 40×33 = 1320 < plancher
  });

  it('objectif par défaut sans poids connu', () => {
    expect(calculerBilanHydrique(ctx()).besoinBaseMl).toBe(2000);
  });

  it('relève l’objectif selon les selles MICI au-delà de la normale', () => {
    const sans = calculerBilanHydrique(ctx({ poidsKg: 70, nbSelles: 2 }));
    const avec = calculerBilanHydrique(ctx({ poidsKg: 70, nbSelles: 8 }));
    // 6 selles de plus × 150 mL = 900 mL.
    expect(avec.pertesDigestivesMl).toBe(900);
    expect(avec.objectifMl - sans.objectifMl).toBe(900);
  });

  it('relève l’objectif selon la sudation des séances (RPE × durée)', () => {
    const b = calculerBilanHydrique(ctx({ poidsKg: 70, seancesDuJour: [seance(9, 60)] }));
    // RPE 9 = 18 mL/min × 60 = 1080 mL.
    expect(b.pertesActiviteMl).toBe(1080);
  });

  it('un effort plus intense coûte plus qu’un effort léger à durée égale', () => {
    const leger = calculerBilanHydrique(ctx({ seancesDuJour: [seance(2, 60)] }));
    const intense = calculerBilanHydrique(ctx({ seancesDuJour: [seance(9, 60)] }));
    expect(intense.pertesActiviteMl).toBeGreaterThan(leger.pertesActiviteMl);
  });
});

describe('calculerBilanHydrique — statut et reste', () => {
  it('atteint l’objectif → statut ok, reste nul', () => {
    const b = calculerBilanHydrique(ctx({ poidsKg: 60, prises: [prise('eau', 2000)] }));
    expect(b.objectifMl).toBe(1980);
    expect(b.statut).toBe('ok');
    expect(b.resteMl).toBe(0);
  });

  it('à mi-chemin → statut à boire avec un reste positif', () => {
    const b = calculerBilanHydrique(ctx({ poidsKg: 60, prises: [prise('eau', 1400)] }));
    expect(b.statut).toBe('a-boire');
    expect(b.resteMl).toBeGreaterThan(0);
  });

  it('la raison cite les ajustements et le reste à boire', () => {
    const b = calculerBilanHydrique(
      ctx({
        poidsKg: 70,
        nbSelles: 6,
        seancesDuJour: [seance(7, 45)],
        prises: [prise('eau', 500)],
      }),
    );
    expect(b.raison).toContain('selle');
    expect(b.raison).toContain("min d'effort");
    expect(b.raison).toContain('Reste');
  });
});

describe('avertissementHydratationAvantEffort — garde-fou', () => {
  it('avertit quand l’apport net est très en retard sur l’objectif', () => {
    const b = calculerBilanHydrique(ctx({ poidsKg: 70, prises: [prise('eau', 200)] }));
    const msg = avertissementHydratationAvantEffort(b);
    expect(msg).not.toBeNull();
    expect(msg).toContain('%');
  });

  it('ne dit rien quand l’hydratation est suffisante', () => {
    const b = calculerBilanHydrique(ctx({ poidsKg: 70, prises: [prise('eau', 2000)] }));
    expect(avertissementHydratationAvantEffort(b)).toBeNull();
  });
});
