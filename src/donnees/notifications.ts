import { type DateISO, ajouterJours, jourDeLaSemaine } from '@/domaine';
import type { EntreeJournal } from '@/domaine/types';
import type { MesureCorporelle } from '@/donnees/depots';
import * as Notifications from 'expo-notifications';

// Rappels locaux (Incrément 5) : journal Crohn quotidien + pesée hebdomadaire.
// Best-effort : aucune erreur (permission refusée, plateforme non supportée…) ne
// doit jamais bloquer le reste de l'application.

const ID_RAPPEL_JOURNAL = 'rappel-journal';
const ID_RAPPEL_PESEE = 'rappel-pesee';

const HEURE_RAPPEL_JOURNAL = { heure: 20, minute: 0 };
const HEURE_RAPPEL_PESEE = { heure: 8, minute: 0 };

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
 * Recalcule et reprogramme les rappels locaux à partir de l'état courant.
 * Échoue silencieusement (notifications = confort, jamais bloquant).
 */
export async function synchroniserNotifications(
  aujourdhui: DateISO,
  journal: EntreeJournal[],
  mesures: MesureCorporelle[],
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
  } catch {
    // Notifications optionnelles : on n'interrompt jamais le flux applicatif.
  }
}
