import type { DateISO, SessionExterneBrute } from '@/domaine';

// Shim web (docs/07 §1.2) : Health Connect est Android-only, aucun équivalent web.
// Le web est un client de saisie/consultation, pas d'import automatique de séances.

export class ErreurSanteConnect extends Error {}

export async function santeConnectDisponible(): Promise<boolean> {
  return false;
}

export async function lireSessionsExternes(
  _depuis: DateISO,
  _jusqua: DateISO,
): Promise<SessionExterneBrute[]> {
  return [];
}
