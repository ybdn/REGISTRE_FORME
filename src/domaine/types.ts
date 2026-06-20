// Modèle de domaine de REGISTRE.FORME — code métier en français, sans dépendance Expo.
// Tout est pur et sérialisable (stockable en SQLite / exportable en JSON).

/** Date civile locale au format ISO court `AAAA-MM-JJ`. */
export type DateISO = string;

/** Phases du programme périodisé 16 semaines. */
export type Phase = 'reprise' | 'construction' | 'performance';

/** Type de séance — pilote la signature couleur du tableau de bord. */
export type TypeSeance = 'course' | 'salle' | 'freeletics' | 'sante';

/**
 * Niveau appliqué à une séance par le moteur d'adaptation, du plus au moins
 * intense : `normale` → `moderee` (−20 % volume) → `allegee` → `repos`.
 */
export type VarianteSeance = 'normale' | 'moderee' | 'allegee' | 'repos';

/**
 * Entrée quotidienne du journal Crohn (saisie < 20 s).
 * Échelles : douleur 0-10, énergie 1-5, digestion 1-5, consistance 1-7 (Bristol).
 */
export interface EntreeJournal {
  date: DateISO;
  douleur: number; // 0-10 (0 = aucune)
  energie: number; // 1-5 (5 = pleine forme)
  digestion: number; // 1-5 (5 = parfaite)
  nbSelles: number;
  /** Échelle de Bristol 1-7 (1 = durs/constipation, 4 = normale, 7 = entièrement liquide). */
  consistanceSelles: number;
  sangSelles: boolean; // sang visible — symptôme d'alerte MICI
  glaires: boolean; // marqueur fréquent de poussée inflammatoire
  urgenceFecale: boolean; // besoin impérieux / difficulté à se retenir
  difficulteEvacuation: boolean; // constipation, efforts importants
  ballonnements: boolean;
  tags: string[]; // ex. ['repas-gras', 'stress']
  note?: string;
}

/**
 * Aliments et boissons consommés sur une journée (chips de texte libre,
 * noms normalisés par `normaliserAliment`). Pas de repas structurés : saisie express.
 */
export interface ConsommationJour {
  date: DateISO;
  aliments: string[]; // ex. ['café', 'pizza', 'yaourt nature']
}

/** Statut manuel posé par l'utilisateur sur un aliment (prime sur le verdict auto). */
export type StatutAliment = 'tolere' | 'a-eviter' | 'a-tester';

/** Statut manuel d'un aliment, daté pour la transparence de la `raison` affichée. */
export interface StatutAlimentManuel {
  aliment: string;
  statut: StatutAliment;
  dateMaj: DateISO;
}

/** Charge réalisée sur un exercice de salle. */
export interface ChargeExercice {
  exercice: string;
  series: number;
  reps: number;
  chargeKg: number;
}

/** Provenance d'une séance réalisée : saisie dans l'app ou importée de Santé Connect. */
export type SourceSeance = 'app' | 'sante_connect';

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
  source?: SourceSeance; // absent = 'app' (défaut historique)
  idExterne?: string; // id chez la source externe — clé de dédoublonnage
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
  | 'mode_pousse'
  | 'allegement_jour'
  | 'decharge_hebdo'
  | 'lisser_charge'
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
  /**
   * Niveau de séance effectif du jour (gradué par le score de forme, puis plafonné
   * par les garde-fous : ≤ allégée si jour dégradé, ≤ modérée si charge à lisser).
   */
  niveauSeance: VarianteSeance;
  /** Score de forme du jour (0-100), ou `null` si le journal n'est pas saisi. */
  score: number | null;
  /** Autres règles dont les conditions étaient réunies mais non appliquées (transparence). */
  reglesAussiDeclenchees: TypeAdaptation[];
  details?: Record<string, number | string | boolean>;
}

/** Contexte fourni au moteur pour évaluer une journée donnée. */
export interface ContexteAdaptation {
  date: DateISO;
  journal: EntreeJournal[];
  seances: SeanceRealisee[];
  /**
   * Mode poussée actif (déclaré par l'utilisateur) : le plan se met en pause au
   * profit d'un maintien minimal. Optionnel ⇒ rétro-compatible (défaut : inactif).
   */
  modePousse?: boolean;
}
