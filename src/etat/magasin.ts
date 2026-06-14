import {
  type Adaptation,
  type Baseline,
  type ConsommationJour,
  type EntreeJournal,
  FENETRE_IMPORT_SANTE_CONNECT_JOURS,
  MODELE_ALLEGE_ID,
  type ScoreForme,
  type SeanceRealisee,
  type StatutAliment,
  type StatutAlimentManuel,
  type VarianteSeance,
  acwr,
  ajouterJours,
  aujourdhuiISO,
  calculerBaseline,
  calculerScoreForme,
  evaluerAdaptation,
  filtrerNouvellesSessions,
  jourDeLaSemaine,
  mapperSessionExterne,
  normaliserAliment,
  numeroSemaine,
  obtenirModele,
} from '@/domaine';
import { type Identifiants, seConnecter, seDeconnecter, sessionActuelle } from '@/donnees/auth';
import {
  creerCodecCoffre,
  definirCleE2EE,
  definirConfigureE2EE,
  e2eeConfigure,
  e2eeDeverrouille,
  effacerCoffreE2EE,
} from '@/donnees/coffreE2EE';
import type { Depot } from '@/donnees/depot';
import type { MesureCorporelle, SeancePlanifieeStockee } from '@/donnees/depots';
import { ErreurE2EE, initialiserMeta, ouvrirMeta } from '@/donnees/e2ee';
import { ecrireMetaE2EE, lireMetaE2EE, rechiffrerTout } from '@/donnees/e2eeCloud';
import { creerDepotParDefaut } from '@/donnees/fabriqueDepot';
import { creerSyncLocal } from '@/donnees/fabriqueSync';
import { synchroniserNotifications } from '@/donnees/notifications';
import type { Profil } from '@/donnees/profil';
import { genererRapportPdf } from '@/donnees/rapportPdf';
import { lireSessionsExternes, santeConnectDisponible } from '@/donnees/santeConnect';
import {
  exporterSauvegarde as exporterSauvegardeDb,
  importerSauvegarde as importerSauvegardeDb,
} from '@/donnees/sauvegarde';
import { obtenirSupabase, supabaseConfigure } from '@/donnees/supabaseClient';
import type { SyncLocalSqlite } from '@/donnees/sync/syncLocalSqlite';
import { synchroniser } from '@/donnees/sync/syncManager';
import { creerTransportSupabase } from '@/donnees/sync/transportSupabase';
import type { TransportSync } from '@/donnees/sync/types';
import * as Crypto from 'expo-crypto';
import { create } from 'zustand';

// Store applicatif unique (KISS). La persistance est gardée hors de l'état (non sérialisable)
// et n'est connue qu'à travers l'interface `Depot` — le store ignore SQLite/Supabase (docs/07).

let depot: Depot | null = null;
// Garde anti-double-initialisation (StrictMode monte les effets deux fois en dev).
let initEnCours: Promise<void> | null = null;

// ── Synchronisation cloud (mobile, opt-in, docs/07 Phase 2) ──────────────────
// `syncLocal` = côté SQLite local (lecture des `dirty`, application LWW) ; `transport` = côté
// Supabase (présent une fois connecté). Tout reste `null` sur web (online-first) et hors config.
let syncLocal: SyncLocalSqlite | null = null;
let transport: TransportSync | null = null;
let timerSync: ReturnType<typeof setTimeout> | null = null;
/** Anti-rafale : on coalesce les écritures successives en une seule passe de sync. */
const DELAI_SYNC_MS = 2000;

/** Séance du jour effective = trame planifiée, graduée selon le niveau décidé par le moteur. */
export interface SeanceDuJour {
  planifiee: SeancePlanifieeStockee;
  modeleApplique: string;
  /** Niveau gradué appliqué (normale / moderee / allegee). Le repos renvoie `null` côté store. */
  niveau: VarianteSeance;
  /** Compat UI historique : vrai si le niveau est « allégée ». */
  allegee: boolean;
}

