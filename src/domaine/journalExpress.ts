import { ajouterJours } from './dates';
import type { DateISO, EntreeJournal } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// JOURNAL EXPRESS — saisie < 10 s (cf. doc 04 §4.2)
//
// Pré-positionnement des curseurs sur la veille, tags récents en premier,
// « identique à hier ». Fonctions pures, l'écran ne fait que les afficher.
// ─────────────────────────────────────────────────────────────────────────────

/** Entrée de la veille (sert au pré-positionnement et au bouton « identique à hier »). */
export function entreeVeille(
  journal: EntreeJournal[],
  aujourdhui: DateISO,
): EntreeJournal | undefined {
  const hier = ajouterJours(aujourdhui, -1);
  return journal.find((e) => e.date === hier);
}

/**
 * Tags ordonnés par récence d'utilisation : les plus récemment cochés d'abord
 * (y compris les tags personnalisés passés), puis les tags par défaut restants.
 */
export function tagsParRecence(journal: EntreeJournal[], tagsDefaut: string[]): string[] {
  const ordonnes: string[] = [];
  const vus = new Set<string>();
  const parDateDesc = [...journal].sort((a, b) => b.date.localeCompare(a.date));
  for (const entree of parDateDesc) {
    for (const tag of entree.tags) {
      if (!vus.has(tag)) {
        vus.add(tag);
        ordonnes.push(tag);
      }
    }
  }
  for (const tag of tagsDefaut) {
    if (!vus.has(tag)) {
      vus.add(tag);
      ordonnes.push(tag);
    }
  }
  return ordonnes;
}
