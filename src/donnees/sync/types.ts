// Contrats de la synchronisation offline-first (docs/07 §4.4, Phase 2).
//
// Le `SyncManager` (syncManager.ts) est une orchestration PURE : il ne connaît ni SQLite ni
// Supabase, seulement ces trois interfaces. Cela le rend testable sans émulateur ni réseau
// (cf. tests/syncManager.test.ts), comme le reste du domaine.

/** Enregistrement générique transporté (miroir de la table `enregistrements` Supabase, ADR-003). */
export interface EnregistrementSync {
  /** Entité métier : 'journal_crohn' | 'seance_realisee' | 'profil' | … */
  entite: string;
  /** Clé métier : date AAAA-MM-JJ, id UUID, nom d'aliment, ou '1' (profil). */
  cle: string;
  /** Objet domaine brut (camelCase), identique au `contenu` écrit par depotSupabase ; `null` si supprimé. */
  contenu: unknown | null;
  /** Tombstone : l'enregistrement a été supprimé (l'effacement se propage). */
  supprime: boolean;
  /** Horloge LWW (ISO 8601 UTC). Côté local, alignée sur le serveur après chaque push. */
  majLe: string;
}

/** Référence minimale d'un enregistrement (pour marquage / lookup). */
export interface RefSync {
  entite: string;
  cle: string;
}

/** Côté local (SQLite mobile) : ce dont le SyncManager a besoin pour pousser/appliquer. */
export interface DepotLocalSync {
  /** Tous les enregistrements marqués `dirty` (à pousser), tombstones inclus. */
  lireSales(): Promise<EnregistrementSync[]>;
  /** Marque comme synchronisés (dirty=0) et aligne le `maj_le` local sur la valeur serveur. */
  marquerSynchronises(enrs: EnregistrementSync[]): Promise<void>;
  /** `maj_le` local d'un enregistrement (ligne OU tombstone), ou `null` s'il est inconnu. */
  majLeLocal(entite: string, cle: string): Promise<string | null>;
  /** Applique un enregistrement distant en local SANS le marquer dirty (dirty=0). */
  appliquerDistant(enr: EnregistrementSync): Promise<void>;
}

/** Côté distant (Supabase) : transport générique vers/depuis la table `enregistrements`. */
export interface TransportSync {
  /** Upsert des enregistrements ; renvoie les lignes horodatées par le serveur (maj_le autoritaire). */
  pousser(enrs: EnregistrementSync[]): Promise<EnregistrementSync[]>;
  /** Enregistrements dont `maj_le` est strictement postérieur à `borne`, triés croissant. */
  recupererDepuis(borne: string): Promise<EnregistrementSync[]>;
}

/** Persistance de la borne de pull incrémental (`derniereSync`). */
export interface EtatSync {
  lireDerniereSync(): Promise<string>;
  ecrireDerniereSync(borne: string): Promise<void>;
}

/** Issue d'un cycle de synchronisation. */
export interface ResultatSync {
  statut: 'ok' | 'confirmationRequise';
  /** Nombre d'enregistrements poussés au cloud. */
  pousses: number;
  /** Nombre d'enregistrements distants appliqués en local (LWW). */
  appliques: number;
}

/** Borne initiale (epoch) : aucune sync encore faite → pull complet. */
export const BORNE_INITIALE = '1970-01-01T00:00:00.000Z';