/** État de la synchronisation cloud, exposé à l'UI (indicateur + écran Réglages). */
export type StatutSync = 'inactif' | 'enCours' | 'ok' | 'erreur' | 'confirmationRequise';
export interface EtatSyncUI {
  /** Sync possible sur cet appareil (Supabase configuré + plateforme mobile). */
  disponible: boolean;
  /** Une session est active (l'utilisateur s'est connecté). */
  connecte: boolean;
  email: string | null;
  statut: StatutSync;
  /** ISO du dernier rapprochement réussi. */
  derniere: string | null;
  /** Message d'erreur éventuel (statut 'erreur'). */
  message: string | null;
}

const SYNC_INITIAL: EtatSyncUI = {
  disponible: false,
  connecte: false,
  email: null,
  statut: 'inactif',
  derniere: null,
  message: null,
};

/** État du chiffrement de bout en bout, exposé à l'UI (carte Réglages + garde web). */
export type StatutE2EE = 'inactif' | 'enCours' | 'erreur';
export interface EtatE2EE {
  /** Une passphrase E2EE a déjà été définie pour ce compte (meta présente côté cloud). */
  configure: boolean;
  /** La clé est en mémoire pour cette session (E2EE déverrouillé). */
  deverrouille: boolean;
  statut: StatutE2EE;
  message: string | null;
}

const E2EE_INITIAL: EtatE2EE = {
  configure: false,
  deverrouille: false,
  statut: 'inactif',
  message: null,
};

interface EtatApp {
  pret: boolean;
  etape: string; // sonde de diagnostic affichée pendant le chargement
  profil: Profil | null;
  aujourdhui: string;
  semaineCourante: number;
  journal: EntreeJournal[];
  seances: SeanceRealisee[];
  mesures: MesureCorporelle[];
  consommations: ConsommationJour[];
  statutsAliments: StatutAlimentManuel[];
  planifieesSemaine: SeancePlanifieeStockee[];
  adaptationDuJour: Adaptation | null;
  idAdaptationDuJour: string | null;
  scoreFormeDuJour: ScoreForme | null;
  baselineDuJour: Baseline | null;
  sync: EtatSyncUI;
  e2ee: EtatE2EE;

  /** `fabrique` injecte un `Depot` alternatif (tests, web) ; défaut = SQLite local. */
  initialiser: (fabrique?: () => Promise<Depot>) => Promise<void>;
  /** Connexion au compte cloud (mobile) : active la synchronisation et lance un 1er rapprochement. */
  connecterSync: (identifiants: Identifiants) => Promise<void>;
  deconnecterSync: () => Promise<void>;
  /** Pousse les modifications locales et applique les distantes (LWW). `forcer` lève le garde-fou §6.2. */
  synchroniserMaintenant: (forcer?: boolean) => Promise<void>;
  /** Renonce au premier rapprochement proposé (garde l'appareil local, sans fusion). */
  ignorerRapprochement: () => void;
  /** Active l'E2EE : définit la passphrase, dérive la clé et re-chiffre les données existantes. */
  activerE2EE: (passphrase: string) => Promise<void>;
  /** Déverrouille l'E2EE de cette session (saisie de la passphrase déjà définie). */
  deverrouillerE2EE: (passphrase: string) => Promise<void>;
  creerProfil: (
    p: Omit<
      Profil,
      'disclaimerAccepte' | 'dateAcceptationDisclaimer' | 'modePousse' | 'dateDebutPousse'
    >,
  ) => Promise<void>;
  saisirJournal: (e: EntreeJournal) => Promise<void>;
  validerSeance: (s: Omit<SeanceRealisee, 'id'>) => Promise<void>;
  enregistrerMesureCorporelle: (m: MesureCorporelle) => Promise<void>;
  saisirConsommation: (c: ConsommationJour) => Promise<void>;
  definirStatutAliment: (aliment: string, statut: StatutAliment | null) => Promise<void>;
  annulerAdaptation: () => Promise<void>;
  definirModePousse: (actif: boolean) => Promise<void>;
  exporterSauvegarde: (passphrase: string) => Promise<void>;
  importerSauvegarde: (contenuChiffre: string, passphrase: string) => Promise<void>;
  genererRapport: () => Promise<void>;
  santeConnectDisponible: () => Promise<boolean>;
  importerSeancesExternes: () => Promise<{ importees: number; dejaPresentes: number }>;
  seanceDuJour: () => SeanceDuJour | null;
  seanceLibre: (modeleId: string) => SeanceDuJour | null;
}

