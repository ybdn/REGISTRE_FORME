import { acwr, contrainte, monotonie, zoneACWR } from '@/domaine/chargeEntrainement';
import { ajouterJours } from '@/domaine/dates';
import type { SeanceRealisee } from '@/domaine/types';
import { describe, expect, it } from 'vitest';

function seance(date: string, rpe: number, dureeMin: number): SeanceRealisee {
  return {
    id: `${date}-${rpe}-${dureeMin}`,
    date,
    type: 'course',
    variante: 'normale',
    rpe,
    dureeMin,
  };
}

const REF = '2026-07-01';

describe('acwr — démarrage à froid', () => {
  it('null tant que l’historique couvre moins de 21 jours', () => {
    const s = [
      seance(ajouterJours(REF, -14), 5, 10),
      seance(ajouterJours(REF, -7), 5, 10),
      seance(REF, 5, 10),
    ]; // amplitude = 15 jours < 21
    expect(acwr(s, REF)).toBeNull();
  });

  it('null sans aucune séance', () => {
    expect(acwr([], REF)).toBeNull();
  });
});

describe('acwr — calcul', () => {
  it('ACWR = charge aiguë / moyenne hebdo chronique', () => {
    // 4 séances hebdo, charges 50/50/50/200 → chronique = 350/4 = 87,5 ; aiguë (7 j) = 200.
    const s = [
      seance(ajouterJours(REF, -21), 5, 10), // 50
      seance(ajouterJours(REF, -14), 5, 10), // 50
      seance(ajouterJours(REF, -8), 5, 10), // 50 (hors fenêtre aiguë)
      seance(REF, 10, 20), // 200 (dans la fenêtre aiguë)
    ];
    const r = acwr(s, REF);
    expect(r).not.toBeNull();
    expect(r as number).toBeCloseTo(200 / 87.5, 5);
  });

  it('ACWR = 1 quand charge aiguë = moyenne chronique', () => {
    const s = [
      seance(ajouterJours(REF, -21), 5, 10),
      seance(ajouterJours(REF, -14), 5, 10),
      seance(ajouterJours(REF, -7), 5, 10),
      seance(REF, 5, 10),
    ];
    expect(acwr(s, REF) as number).toBeCloseTo(1, 5);
  });
});

describe('monotonie (Foster)', () => {
  it('null sans charge sur la fenêtre', () => {
    expect(monotonie([], REF)).toBeNull();
  });

  it('null quand toutes les journées sont identiques (écart-type nul)', () => {
    const s = Array.from({ length: 7 }, (_, i) => seance(ajouterJours(REF, -i), 5, 10));
    expect(monotonie(s, REF)).toBeNull();
  });

  it('élevée quand une seule grosse séance côtoie des jours de repos', () => {
    const s = [seance(REF, 10, 60)]; // 1 jour chargé, 6 jours à 0
    const m = monotonie(s, REF);
    expect(m).not.toBeNull();
    // moyenne = 600/7 ; écart-type d'un dirac sur 7 cases = moyenne·√6 ⇒ monotonie = 1/√6 ≈ 0,408.
    expect(m as number).toBeCloseTo(1 / Math.sqrt(6), 4);
  });
});

describe('contrainte (strain)', () => {
  it('= charge hebdo × monotonie', () => {
    const s = [seance(REF, 10, 60), seance(ajouterJours(REF, -3), 6, 30)];
    const m = monotonie(s, REF) as number;
    const c = contrainte(s, REF) as number;
    expect(c).toBeCloseTo((600 + 180) * m, 4);
  });

  it('null quand la monotonie l’est', () => {
    expect(contrainte([], REF)).toBeNull();
  });
});

describe('zoneACWR', () => {
  it('classe correctement chaque zone', () => {
    expect(zoneACWR(null)).toBeNull();
    expect(zoneACWR(0.5)).toBe('sous_charge');
    expect(zoneACWR(1.0)).toBe('optimale');
    expect(zoneACWR(1.4)).toBe('vigilance');
    expect(zoneACWR(1.8)).toBe('risque');
  });
});
