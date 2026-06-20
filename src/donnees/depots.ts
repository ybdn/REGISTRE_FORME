import type {
  Adaptation,
  ConsommationJour,
  EntreeJournal,
  Phase,
  SeanceRealisee,
  SourceSeance,
  StatutAlimentManuel,
  TypeSeance,
} from '@/domaine/types';
import type * as SQLite from 'expo-sqlite';

// Dépôts (repositories) : seul point d'accès aux tables. Conversion ligne SQL ↔ modèle domaine.
// Toutes les requêtes sont paramétrées (anti-injection) et restent locales.
//
// Sync (docs/07 §6.1) : chaque écriture pose `dirty = 1` et `maj_le` (horodatage LWW) pour
// que le SyncManager sache quoi pousser. La suppression dure (aliment_statut) laisse un
// tombstone dans `sync_suppressions`. Les convertisseurs ligne→domaine sont exportés : la
// couche sync les réutilise pour produire le `contenu` (identique à celui de depotSupabase).

/** Horodatage d'écriture (ISO 8601 UTC), aligné sur le format `timestamptz` de Supabase. */
export function maintenant(): string {
  return new Date().toISOString();
}

export interface MesureCorporelle {
  date: string;
  poidsKg?: number;
  brasGCm?: number;
  brasDCm?: number;
  torseCm?: number;
  ventreCm?: number;
  hanchesCm?: number;
  cuissesCm?: number;
}

/** Séance planifiée telle que stockée (trame du programme). */
export interface SeancePlanifieeStockee {
  id: string;
  semaine: number;
  phase: Phase;
  jour: number;
  type: TypeSeance;
  modele: string;
  titre: string;
  estDecharge: boolean;
  estTestChrono: boolean;
}

interface PlanifieeRow {
  id: string;
  semaine: number;
  phase: Phase;
  jour: number;
  type: TypeSeance;
  modele: string;
  titre: string;
  est_decharge: number;
  est_test_chrono: number;
}

function versPlanifiee(r: PlanifieeRow): SeancePlanifieeStockee {
  return {
    id: r.id,
    semaine: r.semaine,
    phase: r.phase,
    jour: r.jour,
    type: r.type,
    modele: r.modele,
    titre: r.titre,
    estDecharge: r.est_decharge === 1,
    estTestChrono: r.est_test_chrono === 1,
  };
}

/** Toutes les séances planifiées d'une semaine donnée (triées par jour). */
export async function lireSeancesPlanifieesSemaine(
  db: SQLite.SQLiteDatabase,
  semaine: number,
): Promise<SeancePlanifieeStockee[]> {
  const lignes = await db.getAllAsync<PlanifieeRow>(
    'SELECT * FROM seance_planifiee WHERE semaine = ? ORDER BY jour',
    [semaine],
  );
  return lignes.map(versPlanifiee);
}

// ── Journal Crohn ───────────────────────────────────────────────────────────

export async function enregistrerJournal(
  db: SQLite.SQLiteDatabase,
  e: EntreeJournal,
): Promise<void> {
  await db.runAsync(
    `INSERT INTO journal_crohn
       (date, douleur, energie, digestion, nb_selles, consistance_selles, sang_selles, glaires,
        urgence_fecale, difficulte_evacuation, ballonnements, tags, note, dirty, maj_le)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
     ON CONFLICT(date) DO UPDATE SET
       douleur=excluded.douleur, energie=excluded.energie, digestion=excluded.digestion,
       nb_selles=excluded.nb_selles, consistance_selles=excluded.consistance_selles,
       sang_selles=excluded.sang_selles, glaires=excluded.glaires,
       urgence_fecale=excluded.urgence_fecale, difficulte_evacuation=excluded.difficulte_evacuation,
       ballonnements=excluded.ballonnements, tags=excluded.tags, note=excluded.note,
       dirty=1, maj_le=excluded.maj_le`,
    [
      e.date,
      e.douleur,
      e.energie,
      e.digestion,
      e.nbSelles,
      e.consistanceSelles,
      e.sangSelles ? 1 : 0,
      e.glaires ? 1 : 0,
      e.urgenceFecale ? 1 : 0,
      e.difficulteEvacuation ? 1 : 0,
      e.ballonnements ? 1 : 0,
      JSON.stringify(e.tags),
      e.note ?? null,
      maintenant(),
    ],
  );
}

export async function lireJournal(
  db: SQLite.SQLiteDatabase,
  depuis?: string,
): Promise<EntreeJournal[]> {
  const lignes = depuis
    ? await db.getAllAsync<JournalRow>(
        'SELECT * FROM journal_crohn WHERE date >= ? ORDER BY date',
        [depuis],
      )
    : await db.getAllAsync<JournalRow>('SELECT * FROM journal_crohn ORDER BY date');
  return lignes.map(versEntreeJournal);
}

export interface JournalRow {
  date: string;
  douleur: number;
  energie: number;
  digestion: number;
  nb_selles: number;
  consistance_selles: number;
  sang_selles: number;
  glaires: number;
  urgence_fecale: number;
  difficulte_evacuation: number;
  ballonnements: number;
  tags: string;
  note: string | null;
}