export const useMagasin = create<EtatApp>((set, get) => ({
  pret: false,
  etape: 'démarrage',
  profil: null,
  aujourdhui: aujourdhuiISO(),
  semaineCourante: 1,
  journal: [],
  seances: [],
  mesures: [],
  consommations: [],
  statutsAliments: [],
  planifieesSemaine: [],
  adaptationDuJour: null,
  idAdaptationDuJour: null,
  scoreFormeDuJour: null,
  baselineDuJour: null,
  sync: SYNC_INITIAL,
  e2ee: E2EE_INITIAL,

  async initialiser(fabrique = creerDepotParDefaut) {
    if (get().pret) return;
    if (initEnCours) return initEnCours;
    initEnCours = (async () => {
      // E2EE (Phase 3) : si une passphrase a été définie pour ce compte mais pas encore saisie
      // cette session, on s'arrête avant toute lecture (le contenu cloud est opaque) → la garde
      // de déverrouillage prend le relais. Sans réseau / sans compte, `detecterE2EE` répond 'absent'.
      const verrou = await detecterE2EE();
      useMagasin.setState((e) => ({
        e2ee: {
          ...e.e2ee,
          configure: verrou !== 'absent',
          deverrouille: verrou === 'deverrouille',
        },
      }));
      if (verrou === 'verrouille') {
        set({ etape: 'chiffrement verrouillé' });
        return;
      }
      set({ etape: 'ouverture base' });
      depot = await fabrique();
      set({ etape: 'seed programme' });
      await depot.seederProgramme();
      set({ etape: 'lecture profil' });
      const profil = await depot.lireProfil();
      const aujourdhui = aujourdhuiISO();
      set({ etape: 'recharge données' });
      await recharger(set, depot, profil, aujourdhui, { declencherSync: false });
      set({ pret: true, etape: 'prêt' });
      // Sync cloud : câblage non bloquant (n'empêche jamais l'app de démarrer hors-ligne).
      void demarrerSync();
    })();
    try {
      await initEnCours;
    } finally {
      // Libère la garde anti-double-init : permet une re-init après déverrouillage E2EE.
      initEnCours = null;
    }
  },

  async connecterSync(identifiants) {
    if (!syncLocal) return; // sync indisponible (web / Supabase non configuré)
    set({ sync: { ...get().sync, statut: 'enCours', message: null } });
    try {
      const session = await seConnecter(identifiants);
      transport = creerTransportSupabase(obtenirSupabase(), session.user.id, creerCodecCoffre());
      set({ sync: { ...get().sync, connecte: true, email: session.user.email ?? null } });
      // E2EE : si ce compte est chiffré et pas encore déverrouillé, on diffère la 1re synchro
      // (impossible de pousser en clair) — l'utilisateur saisit sa passphrase dans la carte E2EE.
      const verrou = await detecterE2EE();
      set((e) => ({
        e2ee: {
          ...e.e2ee,
          configure: verrou !== 'absent',
          deverrouille: verrou === 'deverrouille',
        },
      }));
      if (verrou === 'verrouille') {
        set({ sync: { ...get().sync, statut: 'inactif', message: null } });
        return;
      }
      await get().synchroniserMaintenant();
    } catch (e) {
      set({
        sync: {
          ...get().sync,
          statut: 'erreur',
          message: e instanceof Error ? e.message : 'Connexion impossible.',
        },
      });
    }
  },

  async deconnecterSync() {
    await seDeconnecter().catch(() => {});
    transport = null;
    effacerCoffreE2EE(); // oublie la clé en mémoire (E2EE re-verrouillé)
    if (timerSync) {
      clearTimeout(timerSync);
      timerSync = null;
    }
    set({
      sync: { ...get().sync, connecte: false, email: null, statut: 'inactif', message: null },
      e2ee: E2EE_INITIAL,
    });
  },

  async synchroniserMaintenant(forcer = false) {
    if (!syncLocal || !transport || !depot) return;
    // E2EE verrouillé : pousser/lire est impossible (on ne veut surtout pas pousser en clair).
    if (e2eeConfigure() && !e2eeDeverrouille()) {
      set({
        sync: {
          ...get().sync,
          statut: 'erreur',
          message: 'Chiffrement verrouillé : saisis ta phrase de chiffrement (Réglages).',
        },
      });
      return;
    }
    set({ sync: { ...get().sync, statut: 'enCours', message: null } });
    try {
      const res = await synchroniser(syncLocal, transport, syncLocal, { forcer });
      if (res.statut === 'confirmationRequise') {
        set({ sync: { ...get().sync, statut: 'confirmationRequise' } });
        return;
      }
      // Des enregistrements distants ont été appliqués → relire l'état dérivé (sans relancer la sync).
      if (res.appliques > 0) {
        const profil = await depot.lireProfil();
        await recharger(set, depot, profil, get().aujourdhui, { declencherSync: false });
      }
      set({
        sync: { ...get().sync, statut: 'ok', derniere: new Date().toISOString(), message: null },
      });
    } catch (e) {
      set({
        sync: {
          ...get().sync,
          statut: 'erreur',
          message: e instanceof Error ? e.message : 'Synchronisation impossible.',
        },
      });
    }
  },

  ignorerRapprochement() {
    set({ sync: { ...get().sync, statut: 'inactif' } });
  },

  async activerE2EE(passphrase) {
    if (!supabaseConfigure) {
      set((e) => ({
        e2ee: { ...e.e2ee, statut: 'erreur', message: 'Synchronisation non configurée.' },
      }));
      return;
    }
    const session = await sessionActuelle();
    if (!session) {
      set((e) => ({
        e2ee: {
          ...e.e2ee,
          statut: 'erreur',
          message: 'Connecte-toi avant d’activer le chiffrement.',
        },
      }));
      return;
    }
    set((e) => ({ e2ee: { ...e.e2ee, statut: 'enCours', message: null } }));
    try {
      const client = obtenirSupabase();
      if (await lireMetaE2EE(client, session.user.id)) {
        throw new ErreurE2EE(
          'Le chiffrement est déjà activé sur ce compte. Utilise « Déverrouiller ».',
        );
      }
      const { meta, cle } = initialiserMeta(passphrase);
      definirConfigureE2EE(true);
      definirCleE2EE(cle);
      // Meta d'abord : un état mixte (clair + chiffré) reste lisible une fois déverrouillé, alors
      // que des données chiffrées SANS meta seraient irrécupérables. Puis migration de l'existant.
      await ecrireMetaE2EE(client, session.user.id, meta);
      await rechiffrerTout(client, session.user.id, creerCodecCoffre());
      set((e) => ({
        e2ee: { ...e.e2ee, configure: true, deverrouille: true, statut: 'inactif', message: null },
      }));
      await rafraichirApresE2EE();
    } catch (e) {
      set((s) => ({ e2ee: { ...s.e2ee, statut: 'erreur', message: messageE2EE(e) } }));
    }
  },

  async deverrouillerE2EE(passphrase) {
    const session = await sessionActuelle();
    if (!session) {
      set((e) => ({
        e2ee: { ...e.e2ee, statut: 'erreur', message: 'Connecte-toi avant de déverrouiller.' },
      }));
      return;
    }
    set((e) => ({ e2ee: { ...e.e2ee, statut: 'enCours', message: null } }));
    try {
      const meta = await lireMetaE2EE(obtenirSupabase(), session.user.id);
      if (!meta) throw new ErreurE2EE('Aucun chiffrement à déverrouiller sur ce compte.');
      const cle = ouvrirMeta(passphrase, meta); // lève si la passphrase est incorrecte (canari)
      definirConfigureE2EE(true);
      definirCleE2EE(cle);
      set((e) => ({
        e2ee: { ...e.e2ee, configure: true, deverrouille: true, statut: 'inactif', message: null },
      }));
      await rafraichirApresE2EE();
    } catch (e) {
      set((s) => ({ e2ee: { ...s.e2ee, statut: 'erreur', message: messageE2EE(e) } }));
    }
  },

  async creerProfil(p) {
    if (!depot) throw new Error('Dépôt non initialisé');
    const profil: Profil = {
      ...p,
      disclaimerAccepte: true,
      dateAcceptationDisclaimer: aujourdhuiISO(),
      modePousse: false,
    };
    await depot.enregistrerProfil(profil);
    await recharger(set, depot, profil, get().aujourdhui);
  },

  async saisirJournal(e) {
    if (!depot) throw new Error('Dépôt non initialisé');
    await depot.enregistrerJournal(e);
    await recharger(set, depot, get().profil, get().aujourdhui);
  },

  async validerSeance(s) {
    if (!depot) throw new Error('Dépôt non initialisé');
    const seance: SeanceRealisee = { ...s, id: Crypto.randomUUID() };
    await depot.enregistrerSeance(seance);
    await recharger(set, depot, get().profil, get().aujourdhui);
  },

  async enregistrerMesureCorporelle(m) {
    if (!depot) throw new Error('Dépôt non initialisé');
    await depot.enregistrerMesure(m);
    await recharger(set, depot, get().profil, get().aujourdhui);
  },

  async saisirConsommation(c) {
    if (!depot) throw new Error('Dépôt non initialisé');
    // Noms normalisés et dédoublonnés dès la persistance (« Café  » = « café »),
    // pour ne jamais diviser les effectifs des corrélations.
    const aliments = [...new Set(c.aliments.map(normaliserAliment).filter((a) => a !== ''))];
    await depot.enregistrerConsommation({ date: c.date, aliments });
    await recharger(set, depot, get().profil, get().aujourdhui);
  },

  async definirStatutAliment(aliment, statut) {
    if (!depot) throw new Error('Dépôt non initialisé');
    const nom = normaliserAliment(aliment);
    if (statut === null) {
      await depot.supprimerStatutAliment(nom);
    } else {
      await depot.definirStatutAliment({ aliment: nom, statut, dateMaj: get().aujourdhui });
    }
    await recharger(set, depot, get().profil, get().aujourdhui);
  },

  async annulerAdaptation() {
    if (!depot) return;
    const id = get().idAdaptationDuJour;
    if (id) await depot.annulerAdaptation(id);
    set({ adaptationDuJour: null, idAdaptationDuJour: null });
  },

  async definirModePousse(actif) {
    if (!depot) throw new Error('Dépôt non initialisé');
    const profil = get().profil;
    if (!profil) return;
    // Jamais d'application silencieuse : c'est l'utilisateur qui (dés)active.
    const maj: Profil = {
      ...profil,
      modePousse: actif,
      dateDebutPousse: actif ? get().aujourdhui : undefined,
    };
    await depot.enregistrerProfil(maj);
    await recharger(set, depot, maj, get().aujourdhui);
  },

  async exporterSauvegarde(passphrase) {
    if (!depot) throw new Error('Dépôt non initialisé');
    await exporterSauvegardeDb(depot, passphrase, get().aujourdhui);
  },

  async importerSauvegarde(contenuChiffre, passphrase) {
    if (!depot) throw new Error('Dépôt non initialisé');
    await importerSauvegardeDb(depot, contenuChiffre, passphrase);
    // La base a été remplacée : on relit le profil et on recharge tout l'état dérivé.
    const profil = await depot.lireProfil();
    await recharger(set, depot, profil, get().aujourdhui);
  },

  async genererRapport() {
    if (!depot) throw new Error('Dépôt non initialisé');
    const { aujourdhui, profil } = get();
    // Période par défaut : 90 derniers jours (un trimestre = horizon de consultation usuel).
    await genererRapportPdf(depot, profil, ajouterJours(aujourdhui, -90), aujourdhui);
  },

  async santeConnectDisponible() {
    return santeConnectDisponible();
  },

  async importerSeancesExternes() {
    if (!depot) throw new Error('Dépôt non initialisé');
    const { aujourdhui, profil } = get();
    const depuis = ajouterJours(aujourdhui, -FENETRE_IMPORT_SANTE_CONNECT_JOURS);
    const sessions = await lireSessionsExternes(depuis, aujourdhui);
    const dejaImportes = await depot.lireIdsExternes('sante_connect');
    const nouvelles = filtrerNouvellesSessions(sessions, dejaImportes);
    const fcMax = profil ? 220 - profil.age : undefined;
    for (const s of nouvelles) {
      await depot.enregistrerSeance({
        ...mapperSessionExterne(s, { fcMax }),
        id: Crypto.randomUUID(),
      });
    }
    await recharger(set, depot, profil, aujourdhui);
    return { importees: nouvelles.length, dejaPresentes: sessions.length - nouvelles.length };
  },

  seanceDuJour() {
    const { profil, planifieesSemaine, aujourdhui, adaptationDuJour } = get();
    if (!profil) return null;
    const jour = jourDeLaSemaine(aujourdhui);
    const planifiee = planifieesSemaine.find((s) => s.jour === jour);
    if (!planifiee) return null;
    const niveau = adaptationDuJour?.niveauSeance ?? 'normale';
    // Repos proposé : aucune séance imposée (la bannière d'adaptation explique pourquoi).
    if (niveau === 'repos') return null;
    const allegee = niveau === 'allegee';
    return {
      planifiee,
      // Modérée garde le modèle prévu (volume réduit côté séance) ; allégée bascule sur le modèle santé.
      modeleApplique: allegee ? MODELE_ALLEGE_ID : planifiee.modele,
      niveau,
      allegee,
    };
  },

  seanceLibre(modeleId) {
    const { profil, aujourdhui, semaineCourante, planifieesSemaine, adaptationDuJour } = get();
    const modele = obtenirModele(modeleId);
    if (!profil || !modele) return null;
    // Les garde-fous santé s'appliquent aussi hors plan : jour dégradé (repos ou
    // allégée) → bascule sur le modèle santé, quelle que soit la séance choisie.
    const niveauJour = adaptationDuJour?.niveauSeance ?? 'normale';
    const allegee = niveauJour === 'allegee' || niveauJour === 'repos';
    // Trame synthétique : la séance libre n'existe pas dans le plan stocké.
    const planifiee: SeancePlanifieeStockee = {
      id: `libre-${aujourdhui}-${modele.id}`,
      semaine: semaineCourante,
      phase: planifieesSemaine[0]?.phase ?? 'reprise',
      jour: jourDeLaSemaine(aujourdhui),
      type: modele.type,
      modele: modele.id,
      titre: modele.titre,
      estDecharge: false,
      estTestChrono: modele.id === 'test-3000',
    };
    return {
      planifiee,
      modeleApplique: allegee ? MODELE_ALLEGE_ID : modele.id,
      niveau: allegee ? 'allegee' : niveauJour,
      allegee,
    };
  },
}));

