import type { SyncLocalSqlite } from './sync/syncLocalSqlite';

// Web : online-first (depotSupabase lit/écrit Supabase directement). Pas de sync locale
// offline-first ici (Phase 4). Résolu par Metro à la place de fabriqueSync.ts sur le web.

export async function creerSyncLocal(): Promise<SyncLocalSqlite | null> {
  return null;
}
