import {
  aucunJourDegrade,
  chargeHebdomadaire,
  chargeSeance,
  estJourDegrade,
  evaluerAdaptation,
  joursDegradesConsecutifs,
  rpeMoyen,
} from '@/domaine/moteurAdaptation';
import type { EntreeJournal, SeanceRealisee } from '@/domaine/types';
import { describe, expect, it } from 'vitest';

// Fabriques pour des données de test lisibles.
function journal(date: string, p: Partial<EntreeJournal> = {}): EntreeJournal {
  return {
    date,
    douleur: 0,
    energie: 5,
    digestion: 5,
    nbSelles: 1,
    ballonnements: false,
    tags: [],
    ...p,
  };
}

function seance(date: string, rpe: number, dureeMin = 50): SeanceRealisee {
  return { id: `${date}-${rpe}`, date, type: 'course', variante: 'normale', rpe, dureeMin };
}

describe('estJourDegrade', () => {
  it('dégradé si douleur ≥ 5', () => {
    expect(estJourDegrade(journal('2026-06-01', { douleur: 5 }))).toBe(true);
    expect(estJourDegrade(journal('2026-06-01', { douleur: 4 }))).toBe(false);
  });

  it('dégradé si énergie ≤ 2', () => {
    expect(estJourDegrade(journal('2026-06-01', { energie: 2 }))).toBe(true);
    expect(estJourDegrade(journal('2026-06-01', { energie: 3 }))).toBe(false);
  });

  it('la digestion seule ne dégrade pas (décision métier verrouillée)', () => {
    expect(estJourDegrade(journal('2026-06-01', { digestion: 1 }))).toBe(false);
  });
});

describe('joursDegradesConsecutifs', () => {
  it('compte une série terminant à la date de référence', () => {
    const j = [
      journal('2026-06-01', { douleur: 6 }),
      journal('2026-06-02', { energie: 1 }),
      journal('2026-06-03', { douleur: 7 }),
    ];
    expect(joursDegradesConsecutifs(j, '2026-06-03')).toBe(3);
  });

  it('une journée sans entrée rompt la série', () => {
    const j = [
      journal('2026-06-01', { douleur: 6 }),
      // 2026-06-02 manquant
      journal('2026-06-03', { douleur: 7 }),
    ];
    expect(joursDegradesConsecutifs(j, '2026-06-03')).toBe(1);
  });

  it('un jour sain rompt la série', () => {
    const j = [
      journal('2026-06-01', { douleur: 6 }),
      journal('2026-06-02', { douleur: 0, energie: 5 }),
      journal('2026-06-03', { douleur: 7 }),
    ];
    expect(joursDegradesConsecutifs(j, '2026-06-03')).toBe(1);
  });
});

describe('rpeMoyen', () => {
  it('moyenne les séances de la fenêtre de 14 jours', () => {
    const s = [seance('2026-06-01', 9), seance('2026-06-10', 7)];
    expect(rpeMoyen(s, '2026-06-14')).toBe(8);
  });

  it('exclut les séances hors fenêtre', () => {
    const s = [seance('2026-05-01', 10), seance('2026-06-10', 6)];
    expect(rpeMoyen(s, '2026-06-14')).toBe(6);
  });

  it('renvoie null sans séance exploitable', () => {
    expect(rpeMoyen([], '2026-06-14')).toBeNull();
  });
});

describe('charge sRPE', () => {
  it('charge séance = RPE × durée', () => {
    expect(chargeSeance(seance('2026-06-01', 8, 50))).toBe(400);
  });

  it('charge hebdo = somme sur 7 jours', () => {
    const s = [
      seance('2026-06-08', 8, 50),
      seance('2026-06-10', 6, 40),
      seance('2026-05-30', 9, 60),
    ];
    // Seules les 2 premières sont dans les 7 jours précédant le 2026-06-14.
    expect(chargeHebdomadaire(s, '2026-06-14')).toBe(400 + 240);
  });
});