/** Recharge l'état dérivé depuis la base et recalcule l'adaptation du jour. */
async function recharger(
  set: (partiel: Partial<EtatApp>) => void,
  depot: Depot,
  profil: Profil | null,
  aujourdhui: string,
  options: { declencherSync?: boolean } = {},
): Promise<void> {
  const semaineCourante = profil ? numeroSemaine(profil.dateDebutProgramme, aujourdhui) : 1;

  // Fenêtre de lecture : 30 jours glissants suffisent au moteur (14 j) et aux graphes courts.
  const depuis = ajouterJours(aujourdhui, -120);
  const [journal, seances, mesures, consommations, statutsAliments, planifieesSemaine] =
    await Promise.all([
      depot.lireJournal(depuis),
      depot.lireSeances(depuis),
      depot.lireMesures(depuis),
      depot.lireConsommations(depuis),
      depot.lireStatutsAliments(),
      depot.lireSeancesPlanifieesSemaine(semaineCourante),
    ]);

  let adaptationDuJour: Adaptation | null = null;
  let idAdaptationDuJour: string | null = null;
  if (profil) {
    adaptationDuJour = evaluerAdaptation({
      date: aujourdhui,
      journal,
      seances,
      modePousse: profil.modePousse,
    });
    if (adaptationDuJour.type !== 'aucune') {
      idAdaptationDuJour = `${aujourdhui}-${adaptationDuJour.type}`;
      await depot.enregistrerAdaptation(adaptationDuJour, idAdaptationDuJour, aujourdhui);
    }
  }

  // État dérivé de personnalisation (recalculé à la volée, jamais stocké).
  const baselineDuJour = calculerBaseline(journal, aujourdhui);
  const entreeAuj = journal.find((e) => e.date === aujourdhui);
  const scoreFormeDuJour = entreeAuj
    ? calculerScoreForme({
        entree: entreeAuj,
        baseline: baselineDuJour,
        acwr: acwr(seances, aujourdhui),
      })
    : null;

  set({
    profil,
    semaineCourante,
    journal,
    seances,
    mesures,
    consommations,
    statutsAliments,
    planifieesSemaine,
    adaptationDuJour,
    idAdaptationDuJour,
    scoreFormeDuJour,
    baselineDuJour,
    aujourdhui,
  });

  // Reprogrammation des rappels locaux : fire-and-forget, ne doit jamais
  // retarder le passage à `pret: true` ni l'UI (permission éventuelle).
  if (profil) {
    void synchroniserNotifications(aujourdhui, journal, mesures);
  }

  // Toute écriture marque des lignes `dirty` → planifier un push différé (no-op si non connecté).
  // L'appelant peut désactiver le déclencheur (recharge consécutive à un pull, pour éviter une boucle).
  if (options.declencherSync !== false) planifierSync();
}

