import { genererProgramme } from '@/domaine/generateurSemaines';
import type { LigneSauvegarde } from '@/domaine/sauvegarde';
import type {
  Adaptation,
  ConsommationJour,
  EntreeJournal,
  SeanceRealisee,
  SourceSeance,
  StatutAlimentManuel,
} from '@/domaine/types';
import type { Depot } from './depot';
import type { MesureCorporelle, SeancePlanifieeStockee } from './depots';
import type { Profil } from './profil';

// Implémentation en mémoire (RAM) de l'interface `Depot`, pour tester le store et la
// couche données sans émulateur ni SQLite (docs/07 §10.2). Aucune persistance, aucun réseau.

interface AdaptationStockee extends Adaptation {
  id: string;
  dateCreation: string;
  annulee: boolean;
}

function dansFenetre(date: string, depuis?: string): boolean {
  return depuis === undefined || date >= depuis;
}

export function creerDepotMemoire(): Depot {
  let profil: Profil | null = null;
  const journal = new Map<string, EntreeJournal>();
  const seances = new Map<string, SeanceRealisee>();
  const mesures = new Map<string, MesureCorporelle>();
  const consommations = new Map<string, ConsommationJour>();
  const statutsAliments = new Map<string, StatutAlimentManuel>();
  const adaptations = new Map<string, AdaptationStockee>();
  const planifiees: SeancePlanifieeStockee[] = [];

  const triParDate = <T extends { date: string }>(m: Map<string, T>, depuis?: string): T[] =>
    [...m.values()]
      .filter((x) => dansFenetre(x.date, depuis))
      .sort((a, b) => a.date.localeCompare(b.date));

  return {
    async programmeDejaSeede() {
      return planifiees.length > 0;
    },
    async seederProgramme() {
      if (planifiees.length > 0) return;
      const programme = genererProgramme();
      for (const semaine of programme) {
        for (const [index, s] of semaine.seances.entries()) {
          planifiees.push({
            id: `S${semaine.numero}-${index}`,
            semaine: semaine.numero,
            phase: semaine.phase,
            jour: s.jour,
            type: s.type,
            modele: s.modele,
            titre: s.titre,
            estDecharge: semaine.estDecharge,
            estTestChrono: semaine.estTestChrono,
          });
        }
      }
    },

    async lireProfil() {
      return profil;
    },
    async enregistrerProfil(p) {
      profil = p;
    },

    async lireJournal(depuis) {
      return triParDate(journal, depuis);
    },
    async enregistrerJournal(e) {
      journal.set(e.date, e);
    },

    async lireSeances(depuis) {
      return triParDate(seances, depuis);
    },
    async enregistrerSeance(s) {
      seances.set(s.id, s);
    },
    async lireIdsExternes(source: SourceSeance) {
      return [...seances.values()]
        .filter((s) => s.source === source && s.idExterne)
        .map((s) => s.idExterne as string);
    },

    async lireMesures(depuis) {
      return triParDate(mesures, depuis);
    },
    async enregistrerMesure(m) {
      mesures.set(m.date, m);
    },

    async lireConsommations(depuis) {
      return triParDate(consommations, depuis);
    },
    async enregistrerConsommation(c) {
      consommations.set(c.date, c);
    },
    async lireStatutsAliments() {
      return [...statutsAliments.values()].sort((a, b) => a.aliment.localeCompare(b.aliment));
    },
    async definirStatutAliment(s) {
      statutsAliments.set(s.aliment, s);
    },
    async supprimerStatutAliment(aliment) {
      statutsAliments.delete(aliment);
    },

    async lireSeancesPlanifieesSemaine(semaine) {
      return planifiees.filter((s) => s.semaine === semaine).sort((a, b) => a.jour - b.jour);
    },

    async enregistrerAdaptation(a, id, dateCreation) {
      adaptations.set(id, { ...a, id, dateCreation, annulee: false });
    },
    async annulerAdaptation(id) {
      const a = adaptations.get(id);
      if (a) a.annulee = true;
    },
    async lireAdaptationsAppliquees(depuis) {
      return [...adaptations.values()]
        .filter((a) => !a.annulee && a.type !== 'aucune' && a.date >= depuis)
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((a) => ({ date: a.date, raison: a.raison }));
    },

    async instantanerToutesLesTables() {
      // Non requis par les tests du store ; un dump minimal suffit à honorer le contrat.
      const tables: Record<string, LigneSauvegarde[]> = {};
      return tables;
    },
    async remplacerToutesLesTables() {
      // No-op : la sauvegarde fichier n'est pas exercée par le dépôt mémoire.
    },
  };
}
