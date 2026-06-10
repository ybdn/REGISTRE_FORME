import type { Adaptation, EntreeJournal, Phase, SeanceRealisee, TypeSeance } from '@/domaine/types';
import type * as SQLite from 'expo-sqlite';

// Dépôts (repositories) : seul point d'accès aux tables. Conversion ligne SQL ↔ modèle domaine.
// Toutes les requêtes sont paramétrées (anti-injection) et restent locales.

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
    `INSERT INTO journal_crohn (date, douleur, energie, digestion, nb_selles, ballonnements, tags, note)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(date) DO UPDATE SET
       douleur=excluded.douleur, energie=excluded.energie, digestion=excluded.digestion,
       nb_selles=excluded.nb_selles, ballonnements=excluded.ballonnements,
       tags=excluded.tags, note=excluded.note`,
    [
      e.date,
      e.douleur,
      e.energie,
      e.digestion,
      e.nbSelles,
      e.ballonnements ? 1 : 0,
      JSON.stringify(e.tags),
      e.note ?? null,
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

interface JournalRow {
  date: string;
  douleur: number;
  energie: number;
  digestion: number;
  nb_selles: number;
  ballonnements: number;
  tags: string;
  note: string | null;
}

function versEntreeJournal(r: JournalRow): EntreeJournal {
  return {
    date: r.date,
    douleur: r.douleur,
    energie: r.energie,
    digestion: r.digestion,
    nbSelles: r.nb_selles,
    ballonnements: r.ballonnements === 1,
    tags: JSON.parse(r.tags) as string[],
    note: r.note ?? undefined,
  };
}

// ── Séances réalisées ───────────────────────────────────────────────────────

export async function enregistrerSeance(
  db: SQLite.SQLiteDatabase,
  s: SeanceRealisee,
): Promise<void> {
  await db.runAsync(
    `INSERT OR REPLACE INTO seance_realisee
       (id, date, type, variante, rpe, duree_min, distance_km, temps_sec, charges, ressenti_digestif, note)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
    ],
  );
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

interface SeanceRow {
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
}

function versSeanceRealisee(r: SeanceRow): SeanceRealisee {
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
  };
}

// ── Mesures corporelles ─────────────────────────────────────────────────────

interface MesureRow {
  date: string;
  poids_kg: number | null;
  bras_g_cm: number | null;
  bras_d_cm: number | null;
  torse_cm: number | null;
  ventre_cm: number | null;
  hanches_cm: number | null;
  cuisses_cm: number | null;
}

function versMesure(r: MesureRow): MesureCorporelle {
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
       (date, poids_kg, bras_g_cm, bras_d_cm, torse_cm, ventre_cm, hanches_cm, cuisses_cm)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      m.date,
      m.poidsKg ?? null,
      m.brasGCm ?? null,
      m.brasDCm ?? null,
      m.torseCm ?? null,
      m.ventreCm ?? null,
      m.hanchesCm ?? null,
      m.cuissesCm ?? null,
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
