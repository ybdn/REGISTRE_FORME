import { calculerBaseline } from './baseline';
import {
  FENETRE_CORRELATION_JOURS,
  HORIZON_SUIVI_POUSSEE_JOURS,
  MARGE_POUSSEE_CORRELATION,
  MIN_ENTREES_CORRELATION,
  MIN_OCCURRENCES_CORRELATION,
  RATIO_CORRELATION_SIGNIFICATIF,
} from './constantes';
import { ajouterJours, ecartJours } from './dates';
import type { DateISO, EntreeJournal } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// CORRÉLATIONS SYMPTÔMES ↔ DÉCLENCHEURS — l'insight signature (cf. doc 03 §3.1)
//
// On croise chaque étiquette d'exposition (tag du journal : repas-gras, stress…
// ou aliment consommé, cf. alimentation.ts) avec la survenue d'une POUSSÉE de
// douleur dans les 48 h suivantes, par simple comptage :
//
//   pAvec = P(poussée dans 48 h | jour AVEC l'étiquette)
//   pSans = P(poussée dans 48 h | jour SANS l'étiquette)
//   ratio = pAvec / pSans      → significatif si ≥ 1,8 et ≥ 5 occurrences
//
// Une « poussée » = douleur > baseline + 1 (relatif à ta normale personnelle).
// Jamais de causalité affirmée : la formulation reste « sont suivies de », avec
// les effectifs. Garde-fous : 30 entrées de journal ET baseline disponible, sinon
// rien (pas de fausse certitude sur petits effectifs). Pur, recalculé à la volée.
// ─────────────────────────────────────────────────────────────────────────────

/** Une journée d'exposition à des étiquettes (tags du journal, aliments…). */
export interface Exposition {
  date: DateISO;
  etiquettes: string[];
}

/** Rédige la phrase affichée pour une corrélation (effectifs cités, pas de causalité). */
export type FormateurLibelle = (
  etiquette: string,
  nbAvecPoussee: number,
  occurrences: number,
  pctAvec: number,
  pctSans: number,
) => string;

/** Une corrélation étiquette ↔ poussée, sourcée et prête à afficher. */
export interface Correlation {
  /** L'étiquette analysée (ex. `repas-gras`, ou un aliment). */
  tag: string;
  /** Jours évaluables portant le tag (ceux dont les 48 h suivantes sont observables). */
  occurrences: number;
  /** Parmi ces occurrences, combien ont été suivies d'une poussée. */
  nbAvecPoussee: number;
  /** Proportion de poussées les jours AVEC le tag (0-1). */
  pAvec: number;
  /** Proportion de poussées les jours SANS le tag (0-1). */
  pSans: number;
  /** Ratio pAvec/pSans ; `Infinity` si aucune poussée sans le tag. */
  ratio: number;
  /** Seuil de douleur utilisé (baseline + 1), cité pour la transparence. */
  seuilDouleur: number;
  /** Dates des journées portant le tag (tap → liste des journées concernées). */
  jours: DateISO[];
  /** Phrase prête à afficher telle quelle, avec ses effectifs. */
  libelle: string;
}

/** Vrai si l'entrée porte une poussée de douleur (douleur > seuil). */
function estPoussee(entree: EntreeJournal | undefined, seuil: number): boolean {
  return entree !== undefined && entree.douleur > seuil;
}

/**
 * Vrai si l'analyse de corrélations est possible à cette date : ≥ 30 entrées de
 * journal sur la fenêtre ET baseline disponible (mêmes garde-fous que
 * `analyserExpositions`). Sert aux écrans à distinguer « pas encore assez de
 * données » de « analysé, aucun signal » — deux messages très différents.
 */
export function analysePossible(journal: EntreeJournal[], date: DateISO): boolean {
  const nbFenetre = journal.filter((e) => {
    const ecart = ecartJours(date, e.date);
    return ecart >= 0 && ecart < FENETRE_CORRELATION_JOURS;
  }).length;
  return nbFenetre >= MIN_ENTREES_CORRELATION && calculerBaseline(journal, date) !== null;
}

/**
 * Cœur générique : croise des journées d'exposition (tags du journal, aliments…)
 * avec les poussées de douleur du journal dans les 48 h suivantes. Renvoie les
 * corrélations significatives (ratio ≥ 1,8, ≥ 5 occurrences), de la plus forte
 * à la plus faible. Renvoie `[]` en démarrage à froid (< 30 entrées de journal
 * ou baseline indisponible) — on n'affiche aucune certitude trop tôt.
 */
