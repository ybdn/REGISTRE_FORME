import { ErreurSauvegarde } from '@/domaine/sauvegarde';
import type { Depot } from './depot';

// Shim web (docs/07 §8.2) : la sauvegarde fichier chiffrée est un filet hors-ligne mobile
// (instantané SQLite). Sur web, les données sont déjà protégées par la sync cloud chiffrée ;
// l'export/import fichier n'est pas exposé. Messages explicites si l'UI les déclenche.

export async function exporterSauvegarde(
  _depot: Depot,
  _passphrase: string,
  _aujourdhui: string,
): Promise<string> {
  throw new ErreurSauvegarde(
    'Sauvegarde fichier indisponible sur web : vos données sont synchronisées et chiffrées dans le cloud.',
  );
}

export async function importerSauvegarde(
  _depot: Depot,
  _contenuChiffre: string,
  _passphrase: string,
): Promise<void> {
  throw new ErreurSauvegarde('Restauration fichier indisponible sur web.');
}

export { ErreurSauvegarde };
