import {
  ErreurSauvegarde,
  analyserSauvegarde,
  construireSauvegarde,
  serialiserSauvegarde,
} from '@/domaine/sauvegarde';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { chiffrer, dechiffrer } from './chiffrement';
import type { Depot } from './depot';

// Export/import chiffré de la base locale (Incrément 6).
// Stratégie : instantané complet (via Depot) → JSON → chiffré AES-256 (passphrase) → fichier partageable.
// L'import refait le chemin inverse dans une transaction (tout ou rien). Local-first : aucun réseau.
// Le dump/restore SQL est porté par l'implémentation `Depot` (depotSqlite) ; ce module ne fait
// que sérialiser + chiffrer + partager.

/** Sérialise l'état complet du dépôt en JSON clair (étape interne de l'export). */
export async function instantanerBase(depot: Depot, exporteLe: string): Promise<string> {
  const tables = await depot.instantanerToutesLesTables();
  return serialiserSauvegarde(construireSauvegarde(tables, exporteLe));
}

/**
 * Exporte la base chiffrée dans un fichier et ouvre la feuille de partage du système.
 * Renvoie le chemin du fichier produit (dans le cache, supprimable par l'OS).
 */
export async function exporterSauvegarde(
  depot: Depot,
  passphrase: string,
  aujourdhui: string,
): Promise<string> {
  const clair = await instantanerBase(depot, aujourdhui);
  const chiffre = chiffrer(clair, passphrase);

  const nom = `registre-forme-${aujourdhui}.rfb`;
  const fichier = new File(Paths.cache, nom);
  fichier.create({ overwrite: true });
  fichier.write(chiffre);

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(fichier.uri, {
      mimeType: 'application/json',
      dialogTitle: 'Exporter la sauvegarde chiffrée',
      UTI: 'public.json',
    });
  }
  return fichier.uri;
}

/**
 * Importe une sauvegarde chiffrée (contenu de fichier collé ou lu) : déchiffre, valide, restaure.
 * Transaction tout-ou-rien. Lève `ErreurSauvegarde` (message utilisateur) en cas d'échec.
 */
export async function importerSauvegarde(
  depot: Depot,
  contenuChiffre: string,
  passphrase: string,
): Promise<void> {
  const clair = dechiffrer(contenuChiffre, passphrase); // peut lever ErreurSauvegarde
  const sauvegarde = analyserSauvegarde(clair); // valide format + version
  await depot.remplacerToutesLesTables(sauvegarde.tables);
}

export { ErreurSauvegarde };
