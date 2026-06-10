import * as SQLite from 'expo-sqlite';
import { MIGRATIONS, VERSION_CIBLE } from './schema';

// Ouverture de la base et application des migrations versionnées via PRAGMA user_version.
// Aucune donnée ne quitte l'appareil.

let instance: SQLite.SQLiteDatabase | null = null;
// On mémoïse la PROMESSE d'ouverture : en dev, React monte les effets deux fois (StrictMode)
// et `initialiser` peut partir en double. Sans cela, deux ouvertures concurrentes entreraient
// en contention de verrou sur la transaction de migration et bloqueraient l'app.
let ouverture: Promise<SQLite.SQLiteDatabase> | null = null;

export function ouvrirBase(): Promise<SQLite.SQLiteDatabase> {
  if (instance) return Promise.resolve(instance);
  if (ouverture) return ouverture;
  ouverture = (async () => {
    const db = await SQLite.openDatabaseAsync('registre_forme.db');
    await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
    await migrer(db);
    instance = db;
    return db;
  })();
  return ouverture;
}

/** Applique séquentiellement les migrations dont la version dépasse user_version. */
export async function migrer(db: SQLite.SQLiteDatabase): Promise<void> {
  const ligne = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const versionActuelle = ligne?.user_version ?? 0;
  if (versionActuelle >= VERSION_CIBLE) return;

  const aAppliquer = MIGRATIONS.filter((m) => m.version > versionActuelle).sort(
    (a, b) => a.version - b.version,
  );

  for (const migration of aAppliquer) {
    // Transaction simple (pas EXCLUSIVE) : suffisant ici et moins sujet aux verrous.
    await db.withTransactionAsync(async () => {
      await db.execAsync(migration.sql);
      // user_version n'accepte pas de paramètre lié → interpolation d'un entier validé.
      await db.execAsync(`PRAGMA user_version = ${Number(migration.version)}`);
    });
  }
}

/** Réinitialise les références mémoïsées (tests / changement d'appareil). */
export function reinitialiserInstance(): void {
  instance = null;
  ouverture = null;
}
