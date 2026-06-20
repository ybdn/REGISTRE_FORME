import { ajouterJours } from '@/domaine/dates';
import {
  heatmapForme,
  moyenneMobile,
  observanceJournal,
  serieChargeHebdo,
  serieSante,
} from '@/domaine/tendances';
import type { EntreeJournal, SeanceRealisee } from '@/domaine/types';
import { describe, expect, it } from 'vitest';

const FIN = '2026-06-28';

function entree(date: string, douleur: number, energie = 4): EntreeJournal {
  return {
    date,
    douleur,
    energie,
    digestion: 4,
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

function seance(
  date: string,
  type: SeanceRealisee['type'],
  rpe: number,
  dureeMin: number,
): SeanceRealisee {
  return { id: date + type, date, type, variante: 'normale', rpe, dureeMin };
}

describe('moyenneMobile', () => {
  it('lisse sur la fenêtre temporelle (gaps gérés)', () => {
    const points = [
      { date: ajouterJours(FIN, -2), valeur: 80 },
      { date: ajouterJours(FIN, -1), valeur: 82 },
      { date: FIN, valeur: 84 },
    ];
    const lisse = moyenneMobile(points, 7);
    expect(lisse[0]?.valeur).toBe(80); // 1 point dans la fenêtre
    expect(lisse[1]?.valeur).toBe(81); // (80+82)/2
    expect(lisse[2]?.valeur).toBe(82); // (80+82+84)/3
  });

  it('exclut les points hors fenêtre', () => {
    const points = [
      { date: ajouterJours(FIN, -10), valeur: 100 }, // hors fenêtre 7 j
      { date: FIN, valeur: 80 },
    ];
    const lisse = moyenneMobile(points, 7);
    expect(lisse[1]?.valeur).toBe(80);
  });
});

describe('serieChargeHebdo', () => {
  it('cumule le sRPE par semaine et par type, plus ancienne d’abord', () => {
    const seances = [
      seance(FIN, 'course', 6, 60), // semaine courante : 360
      seance(ajouterJours(FIN, -2), 'salle', 7, 60), // semaine courante : 420
      seance(ajouterJours(FIN, -8), 'course', 5, 60), // semaine -1 : 300
    ];
    const series = serieChargeHebdo(seances, FIN, 2);
    expect(series).toHaveLength(2);
    // index 0 = semaine la plus ancienne
    expect(series[0]?.charge).toBe(300);
    expect(series[1]?.charge).toBe(780);
    expect(series[1]?.parType.course).toBe(360);
    expect(series[1]?.parType.salle).toBe(420);
  });

  it("ACWR null tant que l'historique est court (< 21 j)", () => {
    const series = serieChargeHebdo([seance(FIN, 'course', 6, 60)], FIN, 1);
    expect(series[0]?.acwr).toBeNull();
    expect(series[0]?.zone).toBeNull();
  });
});

describe('serieSante', () => {
  it('moyenne douleur/énergie par semaine, null si aucune entrée', () => {
    const journal = [entree(FIN, 4, 3), entree(ajouterJours(FIN, -1), 2, 5)];
    const series = serieSante(journal, FIN, 2);
    expect(series[0]?.douleur).toBeNull(); // semaine -1 vide
    expect(series[0]?.energie).toBeNull();
    expect(series[1]?.douleur).toBe(3); // (4+2)/2
    expect(series[1]?.energie).toBe(4); // (3+5)/2
    expect(series[1]?.nbEntrees).toBe(2);
  });
});

describe('heatmapForme', () => {
  it('rend le score les jours saisis, null sinon, et marque les séances', () => {
    const journal = [entree(FIN, 0, 5)]; // jour de pleine forme
    const seances = [seance(FIN, 'course', 6, 40)];
    const cells = heatmapForme(journal, seances, FIN, 3);
    expect(cells).toHaveLength(3);
    expect(cells[0]?.score).toBeNull(); // FIN-2, pas d'entrée
    expect(cells[2]?.date).toBe(FIN);
    expect(cells[2]?.score).not.toBeNull();
    expect(cells[2]?.aSeance).toBe(true);
  });

  it('un jour de repos ne compte pas comme séance réalisée', () => {
    const journal = [entree(FIN, 2)];
    const repos: SeanceRealisee = {
      id: 'r',
      date: FIN,
      type: 'sante',
      variante: 'repos',
      rpe: 1,
      dureeMin: 0,
    };
    const cells = heatmapForme(journal, [repos], FIN, 1);
    expect(cells[0]?.aSeance).toBe(false);
  });
});

describe('observanceJournal', () => {
  it('calcule le taux saisis/écoulés', () => {
    const journal = [
      entree(FIN, 1),
      entree(ajouterJours(FIN, -1), 1),
      entree(ajouterJours(FIN, -3), 1),
    ];
    const o = observanceJournal(journal, FIN, 7);
    expect(o.joursSaisis).toBe(3);
    expect(o.joursEcoules).toBe(7);
    expect(o.taux).toBeCloseTo(3 / 7, 5);
  });

  it('un trou par semaine ne casse pas la série (grâce)', () => {
    // Saisi tous les jours sauf FIN-3 : la série en cours traverse ce trou unique.
    const dates = [0, 1, 2, 4, 5, 6, 7].map((d) => ajouterJours(FIN, -d));
    const journal = dates.map((d) => entree(d, 1));
    const o = observanceJournal(journal, FIN, 30);
    expect(o.serieActuelle).toBe(7); // 7 jours saisis, le trou est gracié
  });

  it('un deuxième trou rapproché casse la série (1 grâce / 7 j)', () => {
    // Deux trous (FIN-2 et FIN-4) dans la même fenêtre de 7 j.
    const dates = [0, 1, 3, 5, 6].map((d) => ajouterJours(FIN, -d));
    const journal = dates.map((d) => entree(d, 1));
    const o = observanceJournal(journal, FIN, 30);
    // FIN, FIN-1 (2), trou FIN-2 gracié, FIN-3 (3), trou FIN-4 → 2e grâce refusée → stop.
    expect(o.serieActuelle).toBe(3);
  });

  it('série nulle si rien saisi le jour évalué ni gracié au-delà', () => {
    const journal = [entree(ajouterJours(FIN, -2), 1)]; // FIN et FIN-1 manquent
    const o = observanceJournal(journal, FIN, 30);
    // FIN manquant → 1 grâce, FIN-1 manquant → grâce refusée → stop avant tout jour saisi.
    expect(o.serieActuelle).toBe(0);
  });

  it('journal vide → tout à zéro', () => {
    expect(observanceJournal([], FIN, 7)).toEqual({
      joursSaisis: 0,
      joursEcoules: 7,
      taux: 0,
      serieActuelle: 0,
    });
  });
});
