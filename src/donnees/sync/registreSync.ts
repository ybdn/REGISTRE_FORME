import type {
  ConsommationJour,
  EntreeJournal,
  SeanceRealisee,
  StatutAlimentManuel,
} from '@/domaine/types';
import type * as SQLite from 'expo-sqlite';
import {
  type ConsommationRow,
  type JournalRow,
  type MesureCorporelle,
  type MesureRow,
  type SeanceRow,
  type StatutRow,
  definirStatutAliment,
  enregistrerConsommation,
  enregistrerJournal,
  enregistrerMesure,
  enregistrerSeance,
  versConsommation,
  versEntreeJournal,
  versMesure,
  versSeanceRealisee,
  versStatutAliment,
} from '../depots';
import { type Profil, type ProfilRow, enregistrerProfil, versProfil } from '../profil';

// Registre des entités synchronisées (docs/07 §5.1, Phase 2). Pour chaque table, comment
// convertir une ligne SQLite en `contenu` générique (identique à depotSupabase) et comment
// réécrire un `contenu` distant en local. Source unique de vérité du couple table ↔ entité.
//
// On NE synchronise que les données brutes réellement divergentes. `adaptation` et
// `seance_planifiee` en sont exclues à dessein : elles sont déterministes (recalculées par
// `evaluerAdaptation` / regénérées par `genererProgramme` à l'identique sur chaque appareil,
// ADR-002). Leurs colonnes `dirty`/`maj_le` existent (migration v6) mais restent inutilisées.

export interface EntiteSync {
  /** Nom d'entité (= colonne `entite` côté Supabase). */
  entite: string;
  /** Table SQLite locale. */
  table: string;
  /** Colonne portant la clé métier (PK). */
  colonneCle: string;
  /** Ligne SQLite → objet domaine brut (le `contenu` transporté). */
  versContenu(row: Record<string, unknown>): unknown;
  /** Upsert d'un `contenu` distant en local (pose dirty=1 ; neutralisé ensuite par la sync). */
  ecrire(db: SQLite.SQLiteDatabase, contenu: unknown): Promise<void>;
}

function def<TRow, TDom>(
  entite: string,
  table: string,
  colonneCle: string,
  versContenu: (row: TRow) => TDom,
  ecrire: (db: SQLite.SQLiteDatabase, contenu: TDom) => Promise<void>,
): EntiteSync {
  return {
    entite,
    table,
    colonneCle,
    versContenu: (row) => versContenu(row as unknown as TRow),
    ecrire: (db, contenu) => ecrire(db, contenu as TDom),
  };
}

export const ENTITES_SYNC: EntiteSync[] = [
  def<ProfilRow, Profil>('profil', 'profil', 'id', versProfil, enregistrerProfil),
  def<JournalRow, EntreeJournal>(
    'journal_crohn',
    'journal_crohn',
    'date',
    versEntreeJournal,
    enregistrerJournal,
  ),
  def<SeanceRow, SeanceRealisee>(
    'seance_realisee',
    'seance_realisee',
    'id',
    versSeanceRealisee,
    enregistrerSeance,
  ),
  def<MesureRow, MesureCorporelle>(
    'mesure_corporelle',
    'mesure_corporelle',
    'date',
    versMesure,
    enregistrerMesure,
  ),
  def<ConsommationRow, ConsommationJour>(
    'consommation_jour',
    'consommation_jour',
    'date',
    versConsommation,
    enregistrerConsommation,
  ),
  def<StatutRow, StatutAlimentManuel>(
    'aliment_statut',
    'aliment_statut',
    'aliment',
    versStatutAliment,
    definirStatutAliment,
  ),
];

/** Accès O(1) par nom d'entité. */
export const ENTITE_PAR_NOM = new Map(ENTITES_SYNC.map((e) => [e.entite, e]));