/** Câble la sync au démarrage (mobile + Supabase configuré) et reprend une session restaurée. */
async function demarrerSync(): Promise<void> {
  if (!supabaseConfigure) return; // mode 100 % local (défaut)
  syncLocal = await creerSyncLocal(); // null sur web (online-first)
  if (!syncLocal) return;
  useMagasin.setState((e) => ({ sync: { ...e.sync, disponible: true } }));
  const session = await sessionActuelle();
  if (!session) return; // sync disponible mais pas encore connecté
  transport = creerTransportSupabase(obtenirSupabase(), session.user.id, creerCodecCoffre());
  const verrou = await detecterE2EE();
  useMagasin.setState((e) => ({
    sync: { ...e.sync, connecte: true, email: session.user.email ?? null },
    e2ee: {
      ...e.e2ee,
      configure: verrou !== 'absent',
      deverrouille: verrou === 'deverrouille',
    },
  }));
  // E2EE verrouillé : on attend le déverrouillage (la garde de synchroniserMaintenant l'impose).
  if (verrou === 'verrouille') return;
  await useMagasin.getState().synchroniserMaintenant();
}

/** Résultat de la détection E2EE pour un compte connecté. */
type DetectionE2EE = 'absent' | 'verrouille' | 'deverrouille';

/**
 * Inspecte l'état E2EE du compte : présence d'une meta côté cloud (= activé) et clé en mémoire
 * (= déverrouillé). Sans réseau, sans Supabase ou sans session, répond 'absent' (mode local).
 */
