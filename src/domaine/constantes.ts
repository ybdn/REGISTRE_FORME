// Seuils du moteur d'adaptation — centralisés, lisibles, faciles à expliquer en consultation.
// Toute modification d'une règle métier passe par ici (et par ses tests).

/** Un jour est « dégradé » si la douleur atteint ce seuil… */
export const SEUIL_DOULEUR = 5; // douleur >= 5/10

/** …ou si l'énergie tombe à ce niveau ou en dessous. */
export const SEUIL_ENERGIE = 2; // energie <= 2/5

/** Nombre de jours dégradés consécutifs déclenchant une proposition de décharge hebdo. */
export const JOURS_DEGRADES_DECHARGE = 3;

/** Réduction de volume appliquée lors d'une semaine de décharge. */
export const REDUCTION_DECHARGE = 0.4; // −40 %

/** Fenêtre glissante (jours) pour la moyenne de RPE. */
export const FENETRE_RPE_JOURS = 14;

/** Au-dessus de cette moyenne de RPE sur la fenêtre, on ralentit la progression des charges. */
export const SEUIL_RPE_RALENTIR = 8;

/** Fenêtre glissante (jours) du « feu vert » pour proposer la progression normale. */
export const FENETRE_FEU_VERT_JOURS = 14;

/** RPE moyen maximal toléré pour considérer que « tout va bien ». */
export const SEUIL_RPE_FEU_VERT = 8;

/** Incrément de charge par défaut en salle (progression linéaire débutant). */
export const INCREMENT_CHARGE_KG = 2.5;

/** Découpage des phases du programme 16 semaines (bornes incluses). */
export const BORNES_PHASES = {
  reprise: { debut: 1, fin: 4 },
  construction: { debut: 5, fin: 10 },
  performance: { debut: 11, fin: 16 },
} as const;

/** Semaines de tests chronométrés 3000 m. */
export const SEMAINES_TEST_CHRONO = [14, 16] as const;

// ─────────────────────────────────────────────────────────────────────────────
// PERSONNALISATION v2 — baseline, score de forme, charge (cf. doc 02 §2.1-2.3).
// Toutes révisables en consultation ; chaque constante est un curseur explicable.
// ─────────────────────────────────────────────────────────────────────────────

// ── Baseline personnelle (§2.1) ──────────────────────────────────────────────

/** Fenêtre glissante (jours) de la baseline de douleur : médiane + MAD. */
export const FENETRE_BASELINE_JOURS = 28;

/** En deçà de ce nombre d'entrées sur la fenêtre, baseline = null (démarrage à froid → seuils v1). */
export const MIN_ENTREES_BASELINE = 14;

/** Garde-fou MICI : une douleur à ce niveau est TOUJOURS dégradée, baseline ou pas (jamais désactivable). */
export const PLAFOND_DOULEUR_ABSOLU = 7;

/** Tant que la baseline reste sous ce niveau (ou est nulle), l'ancien seuil absolu douleur ≥ 5 reste actif. */
export const BASELINE_DOULEUR_BASSE = 3;

/** Marge minimale (points de douleur) au-dessus de la baseline pour déclencher le seuil relatif : max(2, 2×MAD). */
export const MARGE_DEGRADE_RELATIVE_MIN = 2;

// ── Score de forme (§2.2) ────────────────────────────────────────────────────

/** Poids des quatre composantes du score de forme (somme = 1). */
export const POIDS_SCORE = {
  douleur: 0.35,
  energie: 0.25,
  digestion: 0.15,
  charge: 0.25,
} as const;

/** Amplitude de douleur (au-dessus de la baseline) qui annule la composante douleur : (douleur − baseline)/6. */
export const AMPLITUDE_DOULEUR_SCORE = 6;

/** Seuils de score découpant les quatre niveaux de séance (cf. niveauSeance). */
export const SCORE_NIVEAU_NORMALE = 75; // ≥ 75 → séance normale, progression autorisée
export const SCORE_NIVEAU_MODEREE = 50; // 50-74 → modérée (−20 % volume, pas de progression)
export const SCORE_NIVEAU_ALLEGEE = 30; // 30-49 → allégée ; < 30 → repos

