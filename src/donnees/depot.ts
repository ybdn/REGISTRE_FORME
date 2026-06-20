import type { LigneSauvegarde } from '@/domaine/sauvegarde';
import type {
  Adaptation,
  ConsommationJour,
  EntreeJournal,
  HydratationJour,
  SeanceRealisee,
  SourceSeance,
  StatutAlimentManuel,
} from '@/domaine/types';
import type { MesureCorporelle, SeancePlanifieeStockee } from './depots';
import type { Profil } from './profil';

// Interface neutre de persistance (prérequis du portage web, cf. docs/07 §4.2).
// AUCUN type Expo/SQLite dans cette signature : le store parle à `Depot`, jamais à `db`.
// Implémentations : `depotSqlite` (mobile), `depotMemoire` (tests), `depotSupabase` (web, Phase 1).
//
// Chaque implémentation capture sa source de données à la construction (clôture sur `db`,
// client Supabase…) au lieu de la recevoir en paramètre à chaque appel.

export interface Depot {
  // ── Amorçage du programme 16 semaines ──────────────────────────────────────
  programmeDejaSeede(): Promise<boolean>;
  seederProgramme(): Promise<void>;

  // ── Profil (singleton) ─────────────────────────────────────────────────────
  lireProfil(): Promise<Profil | null>;
  enregistrerProfil(p: Profil): Promise<void>;

  // ── Journal Crohn ──────────────────────────────────────────────────────────
  lireJournal(depuis?: string): Promise<EntreeJournal[]>;
  enregistrerJournal(e: EntreeJournal): Promise<void>;

  // ── Séances réalisées ──────────────────────────────────────────────────────
  lireSeances(depuis?: string): Promise<SeanceRealisee[]>;
  enregistrerSeance(s: SeanceRealisee): Promise<void>;
  /** Ids externes déjà importés d'une source (dédoublonnage à l'import). */
  lireIdsExternes(source: SourceSeance): Promise<string[]>;

  // ── Mesures corporelles ────────────────────────────────────────────────────
  lireMesures(depuis?: string): Promise<MesureCorporelle[]>;
  enregistrerMesure(m: MesureCorporelle): Promise<void>;

  // ── Suivi alimentaire ──────────────────────────────────────────────────────
  lireConsommations(depuis?: string): Promise<ConsommationJour[]>;
  enregistrerConsommation(c: ConsommationJour): Promise<void>;
  lireStatutsAliments(): Promise<StatutAlimentManuel[]>;
  definirStatutAliment(s: StatutAlimentManuel): Promise<void>;
  supprimerStatutAliment(aliment: string): Promise<void>;

  // ── Suivi de l'hydratation ─────────────────────────────────────────────────
  lireHydratations(depuis?: string): Promise<HydratationJour[]>;
  enregistrerHydratation(h: HydratationJour): Promise<void>;

  // ── Séances planifiées (trame du programme) ────────────────────────────────
  lireSeancesPlanifieesSemaine(semaine: number): Promise<SeancePlanifieeStockee[]>;

  // ── Adaptations du moteur (traçables, annulables) ──────────────────────────
  enregistrerAdaptation(a: Adaptation, id: string, dateCreation: string): Promise<void>;
  annulerAdaptation(id: string): Promise<void>;
  /** Adaptations appliquées (non annulées) depuis une date, pour le rapport gastro. */
  lireAdaptationsAppliquees(depuis: string): Promise<{ date: string; raison: string }[]>;

  // ── Sauvegarde locale (instantané/restauration de toutes les entités) ──────
  // Abstraction « dump/restore » indépendante du backend : SQLite fait un SELECT *,
  // un autre backend produira le même contenu logique.
  instantanerToutesLesTables(): Promise<Record<string, LigneSauvegarde[]>>;
  remplacerToutesLesTables(tables: Record<string, LigneSauvegarde[]>): Promise<void>;
}
