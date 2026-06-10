// Schéma SQLite versionné de REGISTRE.FORME.
// Chaque migration est idempotente vis-à-vis de `user_version` (PRAGMA).
// Local-first : toutes les données restent sur l'appareil.

export interface Migration {
  version: number;
  nom: string;
  sql: string;
}

// Les migrations s'appliquent dans l'ordre croissant de `version`.
// Ne jamais réécrire une migration déjà publiée : en ajouter une nouvelle.
export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    nom: 'schema_initial',
    sql: `
      -- Profil utilisateur (une seule ligne, id = 1).
      CREATE TABLE IF NOT EXISTS profil (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        taille_cm INTEGER NOT NULL,
        age INTEGER NOT NULL,
        date_debut_programme TEXT NOT NULL,        -- AAAA-MM-JJ, lundi S1
        disclaimer_accepte INTEGER NOT NULL DEFAULT 0,
        date_acceptation_disclaimer TEXT,
        sante_optin INTEGER NOT NULL DEFAULT 0      -- intégration Health Connect/Kit
      );

      -- Entrées quotidiennes du journal Crohn.
      CREATE TABLE IF NOT EXISTS journal_crohn (
        date TEXT PRIMARY KEY,                      -- AAAA-MM-JJ, une entrée/jour
        douleur INTEGER NOT NULL CHECK (douleur BETWEEN 0 AND 10),
        energie INTEGER NOT NULL CHECK (energie BETWEEN 1 AND 5),
        digestion INTEGER NOT NULL CHECK (digestion BETWEEN 1 AND 5),
        nb_selles INTEGER NOT NULL DEFAULT 0,
        ballonnements INTEGER NOT NULL DEFAULT 0,
        tags TEXT NOT NULL DEFAULT '[]',            -- JSON array
        note TEXT
      );

      -- Séances planifiées (trame issue du générateur, jours déplaçables).
      CREATE TABLE IF NOT EXISTS seance_planifiee (
        id TEXT PRIMARY KEY,
        semaine INTEGER NOT NULL CHECK (semaine BETWEEN 1 AND 16),
        phase TEXT NOT NULL CHECK (phase IN ('reprise','construction','performance')),
        jour INTEGER NOT NULL CHECK (jour BETWEEN 0 AND 6),
        type TEXT NOT NULL CHECK (type IN ('course','salle','freeletics','sante')),
        modele TEXT NOT NULL,
        titre TEXT NOT NULL,
        est_decharge INTEGER NOT NULL DEFAULT 0,
        est_test_chrono INTEGER NOT NULL DEFAULT 0
      );

      -- Séances réalisées (saisie post-séance).
      CREATE TABLE IF NOT EXISTS seance_realisee (
        id TEXT PRIMARY KEY,
        date TEXT NOT NULL,
        type TEXT NOT NULL CHECK (type IN ('course','salle','freeletics','sante')),
        variante TEXT NOT NULL CHECK (variante IN ('normale','allegee')),
        rpe INTEGER NOT NULL CHECK (rpe BETWEEN 1 AND 10),
        duree_min INTEGER NOT NULL,
        distance_km REAL,
        temps_sec INTEGER,
        charges TEXT,                               -- JSON array de ChargeExercice
        ressenti_digestif INTEGER CHECK (ressenti_digestif BETWEEN 1 AND 5),
        note TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_seance_realisee_date ON seance_realisee(date);

      -- Mesures corporelles (poids hebdo, mensurations bi-hebdo).
      CREATE TABLE IF NOT EXISTS mesure_corporelle (
        date TEXT PRIMARY KEY,
        poids_kg REAL,
        bras_g_cm REAL,
        bras_d_cm REAL,
        torse_cm REAL,
        ventre_cm REAL,
        hanches_cm REAL,
        cuisses_cm REAL
      );

      -- Photos de suivi (chemin du fichier chiffré local).
      CREATE TABLE IF NOT EXISTS photo_suivi (
        id TEXT PRIMARY KEY,
        date TEXT NOT NULL,
        chemin_chiffre TEXT NOT NULL,
        note TEXT
      );

      -- Journal des adaptations décidées par le moteur (traçable, annulable).
      CREATE TABLE IF NOT EXISTS adaptation (
        id TEXT PRIMARY KEY,
        date TEXT NOT NULL,
        type TEXT NOT NULL,
        raison TEXT NOT NULL,
        details TEXT,                               -- JSON
        annulee INTEGER NOT NULL DEFAULT 0,
        date_creation TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_adaptation_date ON adaptation(date);
    `,
  },
];

/** Version cible = plus haute migration connue. */
export const VERSION_CIBLE = MIGRATIONS.reduce((max, m) => Math.max(max, m.version), 0);
