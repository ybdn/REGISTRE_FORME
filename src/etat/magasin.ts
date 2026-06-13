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
import { ouvrirBase } from '@/donnees/db';
import {
  type MesureCorporelle,
  type SeancePlanifieeStockee,
  annulerAdaptation as annulerAdaptationDb,
  definirStatutAliment as definirStatutAlimentDb,
  enregistrerAdaptation,
  enregistrerConsommation,
  enregistrerJournal,
  enregistrerMesure,
  enregistrerSeance,
  lireConsommations,
  lireIdsExternes,
  lireJournal,
  lireMesures,
  lireSeances,
  lireSeancesPlanifieesSemaine,
  lireStatutsAliments,
  supprimerStatutAliment,
} from '@/donnees/depots';
import { synchroniserNotifications } from '@/donnees/notifications';
import { type Profil, enregistrerProfil, lireProfil } from '@/donnees/profil';
import { genererRapportPdf } from '@/donnees/rapportPdf';
import { lireSessionsExternes, santeConnectDisponible } from '@/donnees/santeConnect';
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

/** Séance du jour effective = trame planifiée, graduée selon le niveau décidé par le moteur. */
export interface SeanceDuJour {
  planifiee: SeancePlanifieeStockee;
  modeleApplique: string;
  /** Niveau gradué appliqué (normale / moderee / allegee). Le repos renvoie `null` côté store. */
  niveau: VarianteSeance;
  /** Compat UI historique : vrai si le niveau est « allégée ». */
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
  consommations: ConsommationJour[];
  statutsAliments: StatutAlimentManuel[];
  planifieesSemaine: SeancePlanifieeStockee[];
  adaptationDuJour: Adaptation | null;
  idAdaptationDuJour: string | null;
  scoreFormeDuJour: ScoreForme | null;
  baselineDuJour: Baseline | null;

  initialiser: () => Promise<void>;
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
      modePousse: false,
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

  async saisirConsommation(c) {
    if (!db) throw new Error('Base non initialisée');
    // Noms normalisés et dédoublonnés dès la persistance (« Café  » = « café »),
    // pour ne jamais diviser les effectifs des corrélations.
    const aliments = [...new Set(c.aliments.map(normaliserAliment).filter((a) => a !== ''))];
    await enregistrerConsommation(db, { date: c.date, aliments });
    await recharger(set, db, get().profil, get().aujourdhui);
  },

  async definirStatutAliment(aliment, statut) {
    if (!db) throw new Error('Base non initialisée');
    const nom = normaliserAliment(aliment);
    if (statut === null) {
      await supprimerStatutAliment(db, nom);
    } else {
      await definirStatutAlimentDb(db, { aliment: nom, statut, dateMaj: get().aujourdhui });
    }
    await recharger(set, db, get().profil, get().aujourdhui);
  },

  async annulerAdaptation() {
    if (!db) return;
    const id = get().idAdaptationDuJour;
    if (id) await annulerAdaptationDb(db, id);
    set({ adaptationDuJour: null, idAdaptationDuJour: null });
  },

  async definirModePousse(actif) {
    if (!db) throw new Error('Base non initialisée');
    const profil = get().profil;
    if (!profil) return;
    // Jamais d'application silencieuse : c'est l'utilisateur qui (dés)active.
    const maj: Profil = {
      ...profil,
      modePousse: actif,
      dateDebutPousse: actif ? get().aujourdhui : undefined,
    };
    await enregistrerProfil(db, maj);
    await recharger(set, db, maj, get().aujourdhui);
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

  async santeConnectDisponible() {
    return santeConnectDisponible();
  },

  async importerSeancesExternes() {
    if (!db) throw new Error('Base non initialisée');
    const { aujourdhui, profil } = get();
    const depuis = ajouterJours(aujourdhui, -FENETRE_IMPORT_SANTE_CONNECT_JOURS);
    const sessions = await lireSessionsExternes(depuis, aujourdhui);
    const dejaImportes = await lireIdsExternes(db, 'sante_connect');
    const nouvelles = filtrerNouvellesSessions(sessions, dejaImportes);
    const fcMax = profil ? 220 - profil.age : undefined;
    for (const s of nouvelles) {
      await enregistrerSeance(db, {
        ...mapperSessionExterne(s, { fcMax }),
        id: Crypto.randomUUID(),
      });
    }
    await recharger(set, db, profil, aujourdhui);
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
  base: SQLite.SQLiteDatabase,
  profil: Profil | null,
  aujourdhui: string,
): Promise<void> {
  const semaineCourante = profil ? numeroSemaine(profil.dateDebutProgramme, aujourdhui) : 1;

  // Fenêtre de lecture : 30 jours glissants suffisent au moteur (14 j) et aux graphes courts.
  const depuis = ajouterJours(aujourdhui, -120);
  const [journal, seances, mesures, consommations, statutsAliments, planifieesSemaine] =
    await Promise.all([
      lireJournal(base, depuis),
      lireSeances(base, depuis),
      lireMesures(base, depuis),
      lireConsommations(base, depuis),
      lireStatutsAliments(base),
      lireSeancesPlanifieesSemaine(base, semaineCourante),
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
      await enregistrerAdaptation(base, adaptationDuJour, idAdaptationDuJour, aujourdhui);
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
}

/** Libellé lisible d'un modèle (pour l'UI). */
export function titreModele(id: string): string {
  return obtenirModele(id)?.titre ?? id;
}
