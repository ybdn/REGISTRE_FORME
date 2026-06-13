import { ouvrirBase } from './db';
import { type SyncLocalSqlite, creerSyncLocalSqlite } from './sync/syncLocalSqlite';

// Fabrique du côté local de la sync (mobile). Adossée à la même base SQLite que le dépôt de
// lecture/écriture (singleton `ouvrirBase`). Le portage web fournit `fabriqueSync.web.ts` qui
// renvoie `null` : le web est online-first (depotSupabase), sans sync locale (offline = Phase 4).

export async function creerSyncLocal(): Promise<SyncLocalSqlite | null> {
  const db = await ouvrirBase();
  return creerSyncLocalSqlite(db);
}
