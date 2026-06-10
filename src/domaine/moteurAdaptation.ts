import {
  FENETRE_FEU_VERT_JOURS,
  FENETRE_RPE_JOURS,
  JOURS_DEGRADES_DECHARGE,
  SEUIL_DOULEUR,
  SEUIL_ENERGIE,
  SEUIL_RPE_FEU_VERT,
  SEUIL_RPE_RALENTIR,
} from './constantes';
import { ecartJours } from './dates';
import type {
  Adaptation,
  ContexteAdaptation,
  DateISO,
  EntreeJournal,
  SeanceRealisee,
  TypeAdaptation,
} from './types';

// ─────────────────────────────────────────────────────────────────────────────
// MOTEUR D'ADAPTATION
//
// Règles déterministes, lisibles, expliquées à l'utilisateur. Aucune boîte noire,
// aucun appel réseau. Une seule adaptation est appliquée par jour : la première
// applicable l'emporte selon l'ordre « sécurité d'abord » (cf. evaluerAdaptation).
//
// Charge d'entraînement = sRPE (RPE × durée_min), sommée par semaine ailleurs.
// ─────────────────────────────────────────────────────────────────────────────

/** Un jour est « dégradé » si la douleur ≥ seuil OU l'énergie ≤ seuil. */
export function estJourDegrade(e: EntreeJournal): boolean {
  return e.douleur >= SEUIL_DOULEUR || e.energie <= SEUIL_ENERGIE;
}

/** Retrouve l'entrée de journal d'une date précise. */
export function entreeDuJour(journal: EntreeJournal[], date: DateISO): EntreeJournal | undefined {
  return journal.find((e) => e.date === date);
}

/**
 * Compte les jours dégradés consécutifs se terminant à `date` (incluse).
 * Une journée sans entrée de journal rompt la série (signal absent ≠ dégradé).
 */
export function joursDegradesConsecutifs(journal: EntreeJournal[], date: DateISO): number {
  const parDate = new Map(journal.map((e) => [e.date, e]));
  let compte = 0;
  // On remonte jour par jour tant que la journée existe ET est dégradée.
  for (let i = 0; ; i++) {
    const jour = decalerISO(date, -i);
    const e = parDate.get(jour);
    if (!e || !estJourDegrade(e)) break;
    compte++;
  }
  return compte;
}

/** Décalage local d'une date ISO (utilisé en interne, sans dépendre du fuseau). */
function decalerISO(date: DateISO, n: number): DateISO {
  const [a, m, j] = date.split('-').map(Number) as [number, number, number];
  const d = new Date(Date.UTC(a, m - 1, j + n));
  return `${d.getUTCFullYear().toString().padStart(4, '0')}-${(d.getUTCMonth() + 1)
    .toString()
    .padStart(2, '0')}-${d.getUTCDate().toString().padStart(2, '0')}`;
}

/**
 * Moyenne de RPE des séances réalisées sur les `fenetre` derniers jours (date incluse).
 * Renvoie `null` si aucune séance dans la fenêtre (pas de signal exploitable).
 */
export function rpeMoyen(
  seances: SeanceRealisee[],
  date: DateISO,
  fenetre = FENETRE_RPE_JOURS,
): number | null {
  const concernees = seances.filter((s) => {
    const ecart = ecartJours(date, s.date);
    return ecart >= 0 && ecart < fenetre;
  });
  if (concernees.length === 0) return null;
  const somme = concernees.reduce((acc, s) => acc + s.rpe, 0);
  return somme / concernees.length;
}

/** Vrai si aucun jour dégradé n'apparaît dans la fenêtre (date incluse). */
export function aucunJourDegrade(
  journal: EntreeJournal[],
  date: DateISO,
  fenetre = FENETRE_FEU_VERT_JOURS,
): boolean {
  return !journal.some((e) => {
    const ecart = ecartJours(date, e.date);
    return ecart >= 0 && ecart < fenetre && estJourDegrade(e);
  });
}

/** Charge d'une séance au sens sRPE (RPE × durée en minutes). */
export function chargeSeance(s: SeanceRealisee): number {
  return s.rpe * s.dureeMin;
}