/** Réduction de volume d'une séance « modérée » (1 série de moins / −20 % de durée). */
export const REDUCTION_MODEREE = 0.2;

// ── Charge d'entraînement : ACWR, monotonie (§2.3) ───────────────────────────

/** Fenêtre aiguë de l'ACWR (charge des 7 derniers jours). */
export const FENETRE_CHARGE_AIGUE = 7;

/** Fenêtre chronique de l'ACWR (4 semaines : moyenne hebdo sur 28 j). */
export const FENETRE_CHARGE_CHRONIQUE = 28;

/** Sous ce nombre de jours d'historique de séances, l'ACWR n'est pas calculable (null). */
export const MIN_JOURS_ACWR = 21;

/** Borne basse de la zone optimale d'ACWR (sous-charge en dessous). */
export const ACWR_ZONE_BASSE = 0.8;

/** Borne haute de la zone optimale d'ACWR (vigilance au-dessus). */
export const ACWR_ZONE_HAUTE = 1.3;

/** Au-dessus de ce ratio, le moteur lisse la charge (séance modérée) — règle `lisser_charge`. */
export const ACWR_SEUIL_RISQUE = 1.5;

/** Au-delà de cet ACWR, la composante charge du score tombe à 0 (décroissance linéaire depuis la zone haute). */
export const ACWR_SURCHARGE_NULLE = 2.0;

/** Au-dessus de cette monotonie (Foster), l'entraînement est trop uniforme (facteur de surmenage). */
export const MONOTONIE_SEUIL = 2;

// ─────────────────────────────────────────────────────────────────────────────
// COACHING DE SÉANCE v2 — progression par exercice, allures (cf. doc 02 §2.4-2.5).
// ─────────────────────────────────────────────────────────────────────────────

// ── Double progression par exercice (§2.4) ───────────────────────────────────

/** Fourchette de répétitions par défaut des exercices de salle (double progression). */
export const FOURCHETTE_REPS_DEFAUT = { min: 8, max: 12 } as const;

/** Nombre de séances d'historique considérées pour calculer la prochaine cible. */
export const FENETRE_PROGRESSION_SEANCES = 10;

/** RPE de séance maximal pour qu'une séance compte comme « réussie » (progression possible). */
export const RPE_SEANCE_REUSSIE = 8;

/** Incrément de charge bas du corps : +5 kg ou +5 %, le plus petit des deux. */
export const INCREMENT_BAS_CORPS = { kg: 5, pct: 0.05 } as const;

/** Incrément de charge haut du corps : +2,5 kg ou +2,5 %, le plus petit des deux. */
export const INCREMENT_HAUT_CORPS = { kg: 2.5, pct: 0.025 } as const;

/** Nombre de séances consécutives sans progression déclenchant la détection de plateau. */
export const SEANCES_PLATEAU = 3;

/** Décharge ciblée proposée sur un exercice en plateau (−10 % puis remontée). */
export const REDUCTION_PLATEAU = 0.1;

/** À partir de cette absence de salle (jours), la reprise réduit les charges. */
export const ABSENCE_REPRISE_JOURS = 7;

/** Réduction de charge à la reprise : −10 % par tranche de 7 jours d'absence… */
export const REDUCTION_REPRISE_PAR_SEMAINE = 0.1;

/** …plafonnée à −30 % (plancher de sécurité, jamais en dessous). */
export const REDUCTION_REPRISE_MAX = 0.3;

// ── Allures de course personnalisées (§2.5) ──────────────────────────────────

/** VMA estimée = vitesse moyenne du test 3000 m × 1,05 (test couru entre 12 et 20 min). */
export const FACTEUR_VMA_TEST = 1.05;

