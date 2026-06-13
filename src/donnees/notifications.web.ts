import type { DateISO } from '@/domaine';
import type { EntreeJournal } from '@/domaine/types';
import type { MesureCorporelle } from '@/donnees/depots';

// Shim web (docs/07 §8.4) : pas de notifications locales sur web (Web Push nécessite un
// service worker + serveur d'envoi, reporté). No-op silencieux — Metro résout ce fichier
// à la place de notifications.ts sur la plateforme web.

export function configurerHandlerNotifications(): void {}

export async function synchroniserNotifications(
  _aujourdhui: DateISO,
  _journal: EntreeJournal[],
  _mesures: MesureCorporelle[],
): Promise<void> {}
