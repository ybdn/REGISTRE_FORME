import { type BilanHydrique, type DateISO, ajouterJours, jourDeLaSemaine } from '@/domaine';
import { formaterVolume } from '@/domaine/hydratation';
import type { EntreeJournal } from '@/domaine/types';
import type { MesureCorporelle } from '@/donnees/depots';
import * as Notifications from 'expo-notifications';

// Rappels locaux (Incrément 5) : journal Crohn quotidien + pesée hebdomadaire.
// Best-effort : aucune erreur (permission refusée, plateforme non supportée…) ne
// doit jamais bloquer le reste de l'application.

/** Affiche les rappels même app au premier plan. À appeler une fois au démarrage. */
export function configurerHandlerNotifications(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

const ID_RAPPEL_JOURNAL = 'rappel-journal';
const ID_RAPPEL_PESEE = 'rappel-pesee';
const ID_RAPPEL_BILAN = 'rappel-bilan';
const ID_RAPPEL_HYDRATATION = 'rappel-hydratation';

const HEURE_RAPPEL_JOURNAL = { heure: 20, minute: 0 };
const HEURE_RAPPEL_PESEE = { heure: 8, minute: 0 };
const HEURE_RAPPEL_BILAN = { heure: 18, minute: 0 };

// Plage d'éveil pour les rappels d'hydratation (pas de notification la nuit).
const HYDRATATION_HEURE_DEBUT = 9;
const HYDRATATION_HEURE_FIN = 21;
/** Intervalle entre deux rappels d'hydratation tant qu'on est en retard sur l'objectif. */
const HYDRATATION_INTERVALLE_MIN = 150; // 2 h 30

let canalAndroidPret = false;

async function assurerCanalAndroid(): Promise<void> {
  if (canalAndroidPret) return;
  await Notifications.setNotificationChannelAsync('rappels', {
    name: 'Rappels',
    importance: Notifications.AndroidImportance.DEFAULT,
  });
  canalAndroidPret = true;
}

/** Construit une `Date` locale pour une date civile + heure donnée (hors couche domaine pure). */
function construireDate(date: DateISO, heure: number, minute: number): Date {
  const [a, m, j] = date.split('-').map(Number) as [number, number, number];
  return new Date(a, m - 1, j, heure, minute, 0, 0);
}

/**
 * Prochain créneau de rappel d'hydratation : `maintenant` + intervalle, ramené dans la
 * plage d'éveil. Avant le début de plage → premier créneau du jour ; après la fin → `null`
 * (plus de rappel ce soir, on ne notifie pas la nuit).
 */
function prochainCreneauHydratation(maintenant: Date): Date | null {
  const cible = new Date(maintenant.getTime() + HYDRATATION_INTERVALLE_MIN * 60_000);
  if (cible.getHours() < HYDRATATION_HEURE_DEBUT) {
    cible.setHours(HYDRATATION_HEURE_DEBUT, 0, 0, 0);
  }
  if (cible.getHours() >= HYDRATATION_HEURE_FIN) return null;
  return cible;
}

/**
 * Recalcule et reprogramme les rappels locaux à partir de l'état courant.
 * Échoue silencieusement (notifications = confort, jamais bloquant).
 */
export async function synchroniserNotifications(
  aujourdhui: DateISO,
  journal: EntreeJournal[],
  mesures: MesureCorporelle[],
  bilanHydrique: BilanHydrique | null = null,
): Promise<void> {
  try {
    let { granted } = await Notifications.getPermissionsAsync();
    if (!granted) {
      ({ granted } = await Notifications.requestPermissionsAsync());
    }
    if (!granted) return;

    await assurerCanalAndroid();
    const maintenant = new Date();

    // Rappel journal : aujourd'hui sauf si déjà saisi ou heure passée → demain.
    const dejaSaisiAuj = journal.some((e) => e.date === aujourdhui);
    let cibleJournal = construireDate(
      aujourdhui,
      HEURE_RAPPEL_JOURNAL.heure,
      HEURE_RAPPEL_JOURNAL.minute,
    );
    if (dejaSaisiAuj || cibleJournal <= maintenant) {
      cibleJournal = construireDate(
        ajouterJours(aujourdhui, 1),
        HEURE_RAPPEL_JOURNAL.heure,
        HEURE_RAPPEL_JOURNAL.minute,
      );
    }
    await Notifications.cancelScheduledNotificationAsync(ID_RAPPEL_JOURNAL);
    await Notifications.scheduleNotificationAsync({
      identifier: ID_RAPPEL_JOURNAL,
      content: {
        title: 'Journal Crohn',
        body: 'Prends 20 secondes pour noter douleur, énergie et digestion du jour.',
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: cibleJournal },
    });

    // Rappel pesée hebdo : lundi de la semaine courante, sauf si déjà pesé ou
    // heure passée → lundi suivant.
    const lundi = ajouterJours(aujourdhui, -jourDeLaSemaine(aujourdhui));
    const dimanche = ajouterJours(lundi, 6);
    const dejaPeseCetteSemaine = mesures.some(
      (m) => m.poidsKg != null && m.date >= lundi && m.date <= dimanche,
    );
    let ciblePesee = construireDate(lundi, HEURE_RAPPEL_PESEE.heure, HEURE_RAPPEL_PESEE.minute);
    if (dejaPeseCetteSemaine || ciblePesee <= maintenant) {
      ciblePesee = construireDate(
        ajouterJours(lundi, 7),
        HEURE_RAPPEL_PESEE.heure,
        HEURE_RAPPEL_PESEE.minute,
      );
    }
    await Notifications.cancelScheduledNotificationAsync(ID_RAPPEL_PESEE);
    await Notifications.scheduleNotificationAsync({
      identifier: ID_RAPPEL_PESEE,
      content: {
        title: 'Pesée hebdomadaire',
        body: 'Un petit moment pour ta pesée et tes mensurations de la semaine.',
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: ciblePesee },
    });

    // Bilan hebdo : le rendez-vous du dimanche soir (18 h). Dimanche passé → suivant.
    let cibleBilan = construireDate(dimanche, HEURE_RAPPEL_BILAN.heure, HEURE_RAPPEL_BILAN.minute);
    if (cibleBilan <= maintenant) {
      cibleBilan = construireDate(
        ajouterJours(dimanche, 7),
        HEURE_RAPPEL_BILAN.heure,
        HEURE_RAPPEL_BILAN.minute,
      );
    }
    await Notifications.cancelScheduledNotificationAsync(ID_RAPPEL_BILAN);
    await Notifications.scheduleNotificationAsync({
      identifier: ID_RAPPEL_BILAN,
      content: {
        title: 'Bilan de la semaine',
        body: 'Charge, santé, progression : ton récap est prêt. La semaine prochaine en un coup d’œil.',
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: cibleBilan },
    });

    // Rappel d'hydratation INTELLIGENT : on ne harcèle pas. Un seul prochain rappel,
    // programmé seulement si on est encore en retard sur l'objectif ADAPTATIF du jour
    // (relevé par le sport et les selles), et uniquement dans la plage d'éveil. Atteint
    // → aucun rappel (supprimé). Le corps du message dit le reste exact à boire.
    await Notifications.cancelScheduledNotificationAsync(ID_RAPPEL_HYDRATATION);
    if (bilanHydrique && bilanHydrique.statut !== 'ok' && bilanHydrique.resteMl > 0) {
      const cibleHydratation = prochainCreneauHydratation(maintenant);
      if (cibleHydratation) {
        await Notifications.scheduleNotificationAsync({
          identifier: ID_RAPPEL_HYDRATATION,
          content: {
            title: 'Pense à boire',
            body:
              bilanHydrique.statut === 'deshydratation'
                ? `Hydratation basse aujourd’hui : il reste ${formaterVolume(bilanHydrique.resteMl)} à boire.`
                : `Encore ${formaterVolume(bilanHydrique.resteMl)} d’eau pour atteindre ton objectif du jour.`,
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: cibleHydratation,
          },
        });
      }
    }
  } catch {
    // Notifications optionnelles : on n'interrompt jamais le flux applicatif.
  }
}
