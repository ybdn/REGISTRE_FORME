import { INCREMENT_CHARGE_KG } from './constantes';
import type { TypeSeance } from './types';

// Bibliothèque de modèles de séances éditables. Les circuits Freeletics sont adaptés
// MICI : aucune hyperpression abdominale ni manœuvre de Valsalva sous charge.

export interface ExerciceModele {
  nom: string;
  series: number;
  reps: number;
  /** Charge de départ indicative (kg) pour les exercices de salle. */
  chargeDepartKg?: number;
  /** Progression linéaire par séance réussie. */
  incrementKg?: number;
  consigne?: string;
}

export interface ModeleSeance {
  id: string;
  titre: string;
  type: TypeSeance;
  dureeMin: number;
  exercices: ExerciceModele[];
  /** Note de sécurité MICI affichée avant la séance. */
  noteSecurite?: string;
}

const SECURITE_CHARGE =
  'Respiration continue, jamais en apnée sous charge. Hydratation avant/pendant. Pas d’intensité en pleine digestion.';

/** Salle A — full body machines guidées (débutant). */
const salleA: ModeleSeance = {
  id: 'salle-a',
  titre: 'Salle A — Full body machines',
  type: 'salle',
  dureeMin: 50,
  noteSecurite: SECURITE_CHARGE,
  exercices: [
    {
      nom: 'Presse à cuisses',
      series: 3,
      reps: 10,
      chargeDepartKg: 40,
      incrementKg: INCREMENT_CHARGE_KG,
    },
    {
      nom: 'Tirage poitrine (lat pulldown)',
      series: 3,
      reps: 10,
      chargeDepartKg: 25,
      incrementKg: INCREMENT_CHARGE_KG,
    },
    {
      nom: 'Développé poitrine machine',
      series: 3,
      reps: 10,
      chargeDepartKg: 20,
      incrementKg: INCREMENT_CHARGE_KG,
    },
    {
      nom: 'Leg curl machine',
      series: 3,
      reps: 12,
      chargeDepartKg: 20,
      incrementKg: INCREMENT_CHARGE_KG,
    },
    {
      nom: 'Gainage planche (respiration libre)',
      series: 3,
      reps: 30,
      consigne: 'secondes, sans pousser le ventre',
    },
  ],
};

/** Salle B — full body machines, variation. */
const salleB: ModeleSeance = {
  id: 'salle-b',
  titre: 'Salle B — Full body machines',
  type: 'salle',
  dureeMin: 50,
  noteSecurite: SECURITE_CHARGE,
  exercices: [
    {
      nom: 'Hack squat machine',
      series: 3,
      reps: 10,
      chargeDepartKg: 30,
      incrementKg: INCREMENT_CHARGE_KG,
    },
    {
      nom: 'Rowing assis machine',
      series: 3,
      reps: 10,
      chargeDepartKg: 25,
      incrementKg: INCREMENT_CHARGE_KG,
    },
    {
      nom: 'Développé épaules machine',
      series: 3,
      reps: 10,
      chargeDepartKg: 15,
      incrementKg: INCREMENT_CHARGE_KG,
    },
    {
      nom: 'Extension mollets',
      series: 3,
      reps: 15,
      chargeDepartKg: 40,
      incrementKg: INCREMENT_CHARGE_KG,
    },
    { nom: 'Gainage latéral', series: 3, reps: 25, consigne: 'secondes par côté' },
  ],
};

/** Course — endurance fondamentale. */
const courseEF: ModeleSeance = {
  id: 'course-ef',
  titre: 'Course — Endurance fondamentale',
  type: 'course',
  dureeMin: 35,
  noteSecurite: 'Allure conversationnelle. Hydratation. S’arrêter si gêne digestive.',
  exercices: [
    { nom: 'EF allure facile', series: 1, reps: 30, consigne: 'minutes en aisance respiratoire' },
  ],
};

/** Course — fractionné 30/30. */
const course3030: ModeleSeance = {
  id: 'course-30-30',
  titre: 'Course — Fractionné 30/30',
  type: 'course',
  dureeMin: 40,
  noteSecurite: 'Échauffement 10 min. Récupération active. Stop si douleur ≥ 5.',
  exercices: [
    { nom: 'Échauffement EF', series: 1, reps: 10, consigne: 'minutes' },
    { nom: '30 s vite / 30 s lent', series: 10, reps: 1, consigne: 'répétitions (bloc)' },
    { nom: 'Retour au calme', series: 1, reps: 10, consigne: 'minutes' },
  ],
};

