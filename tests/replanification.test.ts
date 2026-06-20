import { ajouterJours } from '@/domaine/dates';
import { genererProgramme } from '@/domaine/generateurSemaines';
import {
  glisserProgramme,
  palierRepriseValide,
  peutSortirDePoussee,
  programmeReprisePostPoussee,
  suggererModePousse,
} from '@/domaine/replanification';
import type { EntreeJournal } from '@/domaine/types';
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

describe('glisserProgramme', () => {
  it("décale les semaines à partir d'un numéro, contenu préservé", () => {
    const prog = genererProgramme();
    const glisse = glisserProgramme(prog, 5);
    // Semaines 1-4 inchangées.
    expect(glisse.slice(0, 4).map((s) => s.numero)).toEqual([1, 2, 3, 4]);
    // Semaines 5-16 décalées en 6-17.
    expect(glisse[4]?.numero).toBe(6);
    expect(glisse.at(-1)?.numero).toBe(17);
    // 16 semaines de contenu conservées.
    expect(glisse).toHaveLength(16);
  });

  it('emmène le test chrono avec son contenu (les tests glissent aussi)', () => {
    const prog = genererProgramme();
    const glisse = glisserProgramme(prog, 1); // tout décale de 1
    const tests = glisse.filter((s) => s.estTestChrono).map((s) => s.numero);
    expect(tests).toEqual([15, 17]); // S14/S16 → S15/S17
  });

  it('préserve la contiguïté des phases après glissement', () => {
    const prog = genererProgramme();
    const glisse = glisserProgramme(prog, 8, 2);
    const numeros = glisse.map((s) => s.numero);
    // Numéros strictement croissants et sans doublon.
    expect([...new Set(numeros)]).toHaveLength(numeros.length);
    expect([...numeros].sort((a, b) => a - b)).toEqual(numeros);
  });
});

describe('programmeReprisePostPoussee', () => {
  it('rend 3 paliers −30 % / −15 % / trame, validés par le score de forme', () => {
    const paliers = programmeReprisePostPoussee(2);
    expect(paliers.map((p) => p.volumePct)).toEqual([0.7, 0.85, 1]);
    expect(paliers.every((p) => p.scoreFormeMinSortie === 60)).toBe(true);
    expect(paliers[0]?.description).toContain('2 semaines de poussée');
    expect(paliers[2]?.description).toContain('trame complète');
  });

  it('palierRepriseValide à partir d’un score moyen ≥ 60', () => {
    expect(palierRepriseValide(60)).toBe(true);
    expect(palierRepriseValide(59)).toBe(false);
  });
});

describe('suggererModePousse', () => {
  it('suggère après 5 jours dégradés consécutifs (douleur ≥ 7)', () => {
    const journal = Array.from({ length: 5 }, (_, i) => entree(ajouterJours(FIN, -i), 8));
    expect(suggererModePousse(journal, FIN)).toBe(true);
  });

  it('ne suggère pas avec seulement 4 jours dégradés', () => {
    const journal = [
      entree(FIN, 8),
      entree(ajouterJours(FIN, -1), 8),
      entree(ajouterJours(FIN, -2), 8),
      entree(ajouterJours(FIN, -3), 8),
      entree(ajouterJours(FIN, -4), 2), // jour OK qui rompt la série
    ];
    expect(suggererModePousse(journal, FIN)).toBe(false);
  });
});

describe('peutSortirDePoussee', () => {
  it('autorise la sortie après 3 jours non dégradés consécutifs et saisis', () => {
    const journal = [
      entree(FIN, 1),
      entree(ajouterJours(FIN, -1), 2),
      entree(ajouterJours(FIN, -2), 1),
    ];
    expect(peutSortirDePoussee(journal, FIN)).toBe(true);
  });

  it('refuse la sortie si un des 3 derniers jours est dégradé', () => {
    const journal = [
      entree(FIN, 1),
      entree(ajouterJours(FIN, -1), 8),
      entree(ajouterJours(FIN, -2), 1),
    ];
    expect(peutSortirDePoussee(journal, FIN)).toBe(false);
  });

  it('refuse la sortie si un des 3 derniers jours manque (signal absent)', () => {
    const journal = [entree(FIN, 1), entree(ajouterJours(FIN, -2), 1)]; // FIN-1 manquant
    expect(peutSortirDePoussee(journal, FIN)).toBe(false);
  });
});
