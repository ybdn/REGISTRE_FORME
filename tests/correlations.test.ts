import { analyserTags, correlationLaPlusSignificative } from '@/domaine/correlations';
import { ajouterJours } from '@/domaine/dates';
import type { EntreeJournal } from '@/domaine/types';
import { describe, expect, it } from 'vitest';

const FIN = '2026-06-28';

function entree(date: string, douleur: number, tags: string[] = []): EntreeJournal {
  return { date, douleur, energie: 4, digestion: 4, nbSelles: 1, ballonnements: false, tags };
}

/**
 * Construit un journal continu de `nbJours` se terminant à FIN, douleur de fond 2
 * (baseline ≈ 2, seuil de poussée = 3). `motif(i)` peut surcharger une entrée du
 * jour i (0 = le plus ancien) pour y placer un tag et/ou une poussée.
 */
function journalContinu(
  nbJours: number,
  motif: (i: number, date: string) => Partial<EntreeJournal> = () => ({}),
): EntreeJournal[] {
  return Array.from({ length: nbJours }, (_, i) => {
    const date = ajouterJours(FIN, -(nbJours - 1 - i));
    return { ...entree(date, 2), ...motif(i, date) };
  });
}

describe('analyserTags — garde-fous (pas de fausse certitude)', () => {
  it('renvoie [] sous 30 entrées de journal', () => {
    const j = journalContinu(20, (i) => (i % 2 === 0 ? { tags: ['repas-gras'], douleur: 8 } : {}));
    expect(analyserTags(j, FIN)).toEqual([]);
  });

  it('renvoie [] si la baseline est indisponible (démarrage à froid)', () => {
    // 40 entrées mais espacées : moins de 14 sur la fenêtre de 28 j → baseline null.
    const j = Array.from({ length: 40 }, (_, i) =>
      entree(ajouterJours(FIN, -i * 3), 2, ['stress']),
    );
    expect(analyserTags(j, FIN)).toEqual([]);
  });

  it('ignore un tag apparaissant moins de 5 fois', () => {
    const j = journalContinu(60, (i) => (i < 4 ? { tags: ['rare'], douleur: 9 } : {}));
    expect(analyserTags(j, FIN).find((c) => c.tag === 'rare')).toBeUndefined();
  });
});

describe('analyserTags — détection et formulation', () => {
  it('détecte un tag systématiquement suivi de poussée (ratio infini)', () => {
    // Motif période 4 : tag les jours 0-1, poussée (douleur 9) le jour 2, repos le 3.
    // La poussée du jour 2 n'est « vue » dans les 48 h précédentes que par les jours
    // 0 et 1 (tous deux taggés) → aucune journée sans tag n'est suivie d'une poussée
    // → pSans = 0 → ratio infini.
    const j = journalContinu(60, (i) => {
      if (i % 4 === 0 || i % 4 === 1) return { tags: ['repas-gras'] };
      if (i % 4 === 2) return { douleur: 9 };
      return {};
    });
    const res = analyserTags(j, FIN);
    const c = res.find((x) => x.tag === 'repas-gras');
    expect(c).toBeDefined();
    expect(c?.ratio).toBe(Number.POSITIVE_INFINITY);
    expect(c?.pSans).toBe(0);
    expect(c?.nbAvecPoussee).toBe(c?.occurrences);
    expect(c?.libelle).toContain('repas-gras');
    expect(c?.libelle).toContain('100 %');
  });

  it('ne signale pas un tag sans lien avec les poussées', () => {
    // 'cafe' fréquent mais jamais corrélé : douleur stable à 2 partout.
    const j = journalContinu(60, (i) => (i % 2 === 0 ? { tags: ['cafe'] } : {}));
    expect(analyserTags(j, FIN)).toEqual([]);
  });

  it('expose les dates des journées concernées (tap → liste), triées', () => {
    const j = journalContinu(60, (i) => {
      if (i % 6 === 0) return { tags: ['repas-gras'] };
      if (i % 6 === 1) return { douleur: 9 };
      return {};
    });
    const c = correlationLaPlusSignificative(j, FIN);
    expect(c).not.toBeNull();
    expect(c?.jours.length).toBe(c?.occurrences);
    expect(c?.jours).toEqual([...(c?.jours ?? [])].sort());
  });
});

describe('analyserTags — seuil relatif à la baseline', () => {
  it('compte la poussée par rapport à la baseline personnelle, pas en absolu', () => {
    // Baseline élevée (douleur de fond 5) → seuil = 6. Une douleur 5 le lendemain
    // d'un tag n'est PAS une poussée ; il faut dépasser 6.
    const j = journalContinu(60, (i) => {
      const base: Partial<EntreeJournal> = { douleur: 5 };
      if (i % 6 === 0) return { ...base, tags: ['repas-gras'] };
      if (i % 6 === 1) return { ...base, douleur: 5 }; // pas une poussée (= baseline)
      return base;
    });
    expect(analyserTags(j, FIN).find((c) => c.tag === 'repas-gras')).toBeUndefined();
  });
});
