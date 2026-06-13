import { calculerBaseline } from './baseline';
import { acwr, chargeHebdomadaire, zoneACWR } from './chargeEntrainement';
import type { ZoneACWR } from './chargeEntrainement';
import {
  JOURS_DEGRADES_DECHARGE,
  SEUIL_SCORE_DEGRADE_BILAN,
  SEUIL_TENDANCE_DOULEUR,
} from './constantes';
import { correlationLaPlusSignificative } from './correlations';
import { ajouterJours, ecartJours } from './dates';
import { meilleurs1RM, recordsCourse } from './records';
import { calculerScoreForme } from './scoreForme';
import type { DateISO, EntreeJournal, SeanceRealisee } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// BILAN HEBDOMADAIRE — le rendez-vous du dimanche (cf. doc 03 §3.2)
//
// Une synthèse PURE de la semaine écoulée, assemblée à partir des modules existants
// (charge, score de forme, corrélations, records). Quatre volets + un seul insight
// (le plus significatif, pas une liste) + une décision lisible. C'est aussi la
// matière première d'une section du rapport gastro : un bilan = une section.
// ─────────────────────────────────────────────────────────────────────────────

/** Tendance d'une grandeur sur deux semaines successives. */
export type Tendance = 'hausse' | 'stable' | 'baisse';

/** Bilan d'une semaine se terminant à `finSemaine`. */
export interface BilanHebdo {
  finSemaine: DateISO;
  charge: {
    /** Charge sRPE totale de la semaine. */
    srpe: number;
    acwr: number | null;
    zone: ZoneACWR | null;
    /** Ratio sRPE de la semaine / moyenne des 4 semaines précédentes (null si pas d'historique). */
    vsMoyenne4Semaines: number | null;
  };
  sante: {
    /** Score de forme moyen de la semaine (null si aucune entrée). */
    scoreMoyen: number | null;
    /** Nombre de jours saisis dont le score est sous le seuil dégradé. */
    joursDegrades: number;
    /** Tendance de la douleur vs la semaine précédente (null si données insuffisantes). */
    tendanceDouleur: Tendance | null;
  };
  progression: {
    /** Libellés des records personnels établis cette semaine. */
    recordsBattus: string[];
  };
  /** L'insight le plus significatif de la semaine (corrélation ou charge), ou null. */
  insight: string | null;
  /** Décision pour la semaine suivante. */
  decision: 'tel_que_prevu' | 'ajustement_propose';
  libelleDecision: string;
}

/** Entrées du journal dans une fenêtre de 7 jours se terminant à `fin` (incluse). */
function entreesSemaine(journal: EntreeJournal[], fin: DateISO): EntreeJournal[] {
  return journal.filter((e) => {
    const ecart = ecartJours(fin, e.date);
    return ecart >= 0 && ecart < 7;
  });
}

/** Score de forme d'une entrée donnée (baseline + ACWR recalculés au jour). */
function scoreJour(
  journal: EntreeJournal[],
  seances: SeanceRealisee[],
  entree: EntreeJournal,
): number {
  return calculerScoreForme({
    entree,
    baseline: calculerBaseline(journal, entree.date),
    acwr: acwr(seances, entree.date),
  }).score;
}

/** Moyenne d'une liste, ou null si vide. */
function moyenne(valeurs: number[]): number | null {
  return valeurs.length === 0 ? null : valeurs.reduce((a, b) => a + b, 0) / valeurs.length;
}

/** Tendance de la douleur : semaine en cours vs semaine précédente. */
function tendanceDouleur(journal: EntreeJournal[], fin: DateISO): Tendance | null {
  const cette = moyenne(entreesSemaine(journal, fin).map((e) => e.douleur));
  const precedente = moyenne(entreesSemaine(journal, ajouterJours(fin, -7)).map((e) => e.douleur));
  if (cette === null || precedente === null) return null;
  const diff = cette - precedente;
  if (diff > SEUIL_TENDANCE_DOULEUR) return 'hausse';
  if (diff < -SEUIL_TENDANCE_DOULEUR) return 'baisse';
  return 'stable';
}

