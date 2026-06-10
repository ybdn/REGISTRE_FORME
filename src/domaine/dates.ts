import type { DateISO } from './types';

// Utilitaires de dates purs, sans fuseau horaire (on travaille en date civile locale `AAAA-MM-JJ`).
// On évite Date pour les calculs civils afin de rester déterministe et insensible au timezone.

const FORMAT = /^\d{4}-\d{2}-\d{2}$/;

/** Date civile locale du jour au format `AAAA-MM-JJ`. */
export function aujourdhuiISO(): DateISO {
  const d = new Date();
  const aa = d.getFullYear().toString().padStart(4, '0');
  const mm = (d.getMonth() + 1).toString().padStart(2, '0');
  const jj = d.getDate().toString().padStart(2, '0');
  return `${aa}-${mm}-${jj}`;
}

/** Vérifie qu'une chaîne est une date ISO courte valide. */
export function estDateISO(valeur: string): valeur is DateISO {
  return FORMAT.test(valeur);
}

/** Convertit une date ISO en numéro de jour absolu (jours depuis l'époque), pour comparer/soustraire. */
export function versJourAbsolu(date: DateISO): number {
  const [a, m, j] = date.split('-').map(Number) as [number, number, number];
  // Algorithme de jour julien grégorien (entier, stable, sans Date).
  const an = m <= 2 ? a - 1 : a;
  const mois = m <= 2 ? m + 12 : m;
  const b = Math.floor(an / 400) - Math.floor(an / 100) + Math.floor(an / 4);
  return 365 * an + b + Math.floor((153 * (mois - 3) + 2) / 5) + j;
}

/** Nombre de jours entre deux dates (a − b), positif si a est postérieure à b. */
export function ecartJours(a: DateISO, b: DateISO): number {
  return versJourAbsolu(a) - versJourAbsolu(b);
}

/** Décale une date ISO de `n` jours (n peut être négatif). */
export function ajouterJours(date: DateISO, n: number): DateISO {
  const [a, m, j] = date.split('-').map(Number) as [number, number, number];
  const d = new Date(Date.UTC(a, m - 1, j + n));
  const aa = d.getUTCFullYear().toString().padStart(4, '0');
  const mm = (d.getUTCMonth() + 1).toString().padStart(2, '0');
  const jj = d.getUTCDate().toString().padStart(2, '0');
  return `${aa}-${mm}-${jj}`;
}
