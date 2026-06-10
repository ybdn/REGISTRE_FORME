import {
  ErreurSauvegarde,
  type LigneSauvegarde,
  analyserSauvegarde,
  construireSauvegarde,
  serialiserSauvegarde,
} from '@/domaine/sauvegarde';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type * as SQLite from 'expo-sqlite';
import { chiffrer, dechiffrer } from './chiffrement';

// Export/import chiffré de la base locale (Incrément 6).
// Stratégie : instantané SQLite complet → JSON → chiffré AES-256 (passphrase) → fichier partageable.
// L'import refait le chemin inverse dans une transaction (tout ou rien). Local-first : aucun réseau.

/** Tables sauvegardées, dans l'ordre de réinsertion (pas de contrainte FK entre elles). */
const TABLES_SAUVEGARDE = [
  'profil',
  'journal_crohn',
  'seance_planifiee',
  'seance_realisee',
  'mesure_corporelle',
  'photo_suivi',
  'adaptation',
] as const;

/** Lit l'intégralité d'une table sous forme de lignes brutes (clé→valeur SQLite). */
async function lireTable(db: SQLite.SQLiteDatabase, table: string): Promise<LigneSauvegarde[]> {
  return db.getAllAsync<LigneSauvegarde>(`SELECT * FROM ${table}`);
}

/** Réécrit une table : purge puis réinsertion ligne à ligne (colonnes dynamiques). */
async function restaurerTable(
  db: SQLite.SQLiteDatabase,
  table: string,
  lignes: LigneSauvegarde[],
): Promise<void> {
  await db.runAsync(`DELETE FROM ${table}`);
  for (const ligne of lignes) {
    const colonnes = Object.keys(ligne);
    if (colonnes.length === 0) continue;
    const placeholders = colonnes.map(() => '?').join(', ');
    await db.runAsync(
      `INSERT OR REPLACE INTO ${table} (${colonnes.join(', ')}) VALUES (${placeholders})`,
      colonnes.map((c) => ligne[c] ?? null),
    );
  }
}

/** Sérialise l'état complet de la base en JSON clair (étape interne de l'export). */
export async function instantanerBase(
  db: SQLite.SQLiteDatabase,
  exporteLe: string,
): Promise<string> {
  const tables: Record<string, LigneSauvegarde[]> = {};
  for (const table of TABLES_SAUVEGARDE) {
    tables[table] = await lireTable(db, table);
  }
  return serialiserSauvegarde(construireSauvegarde(tables, exporteLe));
}

/**
 * Exporte la base chiffrée dans un fichier et ouvre la feuille de partage du système.
 * Renvoie le chemin du fichier produit (dans le cache, supprimable par l'OS).
 */
export async function exporterSauvegarde(
  db: SQLite.SQLiteDatabase,
  passphrase: string,
  aujourdhui: string,
): Promise<string> {
  const clair = await instantanerBase(db, aujourdhui);
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
  db: SQLite.SQLiteDatabase,
  contenuChiffre: string,
  passphrase: string,
): Promise<void> {
  const clair = dechiffrer(contenuChiffre, passphrase); // peut lever ErreurSauvegarde
  const sauvegarde = analyserSauvegarde(clair); // valide format + version

  await db.withTransactionAsync(async () => {
    for (const table of TABLES_SAUVEGARDE) {
      const lignes = sauvegarde.tables[table];
      if (lignes) await restaurerTable(db, table, lignes);
    }
  });
}

export { ErreurSauvegarde };
