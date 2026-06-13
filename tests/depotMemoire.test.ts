import { aujourdhuiISO } from '@/domaine/dates';
import { creerDepotMemoire } from '@/donnees/depotMemoire';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Le portage web (docs/07, Phase 0) découple le store de SQLite via l'interface `Depot`.
// Ce fichier prouve le découplage : 1) le dépôt mémoire honore le contrat, 2) le store
// fonctionne intégralement sur ce dépôt, sans émulateur ni expo-sqlite.

// On neutralise les modules natifs Expo tirés par l'import du store (aucun n'est exercé
// par ces tests : la persistance passe par le dépôt mémoire injecté).
vi.mock('expo-sqlite', () => ({}));
vi.mock('expo-crypto', () => ({
  randomUUID: () => `id-${Math.random().toString(36).slice(2)}`,
}));
vi.mock('@/donnees/notifications', () => ({
  synchroniserNotifications: () => Promise.resolve(),
}));
vi.mock('@/donnees/rapportPdf', () => ({ genererRapportPdf: () => Promise.resolve('') }));
vi.mock('@/donnees/santeConnect', () => ({
  lireSessionsExternes: () => Promise.resolve([]),
  santeConnectDisponible: () => Promise.resolve(false),
}));
vi.mock('@/donnees/sauvegarde', () => ({
  exporterSauvegarde: () => Promise.resolve(''),
  importerSauvegarde: () => Promise.resolve(),
}));

describe('depotMemoire (contrat Depot)', () => {
  it('relit ce qu’il enregistre (aller-retour journal)', async () => {
    const depot = creerDepotMemoire();
    await depot.enregistrerJournal({
      date: '2026-06-10',
      douleur: 2,
      energie: 4,
      digestion: 4,
      nbSelles: 1,
      ballonnements: false,
      tags: ['repas-gras'],
    });
    const lu = await depot.lireJournal('2026-06-01');
    expect(lu).toHaveLength(1);
    expect(lu[0]).toMatchObject({ date: '2026-06-10', douleur: 2, tags: ['repas-gras'] });
  });

  it('seed le programme et reste idempotent', async () => {
    const depot = creerDepotMemoire();
    expect(await depot.programmeDejaSeede()).toBe(false);
    await depot.seederProgramme();
    await depot.seederProgramme(); // 2e appel sans effet
    expect(await depot.programmeDejaSeede()).toBe(true);
    const s1 = await depot.lireSeancesPlanifieesSemaine(1);
    expect(s1.length).toBeGreaterThan(0);
    expect(s1.every((s) => s.semaine === 1)).toBe(true);
  });

  it('filtre la fenêtre temporelle sur `depuis`', async () => {
    const depot = creerDepotMemoire();
    const base = {
      douleur: 0,
      energie: 5,
      digestion: 5,
      nbSelles: 0,
      ballonnements: false,
      tags: [],
    };
    await depot.enregistrerJournal({ date: '2026-01-01', ...base });
    await depot.enregistrerJournal({ date: '2026-06-01', ...base });
    expect(await depot.lireJournal('2026-05-01')).toHaveLength(1);
    expect(await depot.lireJournal()).toHaveLength(2);
  });

  it('exclut les adaptations annulées de la lecture appliquée', async () => {
    const depot = creerDepotMemoire();
    await depot.enregistrerAdaptation(
      {
        date: '2026-06-10',
        type: 'allegement_jour',
        raison: 'douleur élevée',
        annulable: true,
        niveauSeance: 'allegee',
        score: 30,
        reglesAussiDeclenchees: [],
      },
      '2026-06-10-allegement_jour',
      '2026-06-10',
    );
    expect(await depot.lireAdaptationsAppliquees('2026-06-01')).toHaveLength(1);
    await depot.annulerAdaptation('2026-06-10-allegement_jour');
    expect(await depot.lireAdaptationsAppliquees('2026-06-01')).toHaveLength(0);
  });

  it('dédoublonne les ids externes par source', async () => {
    const depot = creerDepotMemoire();
    await depot.enregistrerSeance({
      id: 'a',
      date: '2026-06-10',
      type: 'course',
      variante: 'normale',
      rpe: 5,
      dureeMin: 30,
      source: 'sante_connect',
      idExterne: 'ext-1',
    });
    expect(await depot.lireIdsExternes('sante_connect')).toEqual(['ext-1']);
    expect(await depot.lireIdsExternes('app')).toEqual([]);
  });
});

describe('magasin sur dépôt mémoire (store découplé de SQLite)', () => {
  // Le store garde un état module (depot, initEnCours) → import dynamique frais par test.
  beforeEach(() => {
    vi.resetModules();
  });

  it('s’initialise, seed le programme et expose la semaine courante', async () => {
    const { useMagasin } = await import('@/etat/magasin');
    const depot = creerDepotMemoire();
    await useMagasin.getState().initialiser(() => Promise.resolve(depot));

    const etat = useMagasin.getState();
    expect(etat.pret).toBe(true);
    expect(etat.planifieesSemaine.length).toBeGreaterThan(0);
  });

  it('persiste un profil puis un journal et recalcule l’état dérivé', async () => {
    const { useMagasin } = await import('@/etat/magasin');
    const depot = creerDepotMemoire();
    const aujourdhui = aujourdhuiISO();
    await useMagasin.getState().initialiser(() => Promise.resolve(depot));

    await useMagasin.getState().creerProfil({
      tailleCm: 178,
      age: 34,
      dateDebutProgramme: aujourdhui,
      santeOptin: false,
    });
    expect(useMagasin.getState().profil).toMatchObject({ tailleCm: 178, modePousse: false });

    await useMagasin.getState().saisirJournal({
      date: aujourdhui,
      douleur: 1,
      energie: 4,
      digestion: 4,
      nbSelles: 1,
      ballonnements: false,
      tags: [],
    });

    const etat = useMagasin.getState();
    expect(etat.journal.some((e) => e.date === aujourdhui)).toBe(true);
    // L'entrée du jour existant, le score de forme dérivé est recalculé (jamais stocké).
    expect(etat.scoreFormeDuJour).not.toBeNull();
    // Le dépôt mémoire a bien reçu l'écriture (persistance vérifiée hors store).
    expect(await depot.lireJournal(aujourdhui)).toHaveLength(1);
  });
});