export function versEntreeJournal(r: JournalRow): EntreeJournal {
  return {
    date: r.date,
    douleur: r.douleur,
    energie: r.energie,
    digestion: r.digestion,
    nbSelles: r.nb_selles,
    consistanceSelles: r.consistance_selles,
    sangSelles: r.sang_selles === 1,
    glaires: r.glaires === 1,
    urgenceFecale: r.urgence_fecale === 1,
    difficulteEvacuation: r.difficulte_evacuation === 1,
    ballonnements: r.ballonnements === 1,
    tags: JSON.parse(r.tags) as string[],
    note: r.note ?? undefined,
  };
}

// ── Suivi alimentaire ───────────────────────────────────────────────────────

export async function enregistrerConsommation(
  db: SQLite.SQLiteDatabase,
  c: ConsommationJour,
): Promise<void> {
  await db.runAsync(
    `INSERT INTO consommation_jour (date, aliments, dirty, maj_le)
     VALUES (?, ?, 1, ?)
     ON CONFLICT(date) DO UPDATE SET aliments=excluded.aliments, dirty=1, maj_le=excluded.maj_le`,
    [c.date, JSON.stringify(c.aliments), maintenant()],
  );
}

export async function lireConsommations(
  db: SQLite.SQLiteDatabase,
  depuis?: string,
): Promise<ConsommationJour[]> {
  const lignes = depuis
    ? await db.getAllAsync<ConsommationRow>(
        'SELECT * FROM consommation_jour WHERE date >= ? ORDER BY date',
        [depuis],
      )
    : await db.getAllAsync<ConsommationRow>('SELECT * FROM consommation_jour ORDER BY date');
  return lignes.map(versConsommation);
}

export interface ConsommationRow {
  date: string;
  aliments: string;
}

export function versConsommation(r: ConsommationRow): ConsommationJour {
  return { date: r.date, aliments: JSON.parse(r.aliments) as string[] };
}

export async function definirStatutAliment(
  db: SQLite.SQLiteDatabase,
  s: StatutAlimentManuel,
): Promise<void> {
  await db.runAsync(
    'INSERT OR REPLACE INTO aliment_statut (aliment, statut, date_maj, dirty, maj_le) VALUES (?, ?, ?, 1, ?)',
    [s.aliment, s.statut, s.dateMaj, maintenant()],
  );
  // Réactiver un aliment annule un éventuel tombstone en attente (sinon la suppression
  // précédente repousserait l'effacement par-dessus la réactivation).
  await db.runAsync('DELETE FROM sync_suppressions WHERE entite = ? AND cle = ?', [
    'aliment_statut',
    s.aliment,
  ]);
}

export async function supprimerStatutAliment(
  db: SQLite.SQLiteDatabase,
  aliment: string,
): Promise<void> {
  await db.runAsync('DELETE FROM aliment_statut WHERE aliment = ?', [aliment]);
  // Tombstone : la suppression doit remonter au cloud puis redescendre sur les autres appareils.
  await db.runAsync(
    `INSERT OR REPLACE INTO sync_suppressions (entite, cle, maj_le, dirty)
     VALUES (?, ?, ?, 1)`,
    ['aliment_statut', aliment, maintenant()],
  );
}

export interface StatutRow {
  aliment: string;
  statut: string;
  date_maj: string;
}

export function versStatutAliment(r: StatutRow): StatutAlimentManuel {
  return {
    aliment: r.aliment,
    statut: r.statut as StatutAlimentManuel['statut'],
    dateMaj: r.date_maj,
  };
}

export async function lireStatutsAliments(
  db: SQLite.SQLiteDatabase,
): Promise<StatutAlimentManuel[]> {
  const lignes = await db.getAllAsync<StatutRow>('SELECT * FROM aliment_statut ORDER BY aliment');
  return lignes.map(versStatutAliment);
}

// ── Séances réalisées ───────────────────────────────────────────────────────