/** Un chrono ≤ 8 min est traité en demi-Cooper : la vitesse moyenne EST la VMA (facteur 1). */
export const DUREE_MAX_DEMI_COOPER_SEC = 8 * 60;

/** Lissage des tests successifs : 70 % nouveau / 30 % ancien (amortit les jours sans). */
export const LISSAGE_VMA_NOUVEAU = 0.7;

/** Zones d'allure cible en % de VMA. */
export const PCT_VMA_EF = { min: 0.6, max: 0.7 } as const; // endurance fondamentale / sortie longue
export const PCT_VMA_3030 = 1.0; // portion « vite » du 30/30
export const PCT_VMA_400M = 0.95; // 400 m allure 3000

// ── Mode séance guidée (doc 04 §4.1) ─────────────────────────────────────────

/** Repos par défaut entre deux séries de salle (configurable pendant la séance). */
export const REPOS_SERIE_SEC = 90;

/** Haptique de fin de repos déclenchée à T−10 s (prévenir sans surprendre). */
export const PREAVIS_FIN_REPOS_SEC = 10;

// ─────────────────────────────────────────────────────────────────────────────
// INSIGHTS v2 — corrélations, records, tendances (cf. doc 03).
// Statistiques simples (comptages, médianes, ratios), jamais de modèle opaque ;
// chaque insight est sourcé (effectifs) et n'affirme jamais de causalité.
// ─────────────────────────────────────────────────────────────────────────────

// ── Corrélations symptômes ↔ déclencheurs (§3.1) ─────────────────────────────

/** Fenêtre d'analyse des corrélations (jours) : on croise les tags des 90 derniers jours. */
export const FENETRE_CORRELATION_JOURS = 90;

/** Un tag doit apparaître au moins ce nombre de fois (jours évaluables) pour être analysé. */
export const MIN_OCCURRENCES_CORRELATION = 5;

/** En deçà de ce nombre d'entrées de journal sur la fenêtre, aucune corrélation n'est affichée. */
export const MIN_ENTREES_CORRELATION = 30;

/** Horizon « suivant » d'un tag : une poussée comptée si elle survient dans les 2 jours (48 h). */
export const HORIZON_SUIVI_POUSSEE_JOURS = 2;

/** Marge au-dessus de la baseline définissant une « poussée » de douleur : douleur > baseline + 1. */
export const MARGE_POUSSEE_CORRELATION = 1;

/** Ratio pAvec/pSans à partir duquel une corrélation est jugée significative et affichée. */
export const RATIO_CORRELATION_SIGNIFICATIF = 1.8;

// ── Records personnels (§3.3) ────────────────────────────────────────────────

/** Diviseur de la formule d'Epley pour l'estimation du 1RM : charge × (1 + reps/30). */
export const DIVISEUR_EPLEY = 30;

/** Tolérance (km) autour de 3 km pour qu'un chrono compte comme un « 3000 m ». */
export const TOLERANCE_3000M_KM = 0.1;

/** Durée minimale (min) d'une sortie pour qu'elle compte au record d'allure EF. */
export const DUREE_MIN_ALLURE_EF_MIN = 30;

/** Jalon de constance : nombre de jours de journal consécutifs célébré. */
export const JALON_JOURNAL_CONSECUTIF = 28;

// ── Tendances visuelles & observance (§3.4-3.5) ──────────────────────────────

/** Fenêtre de la moyenne mobile (jours) : lissage du poids et des signaux santé. */
export const FENETRE_MOYENNE_MOBILE_JOURS = 7;

/** Nombre de semaines affichées par la heatmap calendrier (un programme complet). */
export const NB_SEMAINES_HEATMAP = 16;

/** Grâce hebdomadaire : un seul jour manquant par tranche de 7 jours n'interrompt pas la série. */
export const GRACE_OBSERVANCE_JOURS_PAR_SEMAINE = 1;

/** Variation (points de douleur) au-delà de laquelle la tendance hebdo n'est plus « stable ». */
export const SEUIL_TENDANCE_DOULEUR = 0.5;

