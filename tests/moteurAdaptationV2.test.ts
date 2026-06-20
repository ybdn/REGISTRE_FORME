import type { Baseline } from '@/domaine/baseline';
import { ajouterJours } from '@/domaine/dates';
import { estJourDegrade, evaluerAdaptation } from '@/domaine/moteurAdaptation';
import type { EntreeJournal, SeanceRealisee } from '@/domaine/types';
import { describe, expect, it } from 'vitest';

function journal(date: string, p: Partial<EntreeJournal> = {}): EntreeJournal {
  return {
    date,
    douleur: 0,
    energie: 5,
    digestion: 5,
    nbSelles: 1,
    consistanceSelles: 4,
    sangSelles: false,
    glaires: false,
    urgenceFecale: false,
    difficulteEvacuation: false,
    ballonnements: false,
    tags: [],
    ...p,
  };
}

function seance(date: string, rpe: number, dureeMin = 50): SeanceRealisee {
  return {
    id: `${date}-${rpe}-${dureeMin}`,
    date,
    type: 'course',
    variante: 'normale',
    rpe,
    dureeMin,
  };
}

const baseline = (valeur: number, mad = 0): Baseline => ({ valeur, mad, nbEntrees: 14 });
const REF = '2026-07-01';

// ── §2.1 estJourDegrade v2 : garde-fous absolus + seuil relatif ──────────────

describe('estJourDegrade v2 — garde-fous absolus jamais désactivés', () => {
  it('douleur 7 avec baseline 6 ⇒ dégradé (plafond MICI absolu)', () => {
    expect(estJourDegrade(journal(REF, { douleur: 7 }), baseline(6))).toBe(true);
  });

  it('une baseline élevée ne relève jamais le plafond absolu de douleur', () => {
    // Même avec une baseline « tolérante » à 6, douleur 7 et énergie 2 restent dégradées.
    expect(estJourDegrade(journal(REF, { douleur: 7 }), baseline(6))).toBe(true);
    expect(estJourDegrade(journal(REF, { douleur: 0, energie: 2 }), baseline(6))).toBe(true);
  });

  it('seuil relatif : la personnalisation AJOUTE des déclenchements', () => {
    // Douleur 4 n'est pas dégradée dans l'absolu (v1)…
    expect(estJourDegrade(journal(REF, { douleur: 4 }))).toBe(false);
    // …mais l'est face à une normale personnelle à 2 (seuil relatif = 2 + 2 = 4).
    expect(estJourDegrade(journal(REF, { douleur: 4 }), baseline(2))).toBe(true);
  });

  it('baseline élevée : l’ancien seuil 5 se relâche (douleur de fond chronique)', () => {
    // Baseline 4 (≥ 3) ⇒ le seuil absolu douleur ≥ 5 ne s'applique plus, seuil relatif = 6.
    expect(estJourDegrade(journal(REF, { douleur: 5 }), baseline(4))).toBe(false);
    // Le garde-fou 7 reste actif malgré tout.
    expect(estJourDegrade(journal(REF, { douleur: 7 }), baseline(4))).toBe(true);
  });

  it('sans baseline (démarrage à froid) : comportement v1 strict', () => {
    expect(estJourDegrade(journal(REF, { douleur: 5 }))).toBe(true);
    expect(estJourDegrade(journal(REF, { douleur: 4 }))).toBe(false);
  });
});

// ── §2.3 ACWR : règle lisser_charge et neutralité du démarrage à froid ───────

describe('evaluerAdaptation v2 — règle lisser_charge', () => {
  it('ACWR > 1,5 ⇒ lisser_charge, raison citant l’ACWR', () => {
    const seances = [
      seance(ajouterJours(REF, -21), 5, 10),
      seance(ajouterJours(REF, -14), 5, 10),
      seance(ajouterJours(REF, -8), 5, 10),
      seance(REF, 10, 20), // pic de charge récent ⇒ ACWR ≈ 2,3
    ];
    const a = evaluerAdaptation({ date: REF, journal: [], seances });
    expect(a.type).toBe('lisser_charge');
    expect(a.raison).toContain('ACWR');
    expect(a.niveauSeance).toBe('moderee');
  });

  it('ACWR null (< 21 j) ⇒ jamais lisser_charge, même charge récente forte', () => {
    const seances = [seance(ajouterJours(REF, -1), 10, 60), seance(REF, 10, 60)];
    const a = evaluerAdaptation({ date: REF, journal: [], seances });
    expect(a.type).not.toBe('lisser_charge');
  });
});

