import {
  type Adaptation,
  type EntreeJournal,
  MODELE_ALLEGE_ID,
  type SeanceRealisee,
  ajouterJours,
  aujourdhuiISO,
  evaluerAdaptation,
  jourDeLaSemaine,
  numeroSemaine,
  obtenirModele,
} from '@/domaine';
import { ouvrirBase } from '@/donnees/db';
import {
  type MesureCorporelle,
  type SeancePlanifieeStockee,
  annulerAdaptation as annulerAdaptationDb,
  enregistrerAdaptation,
  enregistrerJournal,
  enregistrerMesure,
  enregistrerSeance,
  lireJournal,
  lireMesures,
  lireSeances,
  lireSeancesPlanifieesSemaine,
} from '@/donnees/depots';
import { synchroniserNotifications } from '@/donnees/notifications';
import { type Profil, enregistrerProfil, lireProfil } from '@/donnees/profil';
import { genererRapportPdf } from '@/donnees/rapportPdf';
import {
  exporterSauvegarde as exporterSauvegardeDb,
  importerSauvegarde as importerSauvegardeDb,
} from '@/donnees/sauvegarde';
import { seederProgramme } from '@/donnees/seed';
import * as Crypto from 'expo-crypto';
import type * as SQLite from 'expo-sqlite';
import { create } from 'zustand';

// Store applicatif unique (KISS). La base SQLite est gardée hors de l'état (non sérialisable).

let db: SQLite.SQLiteDatabase | null = null;
// Garde anti-double-initialisation (StrictMode monte les effets deux fois en dev).
let initEnCours: Promise<void> | null = null;

/** Séance du jour effective = trame planifiée, basculée en allégée si le moteur l'a décidé. */
export interface SeanceDuJour {
  planifiee: SeancePlanifieeStockee;
  modeleApplique: string;
  allegee: boolean;
}

interface EtatApp {
  pret: boolean;
  etape: string; // sonde de diagnostic affichée pendant le chargement
  profil: Profil | null;
  aujourdhui: string;
  semaineCourante: number;
  journal: EntreeJournal[];
  seances: SeanceRealisee[];
  mesures: MesureCorporelle[];
  planifieesSemaine: SeancePlanifieeStockee[];
  adaptationDuJour: Adaptation | null;
  idAdaptationDuJour: string | null;

  initialiser: () => Promise<void>;
  creerProfil: (
    p: Omit<Profil, 'disclaimerAccepte' | 'dateAcceptationDisclaimer'>,
  ) => Promise<void>;
  saisirJournal: (e: EntreeJournal) => Promise<void>;
  validerSeance: (s: Omit<SeanceRealisee, 'id'>) => Promise<void>;
  enregistrerMesureCorporelle: (m: MesureCorporelle) => Promise<void>;
  annulerAdaptation: () => Promise<void>;
  exporterSauvegarde: (passphrase: string) => Promise<void>;
  importerSauvegarde: (contenuChiffre: string, passphrase: string) => Promise<void>;
  genererRapport: () => Promise<void>;
  seanceDuJour: () => SeanceDuJour | null;
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
  planifieesSemaine: [],
  adaptationDuJour: null,
  idAdaptationDuJour: null,

  async initialiser() {
    if (get().pret) return;
    if (initEnCours) return initEnCours;
    initEnCours = (async () => {
      set({ etape: 'ouverture base' });
      db = await ouvrirBase();
      set({ etape: 'seed programme' });
      await seederProgramme(db);
      set({ etape: 'lecture profil' });
      const profil = await lireProfil(db);
      const aujourdhui = aujourdhuiISO();
      set({ etape: 'recharge données' });
      await recharger(set, db, profil, aujourdhui);
      set({ pret: true, etape: 'prêt' });
    })();
    return initEnCours;
  },

  async creerProfil(p) {
    if (!db) throw new Error('Base non initialisée');
    const profil: Profil = {
      ...p,
      disclaimerAccepte: true,
      dateAcceptationDisclaimer: aujourdhuiISO(),
    };
    await enregistrerProfil(db, profil);
    await recharger(set, db, profil, get().aujourdhui);
  },

