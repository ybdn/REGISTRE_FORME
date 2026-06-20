import { calculerBaseline, seuilDegradeRelatif } from '@/domaine/baseline';
import { ajouterJours } from '@/domaine/dates';
import type { EntreeJournal } from '@/domaine/types';
import { describe, expect, it } from 'vitest';

function entree(date: string, douleur: number): EntreeJournal {
  return {
    date,
    douleur,
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
  };
}

/** Journal de N jours consécutifs se terminant à `fin` (douleurs du plus ancien au plus récent). */
function journalDouleurs(fin: string, douleurs: number[]): EntreeJournal[] {
  return douleurs.map((d, i) => entree(ajouterJours(fin, -(douleurs.length - 1 - i)), d));
}

describe('calculerBaseline — démarrage à froid', () => {
  it('renvoie null sous 14 entrées sur 28 jours', () => {
    const j = journalDouleurs('2026-06-28', new Array(13).fill(3));
    expect(calculerBaseline(j, '2026-06-28')).toBeNull();
  });

  it('renvoie une baseline dès 14 entrées', () => {
    const j = journalDouleurs('2026-06-28', new Array(14).fill(3));
    const b = calculerBaseline(j, '2026-06-28');
    expect(b).not.toBeNull();
    expect(b?.nbEntrees).toBe(14);
  });

  it('ignore les entrées hors fenêtre de 28 jours', () => {
    const recentes = journalDouleurs('2026-06-28', new Array(14).fill(2));
    const vieille = entree('2026-04-01', 9); // bien au-delà de 28 j
    const b = calculerBaseline([vieille, ...recentes], '2026-06-28');
    expect(b?.nbEntrees).toBe(14);
    expect(b?.valeur).toBe(2);
  });
});

describe('calculerBaseline — médiane + MAD robustes', () => {
  it('médiane et MAD nuls quand la douleur est stable', () => {
    const j = journalDouleurs('2026-06-28', new Array(14).fill(2));
    const b = calculerBaseline(j, '2026-06-28');
    expect(b?.valeur).toBe(2);
    expect(b?.mad).toBe(0);
  });

  it('médiane = moyenne des deux centraux, MAD = médiane des écarts absolus', () => {
    // 7 jours à 2, 7 jours à 4 → médiane (2+4)/2 = 3 ; écarts tous = 1 → MAD = 1.
    const j = journalDouleurs('2026-06-28', [...new Array(7).fill(2), ...new Array(7).fill(4)]);
    const b = calculerBaseline(j, '2026-06-28');
    expect(b?.valeur).toBe(3);
    expect(b?.mad).toBe(1);
  });

  it('la médiane résiste à un jour de crise isolé (vs moyenne)', () => {
    const j = journalDouleurs('2026-06-28', [...new Array(13).fill(2), 10]);
    const b = calculerBaseline(j, '2026-06-28');
    expect(b?.valeur).toBe(2); // la médiane reste à 2 malgré le 10
  });
});

describe('seuilDegradeRelatif', () => {
  it('plancher de 2 quand la baseline est très stable (MAD 0)', () => {
    expect(seuilDegradeRelatif({ valeur: 2, mad: 0, nbEntrees: 14 })).toBe(4);
  });

  it('utilise 2×MAD quand la dispersion dépasse le plancher', () => {
    // 2 × MAD = 4 > 2 → seuil = baseline + 4.
    expect(seuilDegradeRelatif({ valeur: 3, mad: 2, nbEntrees: 14 })).toBe(7);
  });
});