/** Sous ce score de forme moyen, une journée/semaine est comptée « dégradée » dans le bilan. */
export const SEUIL_SCORE_DEGRADE_BILAN = 50;

// ─────────────────────────────────────────────────────────────────────────────
// PLAN VIVANT — replanification & mode poussée (cf. doc 02 §2.6).
// Jamais d'application silencieuse : le moteur propose, l'utilisateur valide.
// ─────────────────────────────────────────────────────────────────────────────

/** Jours dégradés consécutifs déclenchant la SUGGESTION (jamais l'activation) du mode poussée. */
export const JOURS_SUGGESTION_POUSSEE = 5;

/** Jours non dégradés consécutifs requis (en plus de la déclaration) pour sortir du mode poussée. */
export const JOURS_SORTIE_POUSSEE = 3;

/** Volumes des paliers de reprise post-poussée : −30 %, −15 %, puis retour à la trame. */
export const REPRISE_VOLUMES = [0.7, 0.85, 1.0] as const;

/** Score de forme moyen minimal sur la semaine pour valider un palier et passer au suivant. */
export const REPRISE_SCORE_MIN = 60;

// ─────────────────────────────────────────────────────────────────────────────
// HYDRATATION NETTE — suivi intelligent des apports vs pertes (cf. hydratation.ts).
// Bilan = apports pondérés (eau équivalente) − dette diurétique (café/alcool), comparé
// à un objectif ADAPTATIF (poids + sudation des séances + pertes digestives MICI).
// Modèle déterministe et explicable ; n'entre PAS dans le score de forme (garde-fou seulement).
// Coefficients inspirés du Beverage Hydration Index (Maughan 2016).
// ─────────────────────────────────────────────────────────────────────────────

/** Besoin de base : ~33 mL d'eau par kg de poids corporel et par jour. */
export const HYDRATATION_ML_PAR_KG = 33;

/** Plancher d'objectif (le besoin de base ne descend jamais sous ce seuil). */
export const HYDRATATION_OBJECTIF_PLANCHER_ML = 1500;

/** Objectif de base par défaut tant qu'aucun poids n'est connu (≈ 65 kg). */
export const HYDRATATION_OBJECTIF_DEFAUT_ML = 2000;

/**
 * Taux de sudation estimé (mL/min) par tranche d'effort perçu (RPE) — pertes à compenser.
 * De ~0,4 L/h (effort léger) à ~1,1 L/h (effort maximal). Déterministe et conservateur.
 */
export const SUDATION_ML_PAR_MIN = { leger: 6, modere: 10, soutenu: 14, intense: 18 } as const;

/** Nombre de selles considéré « normal » sur une journée : au-delà, perte hydrique comptée. */
export const SELLES_NORMALES_PAR_JOUR = 2;

/** Perte d'eau estimée par selle au-delà de la normale (selles molles = grosse perte sous MICI). */
export const PERTE_ML_PAR_SELLE_EXTRA = 150;

/** Diurèse de l'alcool : ~10 mL d'urine excrétée par gramme d'éthanol pur. */
export const ALCOOL_DIURESE_ML_PAR_G = 10;

/** Caféine : neutre au quotidien, dette diurétique seulement au-delà de cette dose/jour (mg). */
export const CAFEINE_SEUIL_DIURESE_MG = 300;

/** Au-delà du seuil, chaque mg de caféine « coûte » ce volume d'eau (mL). */
export const CAFEINE_DIURESE_ML_PAR_MG = 1;

/** Ratio (apport net / objectif) à partir duquel la journée est « bien hydratée ». */
export const HYDRATATION_SEUIL_OK = 0.9;

/** En dessous de ce ratio, la journée bascule en « déshydratation » (au-dessus = « à boire »). */
export const HYDRATATION_SEUIL_DESHYDRATATION = 0.6;

/** Sous ce ratio, le garde-fou avertit de s'hydrater AVANT l'effort (jamais bloquant). */
export const HYDRATATION_GARDE_FOU_RATIO = 0.5;
