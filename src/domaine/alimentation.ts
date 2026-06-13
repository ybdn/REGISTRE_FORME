import { FENETRE_CORRELATION_JOURS, MIN_ENTREES_CORRELATION } from './constantes';
import { type Correlation, analysePossible, analyserExpositions } from './correlations';
import type {
  ConsommationJour,
  DateISO,
  EntreeJournal,
  StatutAliment,
  StatutAlimentManuel,
} from './types';

// ─────────────────────────────────────────────────────────────────────────────
// SUIVI ALIMENTAIRE — quels aliments « passent » ou pas
//
// Saisie express : chips d'aliments/boissons consommés sur la journée (pas de
// repas structurés, les boissons sont des aliments comme les autres). Deux
// sources de classement, toujours explicables :
//
//   1. AUTO   — corrélation aliment ↔ poussée 48 h (même mécanique transparente
//               que les tags du journal, cf. correlations.ts) → verdict `suspect`
//               au plus : on n'affirme JAMAIS une causalité automatiquement.
//   2. MANUEL — statut posé par l'utilisateur (toléré / à éviter / à tester),
//               daté, qui PRIME sur l'auto à l'affichage ; la corrélation reste
//               exposée en complément (transparence).
//
// L'alimentation n'entre PAS dans le moteur d'adaptation : affichage croisé
// seulement. Pur, recalculé à la volée, rien de dérivé n'est stocké.
// ─────────────────────────────────────────────────────────────────────────────

/** Verdict affiché pour un aliment : statut manuel, sinon auto (`suspect`/`neutre`). */
export type VerdictAliment = StatutAliment | 'suspect' | 'neutre';

/** Classement complet d'un aliment, sourcé et prêt à afficher. */
export interface ClassementAliment {
  aliment: string;
  verdict: VerdictAliment;
  /** D'où vient le verdict : statut posé par l'utilisateur, corrélation auto, ou rien. */
  source: 'manuel' | 'auto' | 'aucun';
  /** Phrase explicable affichée telle quelle (jamais de causalité affirmée). */
  raison: string;
  /** Détail auto, toujours exposé même quand le statut manuel prime (transparence). */
  correlation: Correlation | null;
  statutManuel: StatutAliment | null;
  nbJoursConsomme: number;
  derniereConsommation: DateISO | null;
}

/** Libellés humains des statuts manuels (affichage et raisons). */
export const LIBELLES_STATUT: Record<StatutAliment, string> = {
  tolere: 'toléré',
  'a-eviter': 'à éviter',
  'a-tester': 'à tester',
};

/**
 * Normalise un nom d'aliment saisi librement : minuscules, espaces superflus
 * réduits. Sans cela, « Café » et « café  » divisent les effectifs et
 * n'atteignent jamais le seuil de 5 occurrences.
 */