export function analyserExpositions(
  journal: EntreeJournal[],
  expositions: Exposition[],
  date: DateISO,
  formaterLibelle: FormateurLibelle,
): Correlation[] {
  // Entrées de la fenêtre, indexées par date pour les lookups des 48 h suivantes.
  const fenetre = journal.filter((e) => {
    const ecart = ecartJours(date, e.date);
    return ecart >= 0 && ecart < FENETRE_CORRELATION_JOURS;
  });
  if (fenetre.length < MIN_ENTREES_CORRELATION) return [];

  const baseline = calculerBaseline(journal, date);
  if (baseline === null) return [];
  const seuil = baseline.valeur + MARGE_POUSSEE_CORRELATION;

  const parDate = new Map<DateISO, EntreeJournal>();
  for (const e of fenetre) parDate.set(e.date, e);

  /** Une journée est observable si au moins un jour des 48 h suivantes est saisi. */
  const suivants = (jour: DateISO): EntreeJournal[] => {
    const res: EntreeJournal[] = [];
    for (let d = 1; d <= HORIZON_SUIVI_POUSSEE_JOURS; d++) {
      const suiv = parDate.get(ajouterJours(jour, d));
      if (suiv !== undefined) res.push(suiv);
    }
    return res;
  };

  const expositionsFenetre = expositions.filter((x) => {
    const ecart = ecartJours(date, x.date);
    return ecart >= 0 && ecart < FENETRE_CORRELATION_JOURS;
  });

  // Jours évaluables (48 h suivantes observables) + leur statut « suivi d'une poussée ».
  const evaluables = expositionsFenetre
    .map((x) => ({ exposition: x, suivants: suivants(x.date) }))
    .filter((x) => x.suivants.length > 0)
    .map((x) => ({
      exposition: x.exposition,
      poussee: x.suivants.some((s) => estPoussee(s, seuil)),
    }));

  const toutesLesEtiquettes = new Set<string>();
  for (const x of evaluables) for (const t of x.exposition.etiquettes) toutesLesEtiquettes.add(t);

  const correlations: Correlation[] = [];
  for (const etiquette of toutesLesEtiquettes) {
    const avec = evaluables.filter((x) => x.exposition.etiquettes.includes(etiquette));
    if (avec.length < MIN_OCCURRENCES_CORRELATION) continue;
    const sans = evaluables.filter((x) => !x.exposition.etiquettes.includes(etiquette));
    // Étiquette présente sur TOUTES les journées évaluables : aucun groupe de
    // comparaison → aucune affirmation possible (« contre 0 % sans » serait calculé
    // sur zéro observation). Pas de fausse certitude.
    if (sans.length === 0) continue;

    const nbAvecPoussee = avec.filter((x) => x.poussee).length;
    const nbSansPoussee = sans.filter((x) => x.poussee).length;
    const pAvec = nbAvecPoussee / avec.length;
    const pSans = nbSansPoussee / sans.length;
    const ratio = pSans === 0 ? (pAvec > 0 ? Number.POSITIVE_INFINITY : 0) : pAvec / pSans;

    if (ratio < RATIO_CORRELATION_SIGNIFICATIF) continue;

    const pctAvec = Math.round(pAvec * 100);
    const pctSans = Math.round(pSans * 100);
    correlations.push({
      tag: etiquette,
      occurrences: avec.length,
      nbAvecPoussee,
      pAvec,
      pSans,
      ratio,
      seuilDouleur: seuil,
      jours: avec.map((x) => x.exposition.date).sort(),
      libelle: formaterLibelle(etiquette, nbAvecPoussee, avec.length, pctAvec, pctSans),
    });
  }

  // Les plus significatives d'abord (ratio décroissant, puis plus d'occurrences).
  return correlations.sort((a, b) => b.ratio - a.ratio || b.occurrences - a.occurrences);
}

/**
 * Analyse les tags du journal sur les 90 derniers jours (wrapper du cœur
 * générique : chaque entrée du journal est une journée d'exposition à ses tags).
 */
export function analyserTags(journal: EntreeJournal[], date: DateISO): Correlation[] {
  return analyserExpositions(
    journal,
    journal.map((e) => ({ date: e.date, etiquettes: e.tags })),
    date,
    (tag, nbAvecPoussee, occurrences, pctAvec, pctSans) =>
      `Sur ${FENETRE_CORRELATION_JOURS} jours, les journées « ${tag} » sont suivies ` +
      `d'une poussée de douleur dans ${nbAvecPoussee} cas sur ${occurrences} (${pctAvec} %), ` +
      `contre ${pctSans} % sans ce tag.`,
  );
}

/**
 * Corrélation la plus significative (pour le bilan hebdo qui n'en montre qu'une),
 * ou `null` si aucune n'atteint le seuil.
 */
export function correlationLaPlusSignificative(
  journal: EntreeJournal[],
  date: DateISO,
): Correlation | null {
  return analyserTags(journal, date)[0] ?? null;
}