/** Records personnels dont la date tombe dans la semaine. */
function recordsBattusSemaine(seances: SeanceRealisee[], fin: DateISO): string[] {
  const dansLaSemaine = (d: DateISO): boolean => {
    const ecart = ecartJours(fin, d);
    return ecart >= 0 && ecart < 7;
  };
  const libelles: string[] = [];

  for (const r of meilleurs1RM(seances)) {
    if (dansLaSemaine(r.date)) {
      libelles.push(`${r.exercice} : ${r.chargeKg} kg × ${r.reps} (~${r.e1rm} kg estimés au 1RM)`);
    }
  }

  const course = recordsCourse(seances);
  if (course.meilleur3000 && dansLaSemaine(course.meilleur3000.date)) {
    const t = course.meilleur3000.tempsSec;
    libelles.push(
      `Meilleur 3000 m : ${Math.floor(t / 60)}:${(t % 60).toString().padStart(2, '0')}`,
    );
  }
  if (course.plusLongueSortie && dansLaSemaine(course.plusLongueSortie.date)) {
    libelles.push(`Plus longue sortie : ${course.plusLongueSortie.distanceKm} km`);
  }

  return libelles;
}

/** Message d'insight de charge, repli quand aucune corrélation n'est significative. */
function insightCharge(zone: ZoneACWR | null, valeur: number | null): string | null {
  if (zone === null || valeur === null) return null;
  const acwrFr = (Math.round(valeur * 100) / 100).toString().replace('.', ',');
  switch (zone) {
    case 'risque':
      return `Charge en forte hausse (ACWR ${acwrFr}) : prudence, le risque de surmenage augmente.`;
    case 'vigilance':
      return `Charge en hausse (ACWR ${acwrFr}) : à surveiller la semaine prochaine.`;
    case 'sous_charge':
      return `Charge en baisse (ACWR ${acwrFr}) : marge pour reprendre progressivement.`;
    default:
      return null;
  }
}

/** Assemble le bilan de la semaine se terminant à `date`. */
export function genererBilanHebdo(
  journal: EntreeJournal[],
  seances: SeanceRealisee[],
  date: DateISO,
): BilanHebdo {
  const srpe = chargeHebdomadaire(seances, date, 7);
  const acwrVal = acwr(seances, date);
  const zone = zoneACWR(acwrVal);

  // Moyenne des 4 semaines précédentes (jours d'écart 7 à 34 inclus).
  const totalPrec4 = seances
    .filter((s) => {
      const ecart = ecartJours(date, s.date);
      return ecart >= 7 && ecart < 35;
    })
    .reduce((acc, s) => acc + s.rpe * s.dureeMin, 0);
  const moyennePrec4 = totalPrec4 / 4;
  const vsMoyenne4Semaines = moyennePrec4 > 0 ? srpe / moyennePrec4 : null;

  const entrees = entreesSemaine(journal, date);
  const scores = entrees.map((e) => scoreJour(journal, seances, e));
  const scoreMoyen = scores.length === 0 ? null : Math.round(moyenne(scores) ?? 0);
  const joursDegrades = scores.filter((s) => s < SEUIL_SCORE_DEGRADE_BILAN).length;

  const correlation = correlationLaPlusSignificative(journal, date);
  const insight = correlation?.libelle ?? insightCharge(zone, acwrVal);

  const ajustement =
    zone === 'risque' || zone === 'vigilance' || joursDegrades >= JOURS_DEGRADES_DECHARGE;

  return {
    finSemaine: date,
    charge: { srpe, acwr: acwrVal, zone, vsMoyenne4Semaines },
    sante: { scoreMoyen, joursDegrades, tendanceDouleur: tendanceDouleur(journal, date) },
    progression: { recordsBattus: recordsBattusSemaine(seances, date) },
    insight,
    decision: ajustement ? 'ajustement_propose' : 'tel_que_prevu',
    libelleDecision: ajustement
      ? 'Voir l’ajustement proposé pour la semaine prochaine.'
      : 'Semaine suivante telle que prévue.',
  };
}