async function detecterE2EE(): Promise<DetectionE2EE> {
  if (!supabaseConfigure) return 'absent';
  const session = await sessionActuelle();
  if (!session) return 'absent';
  const meta = await lireMetaE2EE(obtenirSupabase(), session.user.id);
  if (!meta) {
    definirConfigureE2EE(false);
    return 'absent';
  }
  definirConfigureE2EE(true);
  return e2eeDeverrouille() ? 'deverrouille' : 'verrouille';
}

/** Après activation/déverrouillage : (re)charge les données déchiffrables puis relance la sync. */
async function rafraichirApresE2EE(): Promise<void> {
  // Web : l'init s'était arrêtée au verrou → relancer l'init complète maintenant déverrouillée.
  if (!useMagasin.getState().pret) {
    await useMagasin.getState().initialiser();
    return;
  }
  if (depot) {
    const profil = await depot.lireProfil();
    await recharger(useMagasin.setState, depot, profil, useMagasin.getState().aujourdhui, {
      declencherSync: false,
    });
  }
  await useMagasin
    .getState()
    .synchroniserMaintenant()
    .catch(() => {});
}

/** Message d'erreur affichable (ErreurE2EE porte déjà un message rédigé). */
function messageE2EE(e: unknown): string {
  return e instanceof Error ? e.message : 'Opération de chiffrement impossible.';
}

/** Push différé (debounce) : coalesce une rafale d'écritures en une seule passe de sync. */
function planifierSync(): void {
  if (!syncLocal || !transport) return;
  if (timerSync) clearTimeout(timerSync);
  timerSync = setTimeout(() => {
    timerSync = null;
    void useMagasin.getState().synchroniserMaintenant();
  }, DELAI_SYNC_MS);
}

/** Libellé lisible d'un modèle (pour l'UI). */
export function titreModele(id: string): string {
  return obtenirModele(id)?.titre ?? id;
}