  async saisirJournal(e) {
    if (!db) throw new Error('Base non initialisée');
    await enregistrerJournal(db, e);
    await recharger(set, db, get().profil, get().aujourdhui);
  },

  async validerSeance(s) {
    if (!db) throw new Error('Base non initialisée');
    const seance: SeanceRealisee = { ...s, id: Crypto.randomUUID() };
    await enregistrerSeance(db, seance);
    await recharger(set, db, get().profil, get().aujourdhui);
  },

  async enregistrerMesureCorporelle(m) {
    if (!db) throw new Error('Base non initialisée');
    await enregistrerMesure(db, m);
    await recharger(set, db, get().profil, get().aujourdhui);
  },

  async annulerAdaptation() {
    if (!db) return;
    const id = get().idAdaptationDuJour;
    if (id) await annulerAdaptationDb(db, id);
    set({ adaptationDuJour: null, idAdaptationDuJour: null });
  },

  async exporterSauvegarde(passphrase) {
    if (!db) throw new Error('Base non initialisée');
    await exporterSauvegardeDb(db, passphrase, get().aujourdhui);
  },

  async importerSauvegarde(contenuChiffre, passphrase) {
    if (!db) throw new Error('Base non initialisée');
    await importerSauvegardeDb(db, contenuChiffre, passphrase);
    // La base a été remplacée : on relit le profil et on recharge tout l'état dérivé.
    const profil = await lireProfil(db);
    await recharger(set, db, profil, get().aujourdhui);
  },

  async genererRapport() {
    if (!db) throw new Error('Base non initialisée');
    const { aujourdhui, profil } = get();
    // Période par défaut : 90 derniers jours (un trimestre = horizon de consultation usuel).
    await genererRapportPdf(db, profil, ajouterJours(aujourdhui, -90), aujourdhui);
  },

  seanceDuJour() {
    const { profil, planifieesSemaine, aujourdhui, adaptationDuJour } = get();
    if (!profil) return null;
    const jour = jourDeLaSemaine(aujourdhui);
    const planifiee = planifieesSemaine.find((s) => s.jour === jour);
    if (!planifiee) return null;
    const allegee = adaptationDuJour?.type === 'allegement_jour';
    return {
      planifiee,
      modeleApplique: allegee ? MODELE_ALLEGE_ID : planifiee.modele,
      allegee,
    };
  },
}));

/** Recharge l'état dérivé depuis la base et recalcule l'adaptation du jour. */
async function recharger(
  set: (partiel: Partial<EtatApp>) => void,
  base: SQLite.SQLiteDatabase,
  profil: Profil | null,
  aujourdhui: string,
): Promise<void> {
  const semaineCourante = profil ? numeroSemaine(profil.dateDebutProgramme, aujourdhui) : 1;

  // Fenêtre de lecture : 30 jours glissants suffisent au moteur (14 j) et aux graphes courts.
  const depuis = ajouterJours(aujourdhui, -120);
  const [journal, seances, mesures, planifieesSemaine] = await Promise.all([
    lireJournal(base, depuis),
    lireSeances(base, depuis),
    lireMesures(base, depuis),
    lireSeancesPlanifieesSemaine(base, semaineCourante),
  ]);

  let adaptationDuJour: Adaptation | null = null;
  let idAdaptationDuJour: string | null = null;
  if (profil) {
    adaptationDuJour = evaluerAdaptation({ date: aujourdhui, journal, seances });
    if (adaptationDuJour.type !== 'aucune') {
      idAdaptationDuJour = `${aujourdhui}-${adaptationDuJour.type}`;
      await enregistrerAdaptation(base, adaptationDuJour, idAdaptationDuJour, aujourdhui);
    }
  }

  set({
    profil,
    semaineCourante,
    journal,
    seances,
    mesures,
    planifieesSemaine,
    adaptationDuJour,
    idAdaptationDuJour,
    aujourdhui,
  });

  // Reprogrammation des rappels locaux : fire-and-forget, ne doit jamais
  // retarder le passage à `pret: true` ni l'UI (permission éventuelle).
  if (profil) {
    void synchroniserNotifications(aujourdhui, journal, mesures);
  }
}

/** Libellé lisible d'un modèle (pour l'UI). */
export function titreModele(id: string): string {
  return obtenirModele(id)?.titre ?? id;
}
