import {
  ACWR_ZONE_BASSE,
  ACWR_ZONE_HAUTE,
  FENETRE_CHARGE_AIGUE,
  FENETRE_CHARGE_CHRONIQUE,
  MIN_JOURS_ACWR,
} from './constantes';
import { ecartJours } from './dates';
import type { DateISO, SeanceRealisee } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// CHARGE D'ENTRAÎNEMENT (cf. doc 02 §2.3)
//
// Trois indicateurs standards de la science du sport, tous dérivés du sRPE déjà
// saisi (RPE × durée) — pas de nouvelle donnée. Sous MICI la récupération est
// compromise par l'inflammation : surveiller la charge prévient le surmenage.
//
//   ACWR (Gabbett)  = charge aiguë 7 j / charge chronique hebdo 28 j
//   Monotonie (Foster) = moyenne / écart-type des charges quotidiennes 7 j
//   Contrainte (strain) = charge hebdo × monotonie
//
// Tout est pur et déterministe.
// ─────────────────────────────────────────────────────────────────────────────

/** Charge d'une séance au sens sRPE (RPE × durée en minutes). */
export function chargeSeance(s: SeanceRealisee): number {
  return s.rpe * s.dureeMin;
}

/** Charge d'entraînement cumulée (sRPE) sur une fenêtre de jours (date incluse). */
export function chargeHebdomadaire(seances: SeanceRealisee[], date: DateISO, fenetre = 7): number {
  return seances
    .filter((s) => {
      const ecart = ecartJours(date, s.date);
      return ecart >= 0 && ecart < fenetre;
    })
    .reduce((acc, s) => acc + chargeSeance(s), 0);
}

/** Séances comprises dans une fenêtre de jours se terminant à `date` (incluse). */
function seancesFenetre(
  seances: SeanceRealisee[],
  date: DateISO,
  fenetre: number,
): SeanceRealisee[] {
  return seances.filter((s) => {
    const ecart = ecartJours(date, s.date);
    return ecart >= 0 && ecart < fenetre;
  });
}

/**
 * Ratio charge aiguë / charge chronique (ACWR — Gabbett).
 *
 *   chargeAiguë    = Σ sRPE sur 7 j
 *   chargeChronique = moyenne des 4 charges hebdo sur 28 j = (Σ sRPE 28 j) / 4
 *   ACWR = chargeAiguë / chargeChronique
 *
 * Renvoie `null` tant que l'historique de séances couvre moins de 21 jours
 * (chronique non fiable) ou qu'aucune charge chronique n'existe (division nulle).
 * Dans ce cas, le moteur ne pénalise rien (composante de score neutre, pas de
 * règle `lisser_charge`).
 */
export function acwr(seances: SeanceRealisee[], date: DateISO): number | null {
  const surFenetre = seancesFenetre(seances, date, FENETRE_CHARGE_CHRONIQUE);
  if (surFenetre.length === 0) return null;

  // Historique exploitable = jours écoulés depuis la séance la plus ancienne (incluse).
  const plusAncienne = surFenetre.map((s) => s.date).reduce((min, d) => (d < min ? d : min));
  const joursDeDonnees = ecartJours(date, plusAncienne) + 1;
  if (joursDeDonnees < MIN_JOURS_ACWR) return null;

  const chargeAigue = chargeHebdomadaire(seances, date, FENETRE_CHARGE_AIGUE);
  const chargeChronique =
    surFenetre.reduce((acc, s) => acc + chargeSeance(s), 0) / (FENETRE_CHARGE_CHRONIQUE / 7);
  if (chargeChronique === 0) return null;

  return chargeAigue / chargeChronique;
}

/** Charges quotidiennes sRPE des 7 derniers jours (jours sans séance = 0). */
function chargesQuotidiennes(seances: SeanceRealisee[], date: DateISO): number[] {
  const jours = new Array<number>(FENETRE_CHARGE_AIGUE).fill(0);
  for (const s of seances) {
    const ecart = ecartJours(date, s.date);
    if (ecart >= 0 && ecart < FENETRE_CHARGE_AIGUE)
      jours[ecart] = (jours[ecart] ?? 0) + chargeSeance(s);
  }
  return jours;
}

/**
 * Monotonie (Foster) = moyenne / écart-type des charges quotidiennes sur 7 j,
 * jours de repos (charge 0) inclus — c'est leur présence qui crée la variété.
 * Une monotonie élevée (> 2) signale un entraînement trop uniforme, facteur de
 * surmenage indépendant du volume. Renvoie `null` si aucune charge sur la fenêtre
 * (rien à mesurer) ou si l'écart-type est nul (toutes les journées identiques).
 */
export function monotonie(seances: SeanceRealisee[], date: DateISO): number | null {
  const charges = chargesQuotidiennes(seances, date);
  const total = charges.reduce((a, b) => a + b, 0);
  if (total === 0) return null;

  const moyenne = total / charges.length;
  const variance = charges.reduce((acc, c) => acc + (c - moyenne) ** 2, 0) / charges.length;
  const ecartType = Math.sqrt(variance);
  if (ecartType === 0) return null;

  return moyenne / ecartType;
}

/**
 * Contrainte (strain) = charge hebdomadaire × monotonie. Suivie en tendance :
 * une contrainte élevée combine volume et uniformité. `null` si la monotonie ne
 * peut pas être calculée.
 */
export function contrainte(seances: SeanceRealisee[], date: DateISO): number | null {
  const m = monotonie(seances, date);
  if (m === null) return null;
  return chargeHebdomadaire(seances, date, FENETRE_CHARGE_AIGUE) * m;
}

/** Zone qualitative d'un ACWR, pour l'affichage et le bilan (cf. tableau §2.3). */
export type ZoneACWR = 'sous_charge' | 'optimale' | 'vigilance' | 'risque';

/** Classe un ACWR dans sa zone (null si l'ACWR n'est pas calculable). */
export function zoneACWR(valeur: number | null): ZoneACWR | null {
  if (valeur === null) return null;
  if (valeur < ACWR_ZONE_BASSE) return 'sous_charge';
  if (valeur <= ACWR_ZONE_HAUTE) return 'optimale';
  if (valeur <= 1.5) return 'vigilance';
  return 'risque';
}
