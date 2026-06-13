import {
  FENETRE_BASELINE_JOURS,
  MARGE_DEGRADE_RELATIVE_MIN,
  MIN_ENTREES_BASELINE,
} from './constantes';
import { ecartJours } from './dates';
import type { DateISO, EntreeJournal } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// BASELINE PERSONNELLE (cf. doc 02 §2.1)
//
// Seuils RELATIFS à « ta normale » plutôt qu'absolus. On résume la douleur des
// 28 derniers jours par sa médiane (la normale) et son écart absolu médian (MAD,
// la dispersion) — deux statistiques robustes aux valeurs extrêmes, contrairement
// à la moyenne/écart-type qu'un seul jour de crise fausserait.
//
// Démarrage à froid : moins de 14 entrées sur la fenêtre → baseline null, et le
// moteur retombe sur les seuils absolus v1 (comportement inchangé).
//
// Pur, sans état stocké : recalculé à la volée (28 entrées max, négligeable).
// ─────────────────────────────────────────────────────────────────────────────

/** Photographie de la « normale » personnelle de douleur sur la fenêtre glissante. */
export interface Baseline {
  /** Médiane de la douleur sur 28 j — le niveau de fond personnel. */
  valeur: number;
  /** Écart absolu médian (MAD) — dispersion robuste autour de la médiane. */
  mad: number;
  /** Nombre d'entrées de journal prises en compte (≥ MIN_ENTREES_BASELINE). */
  nbEntrees: number;
}

/** Médiane d'une liste non vide (moyenne des deux centraux si effectif pair). */
function mediane(valeurs: number[]): number {
  const tri = [...valeurs].sort((a, b) => a - b);
  const milieu = Math.floor(tri.length / 2);
  const haut = tri[milieu] ?? 0;
  const bas = tri[milieu - 1] ?? 0;
  return tri.length % 2 === 0 ? (bas + haut) / 2 : haut;
}

/**
 * Calcule la baseline de douleur (médiane + MAD) sur les 28 jours précédant `date`
 * (incluse). Renvoie `null` en démarrage à froid (< 14 entrées) : on garde alors
 * les seuils absolus v1.
 */
export function calculerBaseline(journal: EntreeJournal[], date: DateISO): Baseline | null {
  const douleurs = journal
    .filter((e) => {
      const ecart = ecartJours(date, e.date);
      return ecart >= 0 && ecart < FENETRE_BASELINE_JOURS;
    })
    .map((e) => e.douleur);

  if (douleurs.length < MIN_ENTREES_BASELINE) return null;

  const valeur = mediane(douleurs);
  const mad = mediane(douleurs.map((d) => Math.abs(d - valeur)));
  return { valeur, mad, nbEntrees: douleurs.length };
}

/**
 * Seuil de douleur au-dessus duquel la journée est dégradée *relativement* à la
 * baseline : `baseline + max(2, 2 × MAD)`. Le plancher de 2 évite qu'une normale
 * très stable (MAD ≈ 0) déclenche au moindre point de plus.
 */
export function seuilDegradeRelatif(baseline: Baseline): number {
  return baseline.valeur + Math.max(MARGE_DEGRADE_RELATIVE_MIN, 2 * baseline.mad);
}