/** Course — sortie longue. */
const courseLongue: ModeleSeance = {
  id: 'course-longue',
  titre: 'Course — Sortie longue',
  type: 'course',
  dureeMin: 60,
  noteSecurite: 'Allure facile, ravitaillement eau. Objectif durée, pas vitesse.',
  exercices: [{ nom: 'Sortie longue EF', series: 1, reps: 55, consigne: 'minutes progressives' }],
};

/** Course — VMA courte (préparation 3000 m). */
const courseVMA: ModeleSeance = {
  id: 'course-vma',
  titre: 'Course — VMA 3000 m',
  type: 'course',
  dureeMin: 45,
  noteSecurite: 'Échauffement complet obligatoire. Hydratation. Arrêt si signal santé.',
  exercices: [
    { nom: 'Échauffement + gammes', series: 1, reps: 15, consigne: 'minutes' },
    { nom: '400 m allure 3000', series: 6, reps: 1, consigne: 'récup 1 min trot' },
    { nom: 'Retour au calme', series: 1, reps: 10, consigne: 'minutes' },
  ],
};

/** Test chronométré 3000 m. */
const testChrono: ModeleSeance = {
  id: 'test-3000',
  titre: 'Test chronométré 3000 m',
  type: 'course',
  dureeMin: 45,
  noteSecurite: 'Test à valider selon la forme du jour. Annuler si douleur ≥ 5 ou énergie ≤ 2.',
  exercices: [
    { nom: 'Échauffement complet', series: 1, reps: 20, consigne: 'minutes' },
    { nom: '3000 m chronométré', series: 1, reps: 1, consigne: 'effort maximal maîtrisé' },
  ],
};

/** Freeletics — circuit adapté MICI (sans hyperpression abdominale). */
const freeletics: ModeleSeance = {
  id: 'freeletics-mici',
  titre: 'Freeletics — Circuit adapté MICI',
  type: 'freeletics',
  dureeMin: 40,
  noteSecurite:
    'Sans crunchs ni manœuvres en apnée. Privilégier squats, fentes, pompes contrôlées, gainage en respiration libre.',
  exercices: [
    { nom: 'Squats au poids du corps', series: 4, reps: 15 },
    { nom: 'Fentes alternées', series: 4, reps: 12, consigne: 'par jambe' },
    { nom: 'Pompes (genoux si besoin)', series: 4, reps: 10 },
    { nom: 'Hip thrust au sol', series: 4, reps: 15 },
    { nom: 'Planche dynamique', series: 3, reps: 30, consigne: 'secondes, respiration libre' },
  ],
};

/** Séance santé — version allégée déclenchée par le moteur. */
const santeAllegee: ModeleSeance = {
  id: 'sante-allegee',
  titre: 'Santé — Mobilité & marche',
  type: 'sante',
  dureeMin: 25,
  noteSecurite: 'Version douce : on bouge sans solliciter. La constance, jamais le dépassement.',
  exercices: [
    { nom: 'Marche facile', series: 1, reps: 20, consigne: 'minutes' },
    { nom: 'Mobilité hanches/épaules', series: 1, reps: 8, consigne: 'minutes' },
    { nom: 'Respiration diaphragmatique', series: 1, reps: 5, consigne: 'minutes' },
  ],
};

export const MODELES: Record<string, ModeleSeance> = {
  [salleA.id]: salleA,
  [salleB.id]: salleB,
  [courseEF.id]: courseEF,
  [course3030.id]: course3030,
  [courseLongue.id]: courseLongue,
  [courseVMA.id]: courseVMA,
  [testChrono.id]: testChrono,
  [freeletics.id]: freeletics,
  [santeAllegee.id]: santeAllegee,
};

/** Modèle utilisé pour la version allégée d'une séance (toutes catégories). */
export const MODELE_ALLEGE_ID = santeAllegee.id;

export function obtenirModele(id: string): ModeleSeance | undefined {
  return MODELES[id];
}
