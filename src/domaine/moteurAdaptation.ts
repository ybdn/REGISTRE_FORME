import { type Baseline, calculerBaseline, seuilDegradeRelatif } from './baseline';
import { acwr } from './chargeEntrainement';
import {
  ACWR_SEUIL_RISQUE,
  ACWR_ZONE_HAUTE,
  BASELINE_DOULEUR_BASSE,
  FENETRE_FEU_VERT_JOURS,
  FENETRE_RPE_JOURS,
  JOURS_DEGRADES_DECHARGE,
  PLAFOND_DOULEUR_ABSOLU,
  SEUIL_DOULEUR,
  SEUIL_ENERGIE,
  SEUIL_RPE_FEU_VERT,
  SEUIL_RPE_RALENTIR,
} from './constantes';
import { ecartJours } from './dates';
import { calculerScoreForme, niveauSeanceSelonScore } from './scoreForme';
import type {
  Adaptation,
  ContexteAdaptation,
  DateISO,
  EntreeJournal,
  SeanceRealisee,
  TypeAdaptation,
  VarianteSeance,
} from './types';

// Primitives de charge ré-exportées ici pour conserver l'API historique du moteur.
export { chargeSeance, chargeHebdomadaire } from './chargeEntrainement';

// ─────────────────────────────────────────────────────────────────────────────
// MOTEUR D'ADAPTATION v2 (cf. doc 02 §2.1-2.3)
//
// Règles déterministes, lisibles, expliquées à l'utilisateur. Aucune boîte noire,
// aucun appel réseau. Une seule adaptation est appliquée par jour : la première
// applicable l'emporte selon l'ordre « sécurité d'abord ».
//
// v2 ajoute la personnalisation : la baseline de douleur rend les seuils relatifs
// à « ta normale », le score de forme gradue la séance, l'ACWR surveille la charge.
// Règle d'or : la personnalisation ne peut qu'AJOUTER des déclenchements par
// rapport aux garde-fous absolus — jamais en retirer.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Un jour est « dégradé » si l'un des critères suivants est vrai (relatif OU absolu).
 *
 * Relatif (uniquement si une baseline existe) :
 *   douleur ≥ baseline + max(2, 2 × MAD)
 *
 * Absolu (garde-fous, jamais désactivables par la personnalisation) :
 *   douleur ≥ 7                              (plafond MICI)
 *   OU énergie ≤ 2                           (bas dans l'absolu)
 *   OU douleur ≥ 5 ET (baseline < 3 ou nulle) (ancien seuil v1 tant que la baseline est basse)
 *
 * `baseline` optionnel ⇒ rétro-compatible : sans baseline, seuls les seuils
 * absolus s'appliquent (comportement v1 strict).
 */
export function estJourDegrade(e: EntreeJournal, baseline?: Baseline | null): boolean {
  const relatif = baseline != null && e.douleur >= seuilDegradeRelatif(baseline);

  const baselineBasse = baseline == null || baseline.valeur < BASELINE_DOULEUR_BASSE;
  const absolu =
    e.douleur >= PLAFOND_DOULEUR_ABSOLU ||
    e.energie <= SEUIL_ENERGIE ||
    (e.douleur >= SEUIL_DOULEUR && baselineBasse);

  return relatif || absolu;
}

/** Retrouve l'entrée de journal d'une date précise. */
export function entreeDuJour(journal: EntreeJournal[], date: DateISO): EntreeJournal | undefined {
  return journal.find((e) => e.date === date);
}

/**
 * Compte les jours dégradés consécutifs se terminant à `date` (incluse).
 * Une journée sans entrée de journal rompt la série (signal absent ≠ dégradé).
 * La baseline est recalculée pour chaque jour examiné (seuils glissants).
 */
export function joursDegradesConsecutifs(journal: EntreeJournal[], date: DateISO): number {
  const parDate = new Map(journal.map((e) => [e.date, e]));
  let compte = 0;
  // On remonte jour par jour tant que la journée existe ET est dégradée.
  for (let i = 0; ; i++) {
    const jour = decalerISO(date, -i);
    const e = parDate.get(jour);
    if (!e || !estJourDegrade(e, calculerBaseline(journal, jour))) break;
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

/**
 * Vrai si aucun jour dégradé n'apparaît dans la fenêtre (date incluse).
 * La baseline est recalculée pour chaque jour (seuils glissants).
 */
export function aucunJourDegrade(
  journal: EntreeJournal[],
  date: DateISO,
  fenetre = FENETRE_FEU_VERT_JOURS,
): boolean {
  return !journal.some((e) => {
    const ecart = ecartJours(date, e.date);
    return ecart >= 0 && ecart < fenetre && estJourDegrade(e, calculerBaseline(journal, e.date));
  });
}

// Intensité croissante des niveaux de séance : un plafond ne laisse jamais
// remonter au-dessus de lui (mais autorise plus doux, ex. repos sous « allégée »).
const ORDRE_INTENSITE: VarianteSeance[] = ['repos', 'allegee', 'moderee', 'normale'];

/** Plafonne un niveau de séance à une intensité maximale (sans jamais le durcir). */
function plafonnerNiveau(niveau: VarianteSeance, plafond: VarianteSeance): VarianteSeance {
  return ORDRE_INTENSITE.indexOf(niveau) <= ORDRE_INTENSITE.indexOf(plafond) ? niveau : plafond;
}

/**
 * Évalue l'adaptation du jour. Une seule décision est appliquée — la première
 * règle applicable selon l'ordre de priorité « sécurité d'abord » :
 *   1. allegement_jour      (signal santé dégradé aujourd'hui)
 *   2. decharge_hebdo       (≥ 3 jours dégradés consécutifs)
 *   3. lisser_charge        (ACWR > 1,5 — NOUVEAU)
 *   4. ralentir_progression (RPE moyen > 8 sur 14 j)
 *   5. progression_normale  (0 jour dégradé 14 j ET RPE ≤ 8 ET ACWR ≤ 1,3)
 *
 * Indépendamment de la règle retenue, `niveauSeance` est gradué par le score de
 * forme puis plafonné par les garde-fous (≤ allégée si jour dégradé, ≤ modérée si
 * charge à lisser). Les règles non appliquées sont reportées dans
 * `reglesAussiDeclenchees` (transparence).
 */
export function evaluerAdaptation(ctx: ContexteAdaptation): Adaptation {
  const { date, journal, seances } = ctx;

  const baseline = calculerBaseline(journal, date);
  const acwrJour = acwr(seances, date);
  const entree = entreeDuJour(journal, date);
  const score = entree ? calculerScoreForme({ entree, baseline, acwr: acwrJour }).score : null;

  // Règle 0 — mode poussée actif : le plan est en pause, seul un maintien minimal
  // est proposé (marche, mobilité, respiration), sans aucune notion d'échec. Cette
  // règle prime sur toutes les autres ; le journal reste central pendant la poussée.
  if (ctx.modePousse) {
    return {
      type: 'mode_pousse',
      date,
      annulable: true,
      niveauSeance: 'allegee',
      score,
      reglesAussiDeclenchees: [],
      raison:
        'Mode poussée actif : le plan est en pause. Maintien minimal seulement ' +
        '(marche, mobilité, respiration) — aucune contrainte, aucun échec. Continue ' +
        'à remplir ton journal : c’est maintenant qu’il compte le plus pour ton gastro.',
    };
  }

  const degradeAuj = entree !== undefined && estJourDegrade(entree, baseline);

  const joursDegrades = joursDegradesConsecutifs(journal, date);
  const moyenneRpe = rpeMoyen(seances, date);
  const feuVert =
    aucunJourDegrade(journal, date) &&
    moyenneRpe !== null &&
    moyenneRpe <= SEUIL_RPE_FEU_VERT &&
    // Feu vert enrichi : la charge doit aussi être maîtrisée. ACWR null (< 21 j de
    // données) ne bloque PAS — pas de pénalité tant que l'historique est court.
    (acwrJour === null || acwrJour <= ACWR_ZONE_HAUTE);

  // Niveau de séance gradué par le score, puis plafonné par les garde-fous.
  let niveauSeance: VarianteSeance = score !== null ? niveauSeanceSelonScore(score) : 'normale';
  if (acwrJour !== null && acwrJour > ACWR_SEUIL_RISQUE) {
    niveauSeance = plafonnerNiveau(niveauSeance, 'moderee');
  }
  if (degradeAuj) niveauSeance = plafonnerNiveau(niveauSeance, 'allegee');

  // Règles ordinaires (le mode poussée, règle 0, a déjà court-circuité plus haut).
  type ReglesOrdinaires = Exclude<TypeAdaptation, 'aucune' | 'mode_pousse'>;

  // Conditions de chaque règle, évaluées indépendamment.
  const conditions: Record<ReglesOrdinaires, boolean> = {
    allegement_jour: degradeAuj,
    decharge_hebdo: joursDegrades >= JOURS_DEGRADES_DECHARGE,
    lisser_charge: acwrJour !== null && acwrJour > ACWR_SEUIL_RISQUE,
    ralentir_progression: moyenneRpe !== null && moyenneRpe > SEUIL_RPE_RALENTIR,
    progression_normale: feuVert,
  };

  // Ordre de priorité « sécurité d'abord ».
  const priorite: ReglesOrdinaires[] = [
    'allegement_jour',
    'decharge_hebdo',
    'lisser_charge',
    'ralentir_progression',
    'progression_normale',
  ];

  const declenchees = priorite.filter((t) => conditions[t]);
  const retenue = declenchees[0] ?? 'aucune';

  return construireAdaptation(retenue, {
    date,
    entree,
    baseline,
    acwr: acwrJour,
    score,
    niveauSeance,
    joursDegrades,
    moyenneRpe,
    autres: declenchees.filter((t) => t !== retenue),
  });
}

/** Formate un nombre en français (séparateur décimal virgule), arrondi à 1 décimale. */
function fr(n: number): string {
  return (Math.round(n * 10) / 10).toString().replace('.', ',');
}

interface ContexteRaison {
  date: DateISO;
  entree: EntreeJournal | undefined;
  baseline: Baseline | null;
  acwr: number | null;
  score: number | null;
  niveauSeance: VarianteSeance;
  joursDegrades: number;
  moyenneRpe: number | null;
  autres: TypeAdaptation[];
}

function construireAdaptation(type: TypeAdaptation, ctx: ContexteRaison): Adaptation {
  const base = {
    type,
    date: ctx.date,
    annulable: type !== 'aucune',
    niveauSeance: ctx.niveauSeance,
    score: ctx.score,
    reglesAussiDeclenchees: ctx.autres,
  };
  const rpeArrondi = ctx.moyenneRpe === null ? null : Math.round(ctx.moyenneRpe * 10) / 10;
  const mentionScore = ctx.score !== null ? ` Score de forme ${ctx.score}/100.` : '';

  switch (type) {
    case 'allegement_jour': {
      const douleur = ctx.entree?.douleur ?? 0;
      const energie = ctx.entree?.energie ?? 5;
      // Cite la normale personnelle quand elle existe : le cœur de la personnalisation.
      const contexteBaseline = ctx.baseline
        ? `, alors que ta normale des 4 dernières semaines est ${fr(ctx.baseline.valeur)}/10`
        : '';
      return {
        ...base,
        raison: `Journée dégradée : douleur ${douleur}/10${contexteBaseline} (énergie ${energie}/5). La séance est plafonnée à « allégée ».${mentionScore} Écoute ton corps, la constance prime.`,
        details: { joursDegrades: ctx.joursDegrades, douleur },
      };
    }
    case 'decharge_hebdo':
      return {
        ...base,
        raison: `${ctx.joursDegrades} jours dégradés consécutifs : une semaine de décharge (volume −40 %) est proposée pour récupérer.${mentionScore}`,
        details: { joursDegrades: ctx.joursDegrades },
      };
    case 'lisser_charge':
      return {
        ...base,
        raison: `Ta charge récente grimpe vite (ACWR ${fr(ctx.acwr ?? 0)} > 1,5) : la prochaine séance passe en « modérée » pour lisser la charge et limiter le risque de surmenage.${mentionScore}`,
        details: { acwr: ctx.acwr ?? -1 },
      };
    case 'ralentir_progression':
      return {
        ...base,
        raison: `RPE moyen ${rpeArrondi ?? '?'} > 8 sur 14 jours : la progression des charges est gelée pour éviter la surcharge.`,
        details: { rpeMoyen: rpeArrondi ?? -1 },
      };
    case 'progression_normale': {
      const contexteAcwr =
        ctx.acwr !== null ? ` et charge sous contrôle (ACWR ${fr(ctx.acwr)} ≤ 1,3)` : '';
      return {
        ...base,
        raison: `Aucun signal dégradé sur 14 jours, RPE maîtrisé (${rpeArrondi ?? '?'})${contexteAcwr} : feu vert pour la progression de phase.${mentionScore}`,
        details: { rpeMoyen: rpeArrondi ?? -1, acwr: ctx.acwr ?? -1 },
      };
    }
    default:
      return {
        ...base,
        raison:
          ctx.score !== null
            ? `Rien à signaler — score de forme ${ctx.score}/100. On suit le plan prévu.`
            : 'Rien à signaler : on suit le plan prévu.',
      };
  }
}
