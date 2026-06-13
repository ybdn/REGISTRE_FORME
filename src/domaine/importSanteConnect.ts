import type { DateISO, SeanceRealisee, TypeSeance } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// IMPORT SANTÉ CONNECT — mapping pur d'une session d'exercice vers une séance
//
// Les séances faites dans Strava, Freeletics, Google Fit… sont lues depuis
// Health Connect (« Santé Connect »), la base santé LOCALE d'Android : aucune
// donnée ne quitte le téléphone, le local-first reste intact. Ce module est
// pur : il transforme des sessions déjà lues (par src/donnees/santeConnect.ts)
// en SeanceRealisee, avec des règles déterministes et explicables (le RPE
// estimé est tracé dans la note, lisible par l'utilisateur).
// ─────────────────────────────────────────────────────────────────────────────

/** Session d'exercice minimale lue dans Health Connect (ExerciseSessionRecord). */
export interface SessionExterneBrute {
  id: string; // metadata.id Health Connect — clé de dédoublonnage
  application: string; // package de l'app d'origine (dataOrigin), ex. 'com.strava'
  typeExercice: number; // constante ExerciseType de Health Connect
  titre?: string;
  debut: string; // instant ISO 8601 (UTC)
  fin: string; // instant ISO 8601 (UTC)
  distanceM?: number; // agrégat distance sur la session, si disponible
  fcMoyenne?: number; // agrégat FC moyenne sur la session, si disponible
}

/** Fenêtre d'import manuel : sessions des N derniers jours. */
export const FENETRE_IMPORT_SANTE_CONNECT_JOURS = 30;

/**
 * Correspondance ExerciseType Health Connect → type de séance. Tout type absent
 * tombe sur 'sante' (défaut le plus prudent : la charge rpe × durée compte
 * quand même pour l'ACWR, sans gonfler course/salle).
 */
export const CORRESPONDANCE_TYPES_EXERCICE: Readonly<Record<number, TypeSeance>> = {
  56: 'course', // RUNNING
  57: 'course', // RUNNING_TREADMILL
  70: 'salle', // STRENGTH_TRAINING
  36: 'freeletics', // HIGH_INTENSITY_INTERVAL_TRAINING
  10: 'freeletics', // BOOT_CAMP
  13: 'freeletics', // CALISTHENICS
};

/** Noms lisibles des applications sources connues (package Android → libellé). */
export const NOMS_APPLICATIONS: Readonly<Record<string, string>> = {
  'com.strava': 'Strava',
  'com.freeletics.lite': 'Freeletics',
  'com.google.android.apps.fitness': 'Google Fit',
  'com.sec.android.app.shealth': 'Samsung Health',
  'com.garmin.android.apps.connectmobile': 'Garmin Connect',
};

/** RPE par défaut quand la fréquence cardiaque n'est pas connue. */
const RPE_DEFAUT_PAR_TYPE: Readonly<Record<TypeSeance, number>> = {
  course: 6,
  salle: 6,
  freeletics: 7,
  sante: 3,
};

/** Paliers FC moyenne (% de FCmax) → RPE, du plus intense au plus doux. */
const PALIERS_FC: ReadonlyArray<{ seuilPct: number; rpe: number }> = [
  { seuilPct: 90, rpe: 9 },
  { seuilPct: 80, rpe: 8 },
  { seuilPct: 70, rpe: 6 },
  { seuilPct: 60, rpe: 4 },
  { seuilPct: 0, rpe: 2 },
];

/** Libellé lisible de l'app d'origine (défaut : le nom du package). */
export function nomApplication(packageAndroid: string): string {
  return NOMS_APPLICATIONS[packageAndroid] ?? packageAndroid;
}

/** Type de séance déduit du type d'exercice Health Connect (défaut : 'sante'). */
export function typeSeanceDepuisExercice(typeExercice: number): TypeSeance {
  return CORRESPONDANCE_TYPES_EXERCICE[typeExercice] ?? 'sante';
}

/** Date locale (AAAA-MM-JJ) d'un instant ISO, selon le fuseau de l'appareil. */
export function dateLocaleDepuisInstant(instant: string): DateISO {
  const d = new Date(instant);
  const mois = String(d.getMonth() + 1).padStart(2, '0');
  const jour = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mois}-${jour}`;
}

/**
 * RPE déterministe + explication affichable. Priorité :
 *   1. FC moyenne en % de FCmax (si les deux sont connues) ;
 *   2. défaut par type de séance.
 */
export function estimerRpe(
  s: SessionExterneBrute,
  type: TypeSeance,
  fcMax?: number,
): { rpe: number; explication: string } {
  if (s.fcMoyenne !== undefined && fcMax !== undefined && fcMax > 0) {
    const pct = Math.round((s.fcMoyenne / fcMax) * 100);
    const palier = PALIERS_FC.find((p) => pct >= p.seuilPct);
    return {
      rpe: palier?.rpe ?? 2,
      explication: `FC moy ${Math.round(s.fcMoyenne)} = ${pct} % de FCmax`,
    };
  }
  return { rpe: RPE_DEFAUT_PAR_TYPE[type], explication: `défaut ${type}` };
}

/**
 * Session brute → séance réalisée (sans id, généré côté store).
 * Variante 'normale' : la séance est déjà faite, l'adaptation ne s'applique
 * pas rétroactivement.
 */
export function mapperSessionExterne(
  s: SessionExterneBrute,
  options?: { fcMax?: number },
): Omit<SeanceRealisee, 'id'> {
  const type = typeSeanceDepuisExercice(s.typeExercice);
  const { rpe, explication } = estimerRpe(s, type, options?.fcMax);
  const dureeMin = Math.max(1, Math.round((Date.parse(s.fin) - Date.parse(s.debut)) / 60000));
  const titre = s.titre ? ` — « ${s.titre} »` : '';
  const seance: Omit<SeanceRealisee, 'id'> = {
    date: dateLocaleDepuisInstant(s.debut),
    type,
    variante: 'normale',
    rpe,
    dureeMin,
    note: `Importé de ${nomApplication(s.application)} via Santé Connect${titre}. RPE : ${explication}.`,
    source: 'sante_connect',
    idExterne: s.id,
  };
  if (s.distanceM !== undefined && s.distanceM > 0) {
    seance.distanceKm = Math.round((s.distanceM / 1000) * 100) / 100;
    seance.tempsSec = dureeMin * 60;
  }
  return seance;
}

/** Écarte les sessions dont l'id a déjà été importé (ordre préservé). */
export function filtrerNouvellesSessions(
  sessions: SessionExterneBrute[],
  idsDejaImportes: readonly string[],
): SessionExterneBrute[] {
  const dejaImportes = new Set(idsDejaImportes);
  return sessions.filter((s) => !dejaImportes.has(s.id));
}
