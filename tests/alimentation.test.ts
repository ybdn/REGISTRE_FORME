import {
  alimentsParRecence,
  analyserAliments,
  classerAliments,
  normaliserAliment,
} from '@/domaine/alimentation';
import { ajouterJours } from '@/domaine/dates';
import type { ConsommationJour, EntreeJournal, StatutAlimentManuel } from '@/domaine/types';
import { describe, expect, it } from 'vitest';

const FIN = '2026-06-28';

function entree(date: string, douleur: number, tags: string[] = []): EntreeJournal {
  return { date, douleur, energie: 4, digestion: 4, nbSelles: 1, ballonnements: false, tags };
}

/**
 * Journal continu de `nbJours` se terminant à FIN, douleur de fond 2
 * (baseline ≈ 2, seuil de poussée = 3). `motif(i)` peut surcharger le jour i.
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

function conso(date: string, aliments: string[]): ConsommationJour {
  return { date, aliments };
}

/** Consommations continues sur `nbJours` finissant à FIN, aliments du jour i via `motif(i)`. */
function consosContinues(nbJours: number, motif: (i: number) => string[]): ConsommationJour[] {
  return Array.from({ length: nbJours }, (_, i) =>
    conso(ajouterJours(FIN, -(nbJours - 1 - i)), motif(i)),
  );
}

const statut = (
  aliment: string,
  s: StatutAlimentManuel['statut'],
  dateMaj = '2026-06-20',
): StatutAlimentManuel => ({ aliment, statut: s, dateMaj });

describe('normaliserAliment', () => {
  it('réduit casse et espaces', () => {
    expect(normaliserAliment('  Café  au   Lait ')).toBe('café au lait');
  });

  it('est idempotente', () => {
    const une = normaliserAliment(' Yaourt Nature ');
    expect(normaliserAliment(une)).toBe(une);
  });
});

describe('alimentsParRecence', () => {
  it('place les aliments récents avant les suggestions par défaut, sans doublon', () => {
    const consos = [conso('2026-06-27', ['pizza']), conso('2026-06-28', ['café', 'pizza'])];
    expect(alimentsParRecence(consos, ['café', 'lait'])).toEqual(['café', 'pizza', 'lait']);
  });

  it('normalise avant de dédoublonner', () => {
    const consos = [conso('2026-06-28', ['Café '])];
    expect(alimentsParRecence(consos, ['café'])).toEqual(['café']);
  });
});

describe('analyserAliments — garde-fous (sur le journal, pas les consommations)', () => {
  it('renvoie [] sous 30 entrées de journal, même avec beaucoup de consommations', () => {
    const j = journalContinu(20, (i) => (i % 2 === 0 ? { douleur: 9 } : {}));
    const c = consosContinues(60, () => ['pizza']);
    expect(analyserAliments(j, c, FIN)).toEqual([]);
  });

  it('renvoie [] si la baseline est indisponible (démarrage à froid)', () => {
    const j = Array.from({ length: 40 }, (_, i) => entree(ajouterJours(FIN, -i * 3), 2));
    const c = consosContinues(60, () => ['pizza']);
    expect(analyserAliments(j, c, FIN)).toEqual([]);
  });

  it('ignore un aliment consommé moins de 5 fois', () => {
    const j = journalContinu(60, (i) => (i % 4 === 1 ? { douleur: 9 } : {}));
    const c = consosContinues(60, (i) => (i % 4 === 0 && i < 16 ? ['rare'] : []));
    expect(analyserAliments(j, c, FIN).find((x) => x.tag === 'rare')).toBeUndefined();
  });
});

