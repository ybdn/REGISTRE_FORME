import type * as SQLite from 'expo-sqlite';
import { maintenant } from '../depots';
import { ENTITES_SYNC, ENTITE_PAR_NOM } from './registreSync';
import {
  BORNE_INITIALE,
  type DepotLocalSync,
  type EnregistrementSync,
  type EtatSync,
} from './types';

// Côté local de la sync, adossé à SQLite (mobile, docs/07 §4.4). Implémente `DepotLocalSync`
// (push/apply) et `EtatSync` (borne `derniereSync`). Les noms de table/colonne interpolés en SQL
// proviennent du registre (constantes du code, jamais d'entrée utilisateur) : aucune injection.

export type SyncLocalSqlite = DepotLocalSync & EtatSync;

export function creerSyncLocalSqlite(db: SQLite.SQLiteDatabase): SyncLocalSqlite {
  return {
    async lireSales() {
      const sales: EnregistrementSync[] = [];
      for (const e of ENTITES_SYNC) {
        const rows = await db.getAllAsync<Record<string, unknown>>(
          `SELECT * FROM ${e.table} WHERE dirty = 1`,
        );
        for (const row of rows) {
          sales.push({
            entite: e.entite,
            cle: String(row[e.colonneCle]),
            contenu: e.versContenu(row),
            supprime: false,
            majLe: (row.maj_le as string | null) ?? maintenant(),
          });
        }
      }
      // Tombstones (suppressions dures, ex. aliment_statut) à propager.
      const morts = await db.getAllAsync<{ entite: string; cle: string; maj_le: string | null }>(
        'SELECT entite, cle, maj_le FROM sync_suppressions WHERE dirty = 1',
      );
      for (const m of morts) {
        sales.push({
          entite: m.entite,
          cle: m.cle,
          contenu: null,
          supprime: true,
          majLe: m.maj_le ?? maintenant(),
        });
      }
      return sales;
    },

    async marquerSynchronises(enrs) {
      for (const enr of enrs) {
        if (enr.supprime) {
          await db.runAsync(
            'UPDATE sync_suppressions SET dirty = 0, maj_le = ? WHERE entite = ? AND cle = ?',
            [enr.majLe, enr.entite, enr.cle],
          );
          continue;
        }
        const e = ENTITE_PAR_NOM.get(enr.entite);
        if (!e) continue;
        await db.runAsync(`UPDATE ${e.table} SET dirty = 0, maj_le = ? WHERE ${e.colonneCle} = ?`, [
          enr.majLe,
          enr.cle,
        ]);
      }
    },

    async majLeLocal(entite, cle) {
      const e = ENTITE_PAR_NOM.get(entite);
      if (e) {
        const r = await db.getFirstAsync<{ maj_le: string | null }>(
          `SELECT maj_le FROM ${e.table} WHERE ${e.colonneCle} = ?`,
          [cle],
        );
        if (r) return r.maj_le;
      }
      // Un tombstone connu fait foi (anti-résurrection par un pull plus ancien).
      const t = await db.getFirstAsync<{ maj_le: string | null }>(
        'SELECT maj_le FROM sync_suppressions WHERE entite = ? AND cle = ?',
        [entite, cle],
      );
      return t ? t.maj_le : null;
    },

    async appliquerDistant(enr) {
      const e = ENTITE_PAR_NOM.get(enr.entite);
      // Entité non synchronisée côté mobile (adaptation, seance_planifiee) : on l'ignore.
      if (!e) return;

      if (enr.supprime) {
        await db.runAsync(`DELETE FROM ${e.table} WHERE ${e.colonneCle} = ?`, [enr.cle]);
        // Mémorise le tombstone (dirty=0) pour bloquer une future résurrection par un pull ancien.
        await db.runAsync(
          'INSERT OR REPLACE INTO sync_suppressions (entite, cle, maj_le, dirty) VALUES (?, ?, ?, 0)',
          [enr.entite, enr.cle, enr.majLe],
        );
        return;
      }

      // Écrit le contenu (pose dirty=1), puis le neutralise et aligne l'horloge sur le serveur.
      await e.ecrire(db, enr.contenu);
      await db.runAsync(`UPDATE ${e.table} SET dirty = 0, maj_le = ? WHERE ${e.colonneCle} = ?`, [
        enr.majLe,
        enr.cle,
      ]);
      // Un contenu réapparu annule un éventuel tombstone local.
      await db.runAsync('DELETE FROM sync_suppressions WHERE entite = ? AND cle = ?', [
        enr.entite,
        enr.cle,
      ]);
    },

    async lireDerniereSync() {
      const r = await db.getFirstAsync<{ valeur: string }>(
        "SELECT valeur FROM sync_etat WHERE cle = 'derniereSync'",
      );
      return r?.valeur ?? BORNE_INITIALE;
    },
    async ecrireDerniereSync(borne) {
      await db.runAsync(
        "INSERT OR REPLACE INTO sync_etat (cle, valeur) VALUES ('derniereSync', ?)",
        [borne],
      );
    },
  };
}