describe('evaluerAdaptation v2 — feu vert enrichi par l’ACWR', () => {
  it('progression normale exige ACWR ≤ 1,3 (raison citant l’ACWR)', () => {
    const seances = [
      seance(ajouterJours(REF, -21), 5, 10),
      seance(ajouterJours(REF, -14), 5, 10),
      seance(ajouterJours(REF, -7), 5, 10),
      seance(REF, 5, 10), // charge stable ⇒ ACWR ≈ 1,0
    ];
    const j = [journal(ajouterJours(REF, -1), { douleur: 1 }), journal(REF, { douleur: 1 })];
    const a = evaluerAdaptation({ date: REF, journal: j, seances });
    expect(a.type).toBe('progression_normale');
    expect(a.raison).toContain('ACWR');
  });

  it('ACWR en zone de vigilance (1,3 < x ≤ 1,5) bloque le feu vert sans lisser', () => {
    const seances = [
      seance(ajouterJours(REF, -21), 5, 10),
      seance(ajouterJours(REF, -14), 5, 10),
      seance(ajouterJours(REF, -8), 5, 10),
      seance(REF, 8, 10), // ACWR ≈ 1,39
    ];
    const j = [journal(REF, { douleur: 1 })];
    const a = evaluerAdaptation({ date: REF, journal: j, seances });
    expect(a.type).toBe('aucune');
  });
});

// ── §2.1 + §2.2 raisons chiffrées et niveau gradué ──────────────────────────

describe('evaluerAdaptation v2 — raisons personnelles chiffrées', () => {
  // Journal de 14 jours à douleur 2 (baseline = 2) ; aujourd'hui douleur 5 = dégradé.
  const j = Array.from({ length: 13 }, (_, i) =>
    journal(ajouterJours(REF, -(13 - i)), { douleur: 2 }),
  ).concat(journal(REF, { douleur: 5 }));

  it('allègement du jour : la raison cite la baseline et le score', () => {
    const a = evaluerAdaptation({ date: REF, journal: j, seances: [] });
    expect(a.type).toBe('allegement_jour');
    expect(a.raison).toContain('normale des 4 dernières semaines');
    expect(a.raison).toContain('2/10'); // la baseline personnelle
    expect(a.raison).toContain('Score de forme');
    expect(a.score).not.toBeNull();
  });

  it('jour dégradé ⇒ niveau plafonné à « allégée » quel que soit le score', () => {
    const a = evaluerAdaptation({ date: REF, journal: j, seances: [] });
    expect(a.niveauSeance).toBe('allegee');
  });

  it('sans journal aujourd’hui, le score est null et le niveau reste « normale »', () => {
    const a = evaluerAdaptation({ date: REF, journal: [], seances: [] });
    expect(a.score).toBeNull();
    expect(a.niveauSeance).toBe('normale');
  });
});

// ── §2.6 Règle 0 — mode poussée (prime sur tout) ─────────────────────────────

describe('evaluerAdaptation v2 — mode poussée', () => {
  it('mode poussée actif ⇒ maintien minimal, prioritaire sur les autres règles', () => {
    // Contexte qui déclencherait normalement un feu vert de progression.
    const seances = [
      seance(ajouterJours(REF, -21), 5, 10),
      seance(ajouterJours(REF, -14), 5, 10),
      seance(ajouterJours(REF, -7), 5, 10),
      seance(REF, 5, 10),
    ];
    const j = [journal(ajouterJours(REF, -1), { douleur: 1 }), journal(REF, { douleur: 1 })];
    const a = evaluerAdaptation({ date: REF, journal: j, seances, modePousse: true });
    expect(a.type).toBe('mode_pousse');
    expect(a.niveauSeance).toBe('allegee');
    expect(a.raison).toContain('Mode poussée');
    expect(a.reglesAussiDeclenchees).toEqual([]);
  });

  it('le mode poussée conserve le score de forme du jour (journal toujours central)', () => {
    const a = evaluerAdaptation({
      date: REF,
      journal: [journal(REF, { douleur: 0, energie: 5, digestion: 5 })],
      seances: [],
      modePousse: true,
    });
    expect(a.score).not.toBeNull();
  });

  it('mode poussée inactif (défaut) ⇒ comportement v1/v2 inchangé', () => {
    const a = evaluerAdaptation({ date: REF, journal: [], seances: [] });
    expect(a.type).not.toBe('mode_pousse');
  });
});