/** Charge d'entraînement cumulée sur une fenêtre de jours (date incluse). */
export function chargeHebdomadaire(seances: SeanceRealisee[], date: DateISO, fenetre = 7): number {
  return seances
    .filter((s) => {
      const ecart = ecartJours(date, s.date);
      return ecart >= 0 && ecart < fenetre;
    })
    .reduce((acc, s) => acc + chargeSeance(s), 0);
}

/**
 * Évalue l'adaptation du jour. Une seule décision est appliquée — la première
 * règle applicable selon l'ordre de priorité « sécurité d'abord » :
 *   1. allègement du jour      (signal santé dégradé aujourd'hui)
 *   2. décharge hebdomadaire   (≥ 3 jours dégradés consécutifs)
 *   3. ralentir la progression (RPE moyen > 8 sur 14 j)
 *   4. progression normale     (0 jour dégradé sur 14 j ET RPE moyen ≤ 8)
 *   5. aucune
 *
 * Les autres règles dont les conditions étaient réunies sont reportées dans
 * `reglesAussiDeclenchees` (transparence), mais ne sont pas appliquées ce jour-là.
 */
export function evaluerAdaptation(ctx: ContexteAdaptation): Adaptation {
  const { date, journal, seances } = ctx;

  const entree = entreeDuJour(journal, date);
  const joursDegrades = joursDegradesConsecutifs(journal, date);
  const moyenneRpe = rpeMoyen(seances, date);
  const feuVert =
    aucunJourDegrade(journal, date) && moyenneRpe !== null && moyenneRpe <= SEUIL_RPE_FEU_VERT;

  // Conditions de chaque règle, évaluées indépendamment.
  const conditions: Record<Exclude<TypeAdaptation, 'aucune'>, boolean> = {
    allegement_jour: entree !== undefined && estJourDegrade(entree),
    decharge_hebdo: joursDegrades >= JOURS_DEGRADES_DECHARGE,
    ralentir_progression: moyenneRpe !== null && moyenneRpe > SEUIL_RPE_RALENTIR,
    progression_normale: feuVert,
  };

  // Ordre de priorité « sécurité d'abord ».
  const priorite: Exclude<TypeAdaptation, 'aucune'>[] = [
    'allegement_jour',
    'decharge_hebdo',
    'ralentir_progression',
    'progression_normale',
  ];

  const declenchees = priorite.filter((t) => conditions[t]);
  const retenue = declenchees[0] ?? 'aucune';

  return construireAdaptation(retenue, {
    date,
    joursDegrades,
    moyenneRpe,
    autres: declenchees.filter((t) => t !== retenue),
  });
}

function construireAdaptation(
  type: TypeAdaptation,
  ctx: {
    date: DateISO;
    joursDegrades: number;
    moyenneRpe: number | null;
    autres: TypeAdaptation[];
  },
): Adaptation {
  const base = {
    type,
    date: ctx.date,
    annulable: type !== 'aucune',
    reglesAussiDeclenchees: ctx.autres,
  };
  const rpeArrondi = ctx.moyenneRpe === null ? null : Math.round(ctx.moyenneRpe * 10) / 10;

  switch (type) {
    case 'allegement_jour':
      return {
        ...base,
        raison:
          'Douleur ≥ 5/10 ou énergie ≤ 2/5 aujourd’hui : la séance bascule en version allégée (EF courte, mobilité, marche). Écoute ton corps, la constance prime.',
        details: { joursDegrades: ctx.joursDegrades },
      };
    case 'decharge_hebdo':
      return {
        ...base,
        raison: `${ctx.joursDegrades} jours dégradés consécutifs : une semaine de décharge (volume −40 %) est proposée pour récupérer.`,
        details: { joursDegrades: ctx.joursDegrades },
      };
    case 'ralentir_progression':
      return {
        ...base,
        raison: `RPE moyen ${rpeArrondi ?? '?'} > 8 sur 14 jours : la progression des charges est ralentie pour éviter la surcharge.`,
        details: { rpeMoyen: rpeArrondi ?? -1 },
      };
    case 'progression_normale':
      return {
        ...base,
        raison:
          'Aucun signal dégradé sur 14 jours et RPE maîtrisé : feu vert pour la progression normale de phase.',
        details: { rpeMoyen: rpeArrondi ?? -1 },
      };
    default:
      return {
        ...base,
        raison: 'Rien à signaler : on suit le plan prévu.',
      };
  }
}
