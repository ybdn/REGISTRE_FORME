import type { Baseline } from './baseline';
import {
  ACWR_SURCHARGE_NULLE,
  ACWR_ZONE_BASSE,
  ACWR_ZONE_HAUTE,
  AMPLITUDE_DOULEUR_SCORE,
  POIDS_SCORE,
  SCORE_NIVEAU_ALLEGEE,
  SCORE_NIVEAU_MODEREE,
  SCORE_NIVEAU_NORMALE,
} from './constantes';
import type { EntreeJournal, VarianteSeance } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// SCORE DE FORME QUOTIDIEN — « readiness » 0-100 (cf. doc 02 §2.2)
//
// Composite TRANSPARENT et décomposé : quatre sous-scores ∈ [0, 1] pondérés.
// Jamais un chiffre magique — l'UI affiche les barres par composante.
//
//   Douleur vs baseline 35 % · Énergie 25 % · Digestion 15 % · Charge (ACWR) 25 %
//
// Le score raffine la règle 1 du moteur en quatre niveaux de séance gradués.
// ─────────────────────────────────────────────────────────────────────────────

const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));

/** Une composante du score, prête pour l'affichage décomposé (barres). */
export interface ComposanteScore {
  cle: 'douleur' | 'energie' | 'digestion' | 'charge';
  libelle: string;
  poids: number; // part dans le total (0-1)
  sousScore: number; // état de la composante (0-1)
  points: number; // contribution au score final (poids × sousScore × 100)
}

/** Résultat du score de forme : total + sa décomposition. */
export interface ScoreForme {
  score: number; // 0-100, entier
  composantes: ComposanteScore[];
}

/** Contexte minimal pour évaluer la forme d'un jour. */
export interface ContexteScore {
  entree: EntreeJournal;
  baseline: Baseline | null;
  /** ACWR du jour, ou `null` si non calculable (< 21 j de données). */
  acwr: number | null;
}

/**
 * Sous-score de douleur : 1 quand la douleur est à la baseline (ou en dessous),
 * décroît jusqu'à 0 quand elle dépasse la baseline de 6 points. En démarrage à
 * froid (baseline null), on prend 0 comme référence : le score reflète alors la
 * douleur absolue, sans pénalité personnalisée.
 */
function sousScoreDouleur(douleur: number, baseline: Baseline | null): number {
  const reference = baseline?.valeur ?? 0;
  return 1 - clamp01((douleur - reference) / AMPLITUDE_DOULEUR_SCORE);
}

/**
 * Sous-score de charge : 1 dans la zone optimale d'ACWR [0,8 ; 1,3], décroissance
 * linéaire de part et d'autre (sous-charge vers 0, surcharge vers ACWR 2,0). ACWR
 * null ⇒ composante NEUTRE (1) : pas de pénalité tant que l'historique est court.
 */
function sousScoreCharge(acwr: number | null): number {
  if (acwr === null) return 1;
  if (acwr >= ACWR_ZONE_BASSE && acwr <= ACWR_ZONE_HAUTE) return 1;
  if (acwr < ACWR_ZONE_BASSE) return clamp01(acwr / ACWR_ZONE_BASSE);
  return clamp01(1 - (acwr - ACWR_ZONE_HAUTE) / (ACWR_SURCHARGE_NULLE - ACWR_ZONE_HAUTE));
}

/** Calcule le score de forme et sa décomposition à partir du contexte du jour. */
export function calculerScoreForme(ctx: ContexteScore): ScoreForme {
  const { entree, baseline, acwr } = ctx;

  const sousScores = {
    douleur: sousScoreDouleur(entree.douleur, baseline),
    energie: clamp01((entree.energie - 1) / 4),
    digestion: clamp01((entree.digestion - 1) / 4),
    charge: sousScoreCharge(acwr),
  };

  const libelles: Record<ComposanteScore['cle'], string> = {
    douleur: 'Douleur',
    energie: 'Énergie',
    digestion: 'Digestion',
    charge: 'Charge',
  };

  const composantes: ComposanteScore[] = (Object.keys(POIDS_SCORE) as ComposanteScore['cle'][]).map(
    (cle) => {
      const poids = POIDS_SCORE[cle];
      const sousScore = sousScores[cle];
      return { cle, libelle: libelles[cle], poids, sousScore, points: poids * sousScore * 100 };
    },
  );

  const score = Math.round(composantes.reduce((acc, c) => acc + c.points, 0));
  return { score, composantes };
}

/**
 * Niveau de séance gradué déduit du score (avant tout plafonnement de sécurité) :
 *   ≥ 75 normale · 50-74 modérée (−20 %) · 30-49 allégée · < 30 repos.
 */
export function niveauSeanceSelonScore(score: number): VarianteSeance {
  if (score >= SCORE_NIVEAU_NORMALE) return 'normale';
  if (score >= SCORE_NIVEAU_MODEREE) return 'moderee';
  if (score >= SCORE_NIVEAU_ALLEGEE) return 'allegee';
  return 'repos';
}