describe('analyserAliments — détection', () => {
  it('détecte un aliment systématiquement suivi de poussée (ratio infini)', () => {
    // Période 4 : aliment les jours 0-1, poussée le jour 2, repos le 3 (cf. correlations.test.ts).
    const j = journalContinu(60, (i) => (i % 4 === 2 ? { douleur: 9 } : {}));
    const c = consosContinues(60, (i) => (i % 4 === 0 || i % 4 === 1 ? ['pizza'] : ['riz']));
    const res = analyserAliments(j, c, FIN);
    const pizza = res.find((x) => x.tag === 'pizza');
    expect(pizza).toBeDefined();
    expect(pizza?.ratio).toBe(Number.POSITIVE_INFINITY);
    expect(pizza?.pSans).toBe(0);
    expect(pizza?.libelle).toContain('pizza');
    expect(pizza?.libelle).toContain('100 %');
    expect(res.find((x) => x.tag === 'riz')).toBeUndefined();
  });

  it('ne signale pas un aliment sans lien avec les poussées', () => {
    const j = journalContinu(60);
    const c = consosContinues(60, (i) => (i % 2 === 0 ? ['café'] : []));
    expect(analyserAliments(j, c, FIN)).toEqual([]);
  });

  it('regroupe les saisies non normalisées (« Pizza » = « pizza »)', () => {
    const j = journalContinu(60, (i) => (i % 4 === 2 ? { douleur: 9 } : {}));
    const c = consosContinues(60, (i) => {
      if (i % 4 === 0) return ['Pizza '];
      if (i % 4 === 1) return ['pizza'];
      return [];
    });
    const pizza = analyserAliments(j, c, FIN).find((x) => x.tag === 'pizza');
    expect(pizza).toBeDefined();
  });

  it('ignore un jour de consommation sans entrée journal les 2 jours suivants', () => {
    // Journal troué : aucune entrée les jours 40-44. Une consommation le jour 41
    // (J+1 = 42 et J+2 = 43 absents) n'est pas évaluable → reste sous 5 occurrences.
    const j = journalContinu(60, (i) => (i % 4 === 2 ? { douleur: 9 } : {})).filter((e) => {
      const i = 59 - Math.round((Date.parse(FIN) - Date.parse(e.date)) / 86_400_000);
      return i < 40 || i > 44;
    });
    // 4 consommations évaluables (jours 0, 4, 8, 12) + 1 non évaluable (jour 41).
    const c = [0, 4, 8, 12, 41].map((i) => conso(ajouterJours(FIN, -(59 - i)), ['pizza']));
    expect(analyserAliments(j, c, FIN).find((x) => x.tag === 'pizza')).toBeUndefined();
  });

  it('évalue un jour de consommation sans entrée journal ce jour-là, si J+1 est saisi', () => {
    // Le journal n'a PAS d'entrée les jours pizza, mais bien les lendemains :
    // l'exposition vient des consommations, la poussée du journal → évaluable.
    // Les jours riz fournissent le groupe de comparaison (jamais suivis de poussée).
    const j = journalContinu(60, (i) => (i % 4 === 1 ? { douleur: 9 } : {})).filter((e) => {
      const i = 59 - Math.round((Date.parse(FIN) - Date.parse(e.date)) / 86_400_000);
      return i % 4 !== 0;
    });
    const c = consosContinues(60, (i) => {
      if (i % 4 === 0) return ['pizza'];
      if (i % 4 === 2) return ['riz'];
      return [];
    }).filter((x) => x.aliments.length > 0);
    const pizza = analyserAliments(j, c, FIN).find((x) => x.tag === 'pizza');
    expect(pizza).toBeDefined();
    expect(pizza?.ratio).toBe(Number.POSITIVE_INFINITY);
  });

  it("ne conclut rien quand toutes les journées consignées contiennent l'aliment", () => {
    // L'utilisateur ne consigne QUE les jours où il mange de la pizza : aucun groupe
    // de comparaison → « contre 0 % sans » serait du vide statistique → pas de verdict.
    const j = journalContinu(60, (i) => (i % 4 === 1 ? { douleur: 9 } : {}));
    const c = Array.from({ length: 15 }, (_, k) =>
      conso(ajouterJours(FIN, -(59 - 4 * k)), ['pizza']),
    );
    expect(analyserAliments(j, c, FIN)).toEqual([]);
  });
});

describe('classerAliments — verdicts et priorité du manuel', () => {
  // Jeu de données : pizza corrélée (suspect auto), riz consommé sans signal.
  const journal = journalContinu(60, (i) => (i % 4 === 2 ? { douleur: 9 } : {}));
  const consos = consosContinues(60, (i) => (i % 4 === 0 || i % 4 === 1 ? ['pizza'] : ['riz']));

  it('auto seul → suspect, avec la corrélation comme raison', () => {
    const pizza = classerAliments(consos, [], journal, FIN).find((x) => x.aliment === 'pizza');
    expect(pizza?.verdict).toBe('suspect');
    expect(pizza?.source).toBe('auto');
    expect(pizza?.correlation).not.toBeNull();
    expect(pizza?.raison).toBe(pizza?.correlation?.libelle);
  });

  it('aucun signal → neutre, raison non vide', () => {
    const riz = classerAliments(consos, [], journal, FIN).find((x) => x.aliment === 'riz');
    expect(riz?.verdict).toBe('neutre');
    expect(riz?.source).toBe('aucun');
    expect(riz?.raison).toContain('Aucun signal');
  });

  it('le statut manuel PRIME sur la corrélation, qui reste exposée', () => {
    const res = classerAliments(consos, [statut('pizza', 'tolere')], journal, FIN);
    const pizza = res.find((x) => x.aliment === 'pizza');
    expect(pizza?.verdict).toBe('tolere');
    expect(pizza?.source).toBe('manuel');
    expect(pizza?.correlation).not.toBeNull(); // transparence : le signal auto reste visible
    expect(pizza?.raison).toContain('toléré');
    expect(pizza?.raison).toContain('2026-06-20');
  });

  it('un aliment jamais consommé mais avec statut apparaît quand même', () => {
    const res = classerAliments([], [statut('gluten', 'a-eviter')], journalContinu(60), FIN);
    const gluten = res.find((x) => x.aliment === 'gluten');
    expect(gluten?.verdict).toBe('a-eviter');
    expect(gluten?.nbJoursConsomme).toBe(0);
    expect(gluten?.derniereConsommation).toBeNull();
  });

  it('trie : à éviter et suspects avant les neutres, et chaque raison est non vide', () => {
    const res = classerAliments(consos, [statut('riz', 'a-eviter')], journal, FIN);
    expect(res.map((x) => x.aliment)).toEqual(['riz', 'pizza']);
    for (const c of res) expect(c.raison.length).toBeGreaterThan(0);
  });

  it("en démarrage à froid, la raison neutre annonce l'analyse impossible, pas « aucun signal »", () => {
    // 10 jours de journal seulement : aucune analyse n'a tourné — dire « aucun
    // signal » serait faussement rassurant.
    const res = classerAliments([conso(FIN, ['pizza'])], [], journalContinu(10), FIN);
    const pizza = res.find((x) => x.aliment === 'pizza');
    expect(pizza?.verdict).toBe('neutre');
    expect(pizza?.raison).toContain("Pas encore d'analyse");
    expect(pizza?.raison).not.toContain('Aucun signal');
  });
});
