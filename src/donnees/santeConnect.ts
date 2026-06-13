import type { DateISO, SessionExterneBrute } from '@/domaine';
import {
  SdkAvailabilityStatus,
  aggregateRecord,
  getSdkStatus,
  initialize,
  readRecords,
  requestPermission,
} from 'react-native-health-connect';

// ─────────────────────────────────────────────────────────────────────────────
// SANTÉ CONNECT — lecture des sessions d'exercice écrites par les autres apps
// (Strava, Freeletics, Google Fit, Samsung Health…).
//
// Health Connect est la base santé LOCALE d'Android : tout reste sur
// l'appareil, aucune requête réseau — le local-first est intact. L'accès est
// opt-in : Android affiche sa propre feuille de permissions au premier import,
// révocable à tout moment dans les réglages Santé Connect du téléphone.
// ─────────────────────────────────────────────────────────────────────────────

/** Erreur métier : message en français, affichable tel quel. */
export class ErreurSanteConnect extends Error {}

const PERMISSIONS_LECTURE = [
  { accessType: 'read', recordType: 'ExerciseSession' },
  { accessType: 'read', recordType: 'Distance' },
  { accessType: 'read', recordType: 'HeartRate' },
] as const;

/** Vrai si Santé Connect est disponible sur cet appareil (Android 8+ requis). */
export async function santeConnectDisponible(): Promise<boolean> {
  try {
    return (await getSdkStatus()) === SdkAvailabilityStatus.SDK_AVAILABLE;
  } catch {
    return false;
  }
}

/** Initialise le client et demande les permissions de lecture (feuille système). */
async function preparerClient(): Promise<void> {
  if (!(await santeConnectDisponible())) {
    throw new ErreurSanteConnect(
      'Santé Connect n’est pas disponible sur cet appareil. Installe l’app « Santé Connect » depuis le Play Store.',
    );
  }
  const initialise = await initialize();
  if (!initialise) {
    throw new ErreurSanteConnect('Impossible d’initialiser Santé Connect.');
  }
  const accordees = await requestPermission([...PERMISSIONS_LECTURE]);
  const lectureSessions = accordees.some(
    (p) => 'recordType' in p && p.recordType === 'ExerciseSession' && p.accessType === 'read',
  );
  if (!lectureSessions) {
    throw new ErreurSanteConnect(
      'Permission refusée. Autorise la lecture des sessions d’exercice dans Santé Connect.',
    );
  }
}

/** Agrégat optionnel sur la fenêtre d'une session (best effort, jamais bloquant). */
async function agregat<T>(lecture: () => Promise<T>): Promise<T | undefined> {
  try {
    return await lecture();
  } catch {
    return undefined;
  }
}

/**
 * Sessions d'exercice écrites par les autres apps entre deux dates locales
 * (bornes incluses), enrichies des agrégats distance et FC moyenne quand ils
 * existent. Les sessions sans application d'origine sont ignorées.
 */
export async function lireSessionsExternes(
  depuis: DateISO,
  jusqua: DateISO,
): Promise<SessionExterneBrute[]> {
  await preparerClient();

  const filtre = {
    operator: 'between',
    startTime: new Date(`${depuis}T00:00:00`).toISOString(),
    endTime: new Date(`${jusqua}T23:59:59`).toISOString(),
  } as const;
  const resultat = await readRecords('ExerciseSession', { timeRangeFilter: filtre });

  const sessions: SessionExterneBrute[] = [];
  for (const record of resultat.records) {
    const id = record.metadata?.id;
    const application = record.metadata?.dataOrigin;
    if (!id || !application) continue;

    const fenetreSession = {
      operator: 'between',
      startTime: record.startTime,
      endTime: record.endTime,
    } as const;
    const distance = await agregat(() =>
      aggregateRecord({ recordType: 'Distance', timeRangeFilter: fenetreSession }),
    );
    const fc = await agregat(() =>
      aggregateRecord({ recordType: 'HeartRate', timeRangeFilter: fenetreSession }),
    );

    sessions.push({
      id,
      application,
      typeExercice: record.exerciseType,
      titre: record.title,
      debut: record.startTime,
      fin: record.endTime,
      distanceM: distance?.DISTANCE?.inMeters || undefined,
      fcMoyenne: fc?.BPM_AVG || undefined,
    });
  }
  return sessions;
}
