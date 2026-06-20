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
  {
    version: 2,
    nom: 'variante_quatre_niveaux',
    // Élargit le CHECK de seance_realisee.variante aux 4 niveaux gradués du moteur v2
    // ('normale','moderee','allegee','repos'). SQLite ne sait pas modifier un CHECK en
    // place : on recrée la table et on recopie les données existantes.
    sql: `
      CREATE TABLE seance_realisee_v2 (
        id TEXT PRIMARY KEY,
        date TEXT NOT NULL,
        type TEXT NOT NULL CHECK (type IN ('course','salle','freeletics','sante')),
        variante TEXT NOT NULL CHECK (variante IN ('normale','moderee','allegee','repos')),
        rpe INTEGER NOT NULL CHECK (rpe BETWEEN 1 AND 10),
        duree_min INTEGER NOT NULL,
        distance_km REAL,
        temps_sec INTEGER,
        charges TEXT,
        ressenti_digestif INTEGER CHECK (ressenti_digestif BETWEEN 1 AND 5),
        note TEXT
      );
      INSERT INTO seance_realisee_v2
        SELECT id, date, type, variante, rpe, duree_min, distance_km, temps_sec, charges, ressenti_digestif, note
        FROM seance_realisee;
      DROP TABLE seance_realisee;
      ALTER TABLE seance_realisee_v2 RENAME TO seance_realisee;
      CREATE INDEX IF NOT EXISTS idx_seance_realisee_date ON seance_realisee(date);
    `,
  },
  {
    version: 3,
    nom: 'plan_vivant_mode_pousse',
    // Plan vivant (doc 02 §2.6) : mode poussée sur le profil + le programme peut
    // désormais s'étendre au-delà de 16 semaines-calendrier (glissement) — on lève
    // le CHECK `semaine BETWEEN 1 AND 16` en recréant seance_planifiee.
    sql: `
      ALTER TABLE profil ADD COLUMN mode_pousse INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE profil ADD COLUMN date_debut_pousse TEXT;

      CREATE TABLE seance_planifiee_v3 (
        id TEXT PRIMARY KEY,
        semaine INTEGER NOT NULL CHECK (semaine >= 1),
        phase TEXT NOT NULL CHECK (phase IN ('reprise','construction','performance')),
        jour INTEGER NOT NULL CHECK (jour BETWEEN 0 AND 6),
        type TEXT NOT NULL CHECK (type IN ('course','salle','freeletics','sante')),
        modele TEXT NOT NULL,
        titre TEXT NOT NULL,
        est_decharge INTEGER NOT NULL DEFAULT 0,
        est_test_chrono INTEGER NOT NULL DEFAULT 0
      );
      INSERT INTO seance_planifiee_v3
        SELECT id, semaine, phase, jour, type, modele, titre, est_decharge, est_test_chrono
        FROM seance_planifiee;
      DROP TABLE seance_planifiee;
      ALTER TABLE seance_planifiee_v3 RENAME TO seance_planifiee;
    `,
  },
  {
    version: 4,
    nom: 'suivi_alimentaire',
    sql: `
      -- Consommations du jour : chips d'aliments/boissons (JSON array, comme journal_crohn.tags).
      CREATE TABLE IF NOT EXISTS consommation_jour (
        date TEXT PRIMARY KEY,                      -- AAAA-MM-JJ, une entrée/jour
        aliments TEXT NOT NULL DEFAULT '[]'         -- JSON array de noms normalisés
      );

      -- Statut manuel par aliment (prime sur le verdict auto ; absence de ligne = aucun statut).
      CREATE TABLE IF NOT EXISTS aliment_statut (
        aliment TEXT PRIMARY KEY,
        statut TEXT NOT NULL CHECK (statut IN ('tolere','a-eviter','a-tester')),
        date_maj TEXT NOT NULL
      );
    `,
  },
  {
    version: 5,
    nom: 'source_seances_externes',
    sql: `
      -- Provenance d'une séance réalisée : saisie dans l'app ou importée de Santé Connect.
      ALTER TABLE seance_realisee ADD COLUMN source TEXT NOT NULL DEFAULT 'app'
        CHECK (source IN ('app','sante_connect'));
      -- Identifiant du record chez la source externe — clé de dédoublonnage.
      ALTER TABLE seance_realisee ADD COLUMN id_externe TEXT;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_seance_realisee_id_externe
        ON seance_realisee(id_externe) WHERE id_externe IS NOT NULL;
    `,
  },
  {
    version: 6,
    nom: 'sync_supabase',
    // Quincaillerie de synchronisation offline-first (docs/07 §6.1, Phase 2). Deux colonnes
    // par table synchronisée : `dirty` (à pousser au cloud) et `maj_le` (horloge LWW).
    // `dirty DEFAULT 1` garantit que TOUTES les données déjà présentes d'un utilisateur installé
    // sont poussées au premier rapprochement (rien n'est oublié). `photo_suivi` est hors périmètre
    // (fichiers image). Deux tables de service : `sync_etat` (borne `derniereSync`) et
    // `sync_suppressions` (tombstones — l'app ne fait de suppression dure que sur aliment_statut).
    sql: `
      ALTER TABLE profil            ADD COLUMN dirty INTEGER NOT NULL DEFAULT 1;
      ALTER TABLE profil            ADD COLUMN maj_le TEXT;
      ALTER TABLE journal_crohn     ADD COLUMN dirty INTEGER NOT NULL DEFAULT 1;
      ALTER TABLE journal_crohn     ADD COLUMN maj_le TEXT;
      ALTER TABLE seance_planifiee  ADD COLUMN dirty INTEGER NOT NULL DEFAULT 1;
      ALTER TABLE seance_planifiee  ADD COLUMN maj_le TEXT;
      ALTER TABLE seance_realisee   ADD COLUMN dirty INTEGER NOT NULL DEFAULT 1;
      ALTER TABLE seance_realisee   ADD COLUMN maj_le TEXT;
      ALTER TABLE mesure_corporelle ADD COLUMN dirty INTEGER NOT NULL DEFAULT 1;
      ALTER TABLE mesure_corporelle ADD COLUMN maj_le TEXT;
      ALTER TABLE adaptation        ADD COLUMN dirty INTEGER NOT NULL DEFAULT 1;
      ALTER TABLE adaptation        ADD COLUMN maj_le TEXT;
      ALTER TABLE consommation_jour ADD COLUMN dirty INTEGER NOT NULL DEFAULT 1;
      ALTER TABLE consommation_jour ADD COLUMN maj_le TEXT;
      ALTER TABLE aliment_statut    ADD COLUMN dirty INTEGER NOT NULL DEFAULT 1;
      ALTER TABLE aliment_statut    ADD COLUMN maj_le TEXT;

      CREATE TABLE IF NOT EXISTS sync_etat (
        cle    TEXT PRIMARY KEY,   -- ex: 'derniereSync'
        valeur TEXT NOT NULL
      );

      -- Tombstones : une suppression dure (aliment_statut) laisse une trace pour que
      -- l'effacement se propage aux autres appareils (et ne soit pas « ressuscité » par
      -- un pull plus ancien). dirty=1 = reste à pousser.
      CREATE TABLE IF NOT EXISTS sync_suppressions (
        entite TEXT NOT NULL,
        cle    TEXT NOT NULL,
        maj_le TEXT,
        dirty  INTEGER NOT NULL DEFAULT 1,
        PRIMARY KEY (entite, cle)
      );
    `,
  },
  {
    version: 7,
    nom: 'suivi_hydratation',
    sql: `
      -- Prises de boisson du jour : tableau JSON de { boisson, volumeMl, heure? }, une entrée/jour
      -- (même modèle que consommation_jour). Le bilan hydrique net est recalculé à la volée.
      -- Colonnes de sync dès la création (dirty/maj_le) : entité synchronisée comme les autres.
      CREATE TABLE IF NOT EXISTS hydratation_jour (
        date   TEXT PRIMARY KEY,                     -- AAAA-MM-JJ
        prises TEXT NOT NULL DEFAULT '[]',           -- JSON array de PriseHydrique
        dirty  INTEGER NOT NULL DEFAULT 1,
        maj_le TEXT
      );
    `,
  },
  {
    version: 8,
    nom: 'transit_mici',
    // Signaux de transit cliniquement pertinents en MICI (Crohn) : échelle de Bristol
    // (consistance, plus parlante que le seul comptage), sang, glaires, urgence fécale,
    // difficulté d'évacuation. Défauts neutres pour les entrées déjà saisies.
    sql: `
      ALTER TABLE journal_crohn ADD COLUMN consistance_selles INTEGER NOT NULL DEFAULT 4
        CHECK (consistance_selles BETWEEN 1 AND 7);
      ALTER TABLE journal_crohn ADD COLUMN sang_selles INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE journal_crohn ADD COLUMN glaires INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE journal_crohn ADD COLUMN urgence_fecale INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE journal_crohn ADD COLUMN difficulte_evacuation INTEGER NOT NULL DEFAULT 0;
    `,
  },
];

/** Version cible = plus haute migration connue. */
export const VERSION_CIBLE = MIGRATIONS.reduce((max, m) => Math.max(max, m.version), 0);
