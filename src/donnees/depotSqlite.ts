import type { LigneSauvegarde } from '@/domaine/sauvegarde';
import type {
  Adaptation,
  ConsommationJour,
  EntreeJournal,
  SeanceRealisee,
  SourceSeance,
  StatutAlimentManuel,
} from '@/domaine/types';
import type * as SQLite from 'expo-sqlite';
import type { Depot } from './depot';
import {
  type MesureCorporelle,
  type SeancePlanifieeStockee,
  annulerAdaptation,
  definirStatutAliment,
  enregistrerAdaptation,
  enregistrerConsommation,
  enregistrerJournal,
  enregistrerMesure,
  enregistrerSeance,
  lireAdaptationsAppliquees,
  lireConsommations,
  lireIdsExternes,
  lireJournal,
  lireMesures,
  lireSeances,
  lireSeancesPlanifieesSemaine,
  lireStatutsAliments,
  supprimerStatutAliment,
} from './depots';
import { type Profil, enregistrerProfil, lireProfil } from './profil';
import { programmeDejaSeede, seederProgramme } from './seed';

// Implémentation SQLite (mobile) de l'interface `Depot` (docs/07 §4.2).
// Refactor mécanique : `db` est capturé en clôture une fois pour toutes, au lieu d'être
// passé à chaque appel comme avant. La logique SQL reste dans depots.ts / profil.ts / seed.ts.

/** Tables sauvegardées, dans l'ordre de réinsertion (aucune contrainte FK inter-tables). */
const TABLES_SAUVEGARDE = [
  'profil',
  'journal_crohn',
  'seance_planifiee',
  'seance_realisee',
  'mesure_corporelle',
  'photo_suivi',
  'adaptation',
  'consommation_jour',
  'aliment_statut',
] as const;

export function creerDepotSqlite(db: SQLite.SQLiteDatabase): Depot {
  return {
    programmeDejaSeede: () => programmeDejaSeede(db),
    seederProgramme: () => seederProgramme(db),

    lireProfil: () => lireProfil(db),
    enregistrerProfil: (p: Profil) => enregistrerProfil(db, p),

    lireJournal: (depuis?: string) => lireJournal(db, depuis),
    enregistrerJournal: (e: EntreeJournal) => enregistrerJournal(db, e),

    lireSeances: (depuis?: string) => lireSeances(db, depuis),
    enregistrerSeance: (s: SeanceRealisee) => enregistrerSeance(db, s),
    lireIdsExternes: (source: SourceSeance) => lireIdsExternes(db, source),

    lireMesures: (depuis?: string) => lireMesures(db, depuis),
    enregistrerMesure: (m: MesureCorporelle) => enregistrerMesure(db, m),

    lireConsommations: (depuis?: string) => lireConsommations(db, depuis),
    enregistrerConsommation: (c: ConsommationJour) => enregistrerConsommation(db, c),
    lireStatutsAliments: () => lireStatutsAliments(db),
    definirStatutAliment: (s: StatutAlimentManuel) => definirStatutAliment(db, s),
    supprimerStatutAliment: (aliment: string) => supprimerStatutAliment(db, aliment),

    lireSeancesPlanifieesSemaine: (semaine: number) => lireSeancesPlanifieesSemaine(db, semaine),

    enregistrerAdaptation: (a: Adaptation, id: string, dateCreation: string) =>
      enregistrerAdaptation(db, a, id, dateCreation),
    annulerAdaptation: (id: string) => annulerAdaptation(db, id),
    lireAdaptationsAppliquees: (depuis: string) => lireAdaptationsAppliquees(db, depuis),

    async instantanerToutesLesTables() {
      const tables: Record<string, LigneSauvegarde[]> = {};
      for (const table of TABLES_SAUVEGARDE) {
        tables[table] = await db.getAllAsync<LigneSauvegarde>(`SELECT * FROM ${table}`);
      }
      return tables;
    },

    async remplacerToutesLesTables(tables: Record<string, LigneSauvegarde[]>) {
      await db.withTransactionAsync(async () => {
        for (const table of TABLES_SAUVEGARDE) {
          // Purge systématique même si la table est absente du fichier (ancienne
          // sauvegarde) : sinon les données actuelles survivraient à la restauration.
          await db.runAsync(`DELETE FROM ${table}`);
          for (const ligne of tables[table] ?? []) {
            const colonnes = Object.keys(ligne);
            if (colonnes.length === 0) continue;
            const placeholders = colonnes.map(() => '?').join(', ');
            await db.runAsync(
              `INSERT OR REPLACE INTO ${table} (${colonnes.join(', ')}) VALUES (${placeholders})`,
              colonnes.map((c) => ligne[c] ?? null),
            );
          }
        }
      });
    },
  };
}