export async function enregistrerSeance(
  db: SQLite.SQLiteDatabase,
  s: SeanceRealisee,
): Promise<void> {
  await db.runAsync(
    `INSERT OR REPLACE INTO seance_realisee
       (id, date, type, variante, rpe, duree_min, distance_km, temps_sec, charges, ressenti_digestif, note, source, id_externe, dirty, maj_le)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
    [
      s.id,
      s.date,
      s.type,
      s.variante,
      s.rpe,
      s.dureeMin,
      s.distanceKm ?? null,
      s.tempsSec ?? null,
      s.charges ? JSON.stringify(s.charges) : null,
      s.ressentiDigestif ?? null,
      s.note ?? null,
      s.source ?? 'app',
      s.idExterne ?? null,
      maintenant(),
    ],
  );
}

/** Ids externes des séances déjà importées d'une source (dédoublonnage à l'import). */
export async function lireIdsExternes(
  db: SQLite.SQLiteDatabase,
  source: SourceSeance,
): Promise<string[]> {
  const lignes = await db.getAllAsync<{ id_externe: string }>(
    'SELECT id_externe FROM seance_realisee WHERE source = ? AND id_externe IS NOT NULL',
    [source],
  );
  return lignes.map((l) => l.id_externe);
}

export async function lireSeances(
  db: SQLite.SQLiteDatabase,
  depuis?: string,
): Promise<SeanceRealisee[]> {
  const lignes = depuis
    ? await db.getAllAsync<SeanceRow>(
        'SELECT * FROM seance_realisee WHERE date >= ? ORDER BY date',
        [depuis],
      )
    : await db.getAllAsync<SeanceRow>('SELECT * FROM seance_realisee ORDER BY date');
  return lignes.map(versSeanceRealisee);
}

export interface SeanceRow {
  id: string;
  date: string;
  type: SeanceRealisee['type'];
  variante: SeanceRealisee['variante'];
  rpe: number;
  duree_min: number;
  distance_km: number | null;
  temps_sec: number | null;
  charges: string | null;
  ressenti_digestif: number | null;
  note: string | null;
  source: SourceSeance;
  id_externe: string | null;
}

export function versSeanceRealisee(r: SeanceRow): SeanceRealisee {
  return {
    id: r.id,
    date: r.date,
    type: r.type,
    variante: r.variante,
    rpe: r.rpe,
    dureeMin: r.duree_min,
    distanceKm: r.distance_km ?? undefined,
    tempsSec: r.temps_sec ?? undefined,
    charges: r.charges ? JSON.parse(r.charges) : undefined,
    ressentiDigestif: r.ressenti_digestif ?? undefined,
    note: r.note ?? undefined,
    source: r.source,
    idExterne: r.id_externe ?? undefined,
  };
}

// ── Mesures corporelles ─────────────────────────────────────────────────────

export interface MesureRow {
  date: string;
  poids_kg: number | null;
  bras_g_cm: number | null;
  bras_d_cm: number | null;
  torse_cm: number | null;
  ventre_cm: number | null;
  hanches_cm: number | null;
  cuisses_cm: number | null;
}

export function versMesure(r: MesureRow): MesureCorporelle {
  return {
    date: r.date,
    poidsKg: r.poids_kg ?? undefined,
    brasGCm: r.bras_g_cm ?? undefined,
    brasDCm: r.bras_d_cm ?? undefined,
    torseCm: r.torse_cm ?? undefined,
    ventreCm: r.ventre_cm ?? undefined,
    hanchesCm: r.hanches_cm ?? undefined,
    cuissesCm: r.cuisses_cm ?? undefined,
  };
}

export async function lireMesures(
  db: SQLite.SQLiteDatabase,
  depuis?: string,
): Promise<MesureCorporelle[]> {
  const lignes = depuis
    ? await db.getAllAsync<MesureRow>(
        'SELECT * FROM mesure_corporelle WHERE date >= ? ORDER BY date',
        [depuis],
      )
    : await db.getAllAsync<MesureRow>('SELECT * FROM mesure_corporelle ORDER BY date');
  return lignes.map(versMesure);
}

export async function enregistrerMesure(
  db: SQLite.SQLiteDatabase,
  m: MesureCorporelle,
): Promise<void> {
  await db.runAsync(
    `INSERT OR REPLACE INTO mesure_corporelle
       (date, poids_kg, bras_g_cm, bras_d_cm, torse_cm, ventre_cm, hanches_cm, cuisses_cm, dirty, maj_le)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
    [
      m.date,
      m.poidsKg ?? null,
      m.brasGCm ?? null,
      m.brasDCm ?? null,
      m.torseCm ?? null,
      m.ventreCm ?? null,
      m.hanchesCm ?? null,
      m.cuissesCm ?? null,
      maintenant(),
    ],
  );
}

// ── Adaptations ─────────────────────────────────────────────────────────────

export async function enregistrerAdaptation(
  db: SQLite.SQLiteDatabase,
  a: Adaptation,
  id: string,
  dateCreation: string,
): Promise<void> {
  await db.runAsync(
    `INSERT OR REPLACE INTO adaptation (id, date, type, raison, details, annulee, date_creation)
     VALUES (?, ?, ?, ?, ?, 0, ?)`,
    [id, a.date, a.type, a.raison, a.details ? JSON.stringify(a.details) : null, dateCreation],
  );
}

export async function annulerAdaptation(db: SQLite.SQLiteDatabase, id: string): Promise<void> {
  await db.runAsync('UPDATE adaptation SET annulee = 1 WHERE id = ?', [id]);
}

/** Adaptations effectivement appliquées (non annulées) depuis une date, pour le rapport gastro. */
export async function lireAdaptationsAppliquees(
  db: SQLite.SQLiteDatabase,
  depuis: string,
): Promise<{ date: string; raison: string }[]> {
  return db.getAllAsync<{ date: string; raison: string }>(
    'SELECT date, raison FROM adaptation WHERE annulee = 0 AND type != ? AND date >= ? ORDER BY date',
    ['aucune', depuis],
  );
}