describe('evaluerAdaptation — règles et priorités', () => {
  it('Règle 1 : allègement du jour si signal dégradé aujourd’hui', () => {
    const a = evaluerAdaptation({
      date: '2026-06-14',
      journal: [journal('2026-06-14', { douleur: 6 })],
      seances: [],
    });
    expect(a.type).toBe('allegement_jour');
    expect(a.annulable).toBe(true);
  });

  it('Règle 2 : décharge hebdo après 3 jours dégradés consécutifs', () => {
    const a = evaluerAdaptation({
      date: '2026-06-14',
      journal: [
        journal('2026-06-12', { douleur: 6 }),
        journal('2026-06-13', { energie: 1 }),
        // jour de référence non dégradé pour isoler la règle 2 de la règle 1
        journal('2026-06-14', { douleur: 0, energie: 5 }),
      ],
      seances: [],
    });
    // Au 14, la série consécutive terminant ce jour est rompue (jour sain) → pas de décharge.
    expect(a.type).not.toBe('decharge_hebdo');
  });

  it('Règle 2 : décharge proposée quand les 3 jours incluent la date de référence, mais l’allègement prime', () => {
    const a = evaluerAdaptation({
      date: '2026-06-14',
      journal: [
        journal('2026-06-12', { douleur: 6 }),
        journal('2026-06-13', { energie: 1 }),
        journal('2026-06-14', { douleur: 8 }),
      ],
      seances: [],
    });
    // Priorité sécurité : l'allègement du jour l'emporte, la décharge est reportée (transparence).
    expect(a.type).toBe('allegement_jour');
    expect(a.reglesAussiDeclenchees).toContain('decharge_hebdo');
  });

  it('Règle 3 : ralentir la progression si RPE moyen > 8 sur 14 j', () => {
    const a = evaluerAdaptation({
      date: '2026-06-14',
      journal: [], // pas de signal dégradé, pas de feu vert (aucun jour sain enregistré requis)
      seances: [seance('2026-06-05', 9), seance('2026-06-12', 9)],
    });
    expect(a.type).toBe('ralentir_progression');
  });

  it('Règle 4 : progression normale si 0 jour dégradé sur 14 j ET RPE ≤ 8', () => {
    const a = evaluerAdaptation({
      date: '2026-06-14',
      journal: [journal('2026-06-13', { douleur: 1, energie: 5 })],
      seances: [seance('2026-06-12', 6)],
    });
    expect(a.type).toBe('progression_normale');
  });

  it('Règle 4 inhibée si RPE moyen > 8 (la règle 3 prend le relais)', () => {
    const a = evaluerAdaptation({
      date: '2026-06-14',
      journal: [journal('2026-06-13', { douleur: 1, energie: 5 })],
      seances: [seance('2026-06-12', 9)],
    });
    expect(a.type).toBe('ralentir_progression');
  });

  it('Aucune adaptation si pas de signal exploitable', () => {
    const a = evaluerAdaptation({ date: '2026-06-14', journal: [], seances: [] });
    expect(a.type).toBe('aucune');
    expect(a.annulable).toBe(false);
  });

  it('chaque adaptation porte une raison lisible (pas de boîte noire)', () => {
    const a = evaluerAdaptation({
      date: '2026-06-14',
      journal: [journal('2026-06-14', { douleur: 6 })],
      seances: [],
    });
    expect(a.raison.length).toBeGreaterThan(10);
  });
});

describe('aucunJourDegrade', () => {
  it('vrai si la fenêtre ne contient aucun jour dégradé', () => {
    expect(aucunJourDegrade([journal('2026-06-10', { douleur: 2 })], '2026-06-14')).toBe(true);
  });
  it('faux si un jour dégradé est présent dans la fenêtre', () => {
    expect(aucunJourDegrade([journal('2026-06-10', { douleur: 6 })], '2026-06-14')).toBe(false);
  });
});