export function normaliserAliment(brut: string): string {
  return brut.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Consommations aux noms normalisés et dédoublonnés (défensif : l'écran normalise déjà). */
function normaliserConsommations(consommations: ConsommationJour[]): ConsommationJour[] {
  return consommations.map((c) => ({
    date: c.date,
    aliments: [...new Set(c.aliments.map(normaliserAliment).filter((a) => a !== ''))],
  }));
}

/**
 * Aliments ordonnés par récence de consommation : les plus récemment cochés
 * d'abord, puis les suggestions par défaut restantes (même logique que
 * `tagsParRecence` du journal express).
 */
export function alimentsParRecence(
  consommations: ConsommationJour[],
  alimentsDefaut: string[],
): string[] {
  const ordonnes: string[] = [];
  const vus = new Set<string>();
  const parDateDesc = [...normaliserConsommations(consommations)].sort((a, b) =>
    b.date.localeCompare(a.date),
  );
  for (const conso of parDateDesc) {
    for (const aliment of conso.aliments) {
      if (!vus.has(aliment)) {
        vus.add(aliment);
        ordonnes.push(aliment);
      }
    }
  }
  for (const aliment of alimentsDefaut.map(normaliserAliment)) {
    if (aliment !== '' && !vus.has(aliment)) {
      vus.add(aliment);
      ordonnes.push(aliment);
    }
  }
  return ordonnes;
}

/**
 * Corrélations aliment ↔ poussée de douleur 48 h, sur les 90 derniers jours.
 * Les poussées et les garde-fous (≥ 30 entrées, baseline) viennent du JOURNAL ;
 * un jour de consommation sans entrée journal les 2 jours suivants n'est pas
 * évaluable. Renvoie `[]` en démarrage à froid.
 */
export function analyserAliments(
  journal: EntreeJournal[],
  consommations: ConsommationJour[],
  date: DateISO,
): Correlation[] {
  return analyserExpositions(
    journal,
    normaliserConsommations(consommations).map((c) => ({ date: c.date, etiquettes: c.aliments })),
    date,
    (aliment, nbAvecPoussee, occurrences, pctAvec, pctSans) =>
      `Sur ${FENETRE_CORRELATION_JOURS} jours, les journées avec « ${aliment} » sont suivies ` +
      `d'une poussée de douleur dans ${nbAvecPoussee} cas sur ${occurrences} (${pctAvec} %), ` +
      `contre ${pctSans} % sans cet aliment.`,
  );
}

/** Ordre d'affichage : les verdicts qui demandent attention d'abord. */
const PRIORITE_VERDICT: Record<VerdictAliment, number> = {
  'a-eviter': 0,
  suspect: 1,
  'a-tester': 2,
  tolere: 3,
  neutre: 4,
};

/**
 * Classe tous les aliments connus (consommés ou porteurs d'un statut manuel).
 * Le statut manuel PRIME sur le verdict auto ; la corrélation reste exposée.
 * Tri : à éviter / suspects d'abord, puis par récence de consommation.
 */
export function classerAliments(
  consommations: ConsommationJour[],
  statuts: StatutAlimentManuel[],
  journal: EntreeJournal[],
  date: DateISO,
): ClassementAliment[] {
  const consos = normaliserConsommations(consommations);
  const correlations = new Map(analyserAliments(journal, consos, date).map((c) => [c.tag, c]));
  // « Aucun signal » ne se dit que si l'analyse a vraiment tourné ; en démarrage
  // à froid on l'annonce, plutôt que de rassurer à tort.
  const analyseActive = analysePossible(journal, date);

  const statutsParAliment = new Map<string, StatutAlimentManuel>();
  for (const s of statuts) {
    const nom = normaliserAliment(s.aliment);
    if (nom !== '') statutsParAliment.set(nom, s);
  }

  // Effectifs de consommation par aliment (tous jours confondus, pas que la fenêtre).
  const nbJours = new Map<string, number>();
  const derniere = new Map<string, DateISO>();
  for (const conso of consos) {
    for (const aliment of conso.aliments) {
      nbJours.set(aliment, (nbJours.get(aliment) ?? 0) + 1);
      const d = derniere.get(aliment);
      if (d === undefined || conso.date > d) derniere.set(aliment, conso.date);
    }
  }

  const tous = new Set<string>([...nbJours.keys(), ...statutsParAliment.keys()]);

  const classements: ClassementAliment[] = [];
  for (const aliment of tous) {
    const statut = statutsParAliment.get(aliment) ?? null;
    const correlation = correlations.get(aliment) ?? null;
    const consomme = nbJours.get(aliment) ?? 0;

    let verdict: VerdictAliment;
    let source: ClassementAliment['source'];
    let raison: string;
    if (statut !== null) {
      verdict = statut.statut;
      source = 'manuel';
      raison = `Marqué « ${LIBELLES_STATUT[statut.statut]} » par toi le ${statut.dateMaj}.`;
    } else if (correlation !== null) {
      verdict = 'suspect';
      source = 'auto';
      raison = correlation.libelle;
    } else {
      verdict = 'neutre';
      source = 'aucun';
      raison = analyseActive
        ? `Aucun signal : consommé ${consomme} jour${consomme > 1 ? 's' : ''} sans corrélation détectée.`
        : `Pas encore d'analyse : il faut au moins ${MIN_ENTREES_CORRELATION} jours de journal récents.`;
    }

    classements.push({
      aliment,
      verdict,
      source,
      raison,
      correlation,
      statutManuel: statut?.statut ?? null,
      nbJoursConsomme: consomme,
      derniereConsommation: derniere.get(aliment) ?? null,
    });
  }

  return classements.sort(
    (a, b) =>
      PRIORITE_VERDICT[a.verdict] - PRIORITE_VERDICT[b.verdict] ||
      (b.derniereConsommation ?? '').localeCompare(a.derniereConsommation ?? '') ||
      a.aliment.localeCompare(b.aliment),
  );
}

/** Compte des aliments classés par verdict, pour la bannière de synthèse. */
export interface SyntheseAliments {
  aEviter: number;
  suspects: number;
  aTester: number;
  toleres: number;
  neutres: number;
}

/** Résume un classement en comptant les aliments par verdict (lecture immédiate). */
export function resumerClassements(classements: ClassementAliment[]): SyntheseAliments {
  const synthese: SyntheseAliments = {
    aEviter: 0,
    suspects: 0,
    aTester: 0,
    toleres: 0,
    neutres: 0,
  };
  for (const c of classements) {
    switch (c.verdict) {
      case 'a-eviter':
        synthese.aEviter++;
        break;
      case 'suspect':
        synthese.suspects++;
        break;
      case 'a-tester':
        synthese.aTester++;
        break;
      case 'tolere':
        synthese.toleres++;
        break;
      case 'neutre':
        synthese.neutres++;
        break;
    }
  }
  return synthese;
}
