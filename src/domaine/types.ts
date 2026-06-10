// Modèle de domaine de REGISTRE.FORME — code métier en français, sans dépendance Expo.
// Tout est pur et sérialisable (stockable en SQLite / exportable en JSON).

/** Date civile locale au format ISO court `AAAA-MM-JJ`. */
export type DateISO = string;

/** Phases du programme périodisé 16 semaines. */
export type Phase = 'reprise' | 'construction' | 'performance';

/** Type de séance — pilote la signature couleur du tableau de bord. */
export type TypeSeance = 'course' | 'salle' | 'freeletics' | 'sante';

/** Variante appliquée à une séance par le moteur d'adaptation. */
export type VarianteSeance = 'normale' | 'allegee';

/**
 * Entrée quotidienne du journal Crohn (saisie < 20 s).
 * Échelles : douleur 0-10, énergie 1-5, digestion 1-5.
 */
export interface EntreeJournal {
  date: DateISO;
  douleur: number; // 0-10 (0 = aucune)
  energie: number; // 1-5 (5 = pleine forme)
  digestion: number; // 1-5 (5 = parfaite)
  nbSelles: number;
  ballonnements: boolean;
  tags: string[]; // ex. ['repas-gras', 'stress']
  note?: string;
}

/** Charge réalisée sur un exercice de salle. */
export interface ChargeExercice {
  exercice: string;
  series: number;
  reps: number;
  chargeKg: number;
}

/** Séance effectivement réalisée et saisie après coup. */
export interface SeanceRealisee {
  id: string;
  date: DateISO;
  type: TypeSeance;
  variante: VarianteSeance;
  rpe: number; // 1-10 (effort perçu)
  dureeMin: number;
  distanceKm?: number;
  tempsSec?: number;
  charges?: ChargeExercice[];
  ressentiDigestif?: number; // 1-5 pendant l'effort
  note?: string;
}

/** Séance prévue dans une semaine planifiée. */
export interface SeancePlanifiee {
  jour: number; // 0 = lundi … 6 = dimanche (déplaçable)
  type: TypeSeance;
  modele: string; // identifiant d'un modèle de la bibliothèque
  titre: string;
}

/** Une des 16 semaines du programme. */
export interface SemainePlanifiee {
  numero: number; // 1-16
  phase: Phase;
  estDecharge: boolean; // volume réduit (−40 %)
  estTestChrono: boolean; // semaine de test 3000 m chronométré
  seances: SeancePlanifiee[];
}

/** Catégories d'adaptation décidées par le moteur. */
export type TypeAdaptation =
  | 'aucune'
  | 'allegement_jour'
  | 'decharge_hebdo'
  | 'ralentir_progression'
  | 'progression_normale';

/**
 * Décision du moteur d'adaptation : déterministe, traçable, annulable.
 * `raison` est rédigée pour être affichée telle quelle à l'utilisateur (pas de boîte noire).
 */
export interface Adaptation {
  type: TypeAdaptation;
  date: DateISO;
  raison: string;
  annulable: boolean;
  /** Autres règles dont les conditions étaient réunies mais non appliquées (transparence). */
  reglesAussiDeclenchees: TypeAdaptation[];
  details?: Record<string, number | string | boolean>;
}

/** Contexte fourni au moteur pour évaluer une journée donnée. */
export interface ContexteAdaptation {
  date: DateISO;
  journal: EntreeJournal[];
  seances: SeanceRealisee[];
}
