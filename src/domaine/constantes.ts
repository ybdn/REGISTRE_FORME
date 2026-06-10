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
