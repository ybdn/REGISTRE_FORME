import { ouvrirBase } from './db';
import type { Depot } from './depot';
import { creerDepotSqlite } from './depotSqlite';

// Sélection de l'implémentation de `Depot` par plateforme (docs/07 §4.3).
// Mobile : SQLite local (rapide, hors-ligne). Le portage web fournira un
// `fabriqueDepot.web.ts` (résolu par Metro) renvoyant le dépôt Supabase (Phase 1).

export async function creerDepotParDefaut(): Promise<Depot> {
  const db = await ouvrirBase();
  return creerDepotSqlite(db);
}
