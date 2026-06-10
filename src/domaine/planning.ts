import { ecartJours } from './dates';
import type { DateISO } from './types';

// Helpers de positionnement dans le programme : à partir de la date de début (lundi S1)
// et de la date du jour, on déduit la semaine courante et le jour de la semaine.

/** Numéro de semaine du programme (1-based) pour une date donnée. Avant le début → 1. */
export function numeroSemaine(dateDebut: DateISO, date: DateISO): number {
  const jours = ecartJours(date, dateDebut);
  if (jours < 0) return 1;
  return Math.floor(jours / 7) + 1;
}

/** Jour de la semaine au format programme : lundi = 0 … dimanche = 6. */
export function jourDeLaSemaine(date: DateISO): number {
  const [a, m, j] = date.split('-').map(Number) as [number, number, number];
  const d = new Date(Date.UTC(a, m - 1, j));
  return (d.getUTCDay() + 6) % 7; // getUTCDay : dimanche = 0
}

/** Vrai si la date est dans la fenêtre des 16 semaines du programme. */
export function programmeEnCours(dateDebut: DateISO, date: DateISO): boolean {
  const n = numeroSemaine(dateDebut, date);
  return ecartJours(date, dateDebut) >= 0 && n <= 16;
}
