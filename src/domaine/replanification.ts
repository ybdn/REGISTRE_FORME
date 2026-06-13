import { calculerBaseline } from './baseline';
import {
  JOURS_SORTIE_POUSSEE,
  JOURS_SUGGESTION_POUSSEE,
  REPRISE_SCORE_MIN,
  REPRISE_VOLUMES,
} from './constantes';
import { ajouterJours } from './dates';
import { estJourDegrade, joursDegradesConsecutifs } from './moteurAdaptation';
import type { DateISO, EntreeJournal, SemainePlanifiee } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// PLAN VIVANT — replanification & reprise post-poussée (cf. doc 02 §2.6)
//
// Le programme 16 semaines cesse d'être un mapping figé semaine-calendrier →
// semaine-programme : il devient une LISTE de semaines restantes que l'on peut
// faire GLISSER (jamais en silence — l'UI propose, l'utilisateur valide). Deux
// réalités du Crohn le justifient : une poussée impose des arrêts, et la
// progression réelle diffère de la trame.
//
// Tout est pur : on transforme des listes de semaines, on lit le journal. Aucun
// effet de bord, aucune persistance ici.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fait glisser le programme à partir de la semaine `aPartirDe` (incluse) de
 * `decalage` semaines (1 par défaut). Le CONTENU de chaque semaine (phase,
 * séances, test chrono) reste attaché à la semaine ; seul son numéro de calendrier
 * augmente — les bornes de phases et les tests glissent donc avec. Renvoie une
 * nouvelle liste (immuable), triée par numéro.
 */
export function glisserProgramme(
  semaines: SemainePlanifiee[],
  aPartirDe: number,
  decalage = 1,
): SemainePlanifiee[] {
  return semaines
    .map((s) => (s.numero >= aPartirDe ? { ...s, numero: s.numero + decalage } : { ...s }))
    .sort((a, b) => a.numero - b.numero);
}

/** Un palier du protocole de reprise après une poussée. */
export interface PalierReprise {
  /** Rang du palier (1, 2, 3…). */
  palier: number;
  /** Volume relatif à la trame (0,7 = −30 %, 1 = retour normal). */
  volumePct: number;
  /** Score de forme moyen minimal sur la semaine pour valider et passer au suivant. */
  scoreFormeMinSortie: number;
  /** Explication affichable telle quelle. */
  description: string;
}

/**
 * Protocole de reprise à la sortie d'une poussée : 1 semaine à −30 %, puis −15 %,
 * puis retour à la trame — chaque palier validé par un score de forme moyen ≥ 60
 * sur la semaine. `semainesManquees` n'allonge pas le protocole (la sortie est déjà
 * conditionnée à 3 jours non dégradés) mais contextualise le message.
 */
export function programmeReprisePostPoussee(semainesManquees: number): PalierReprise[] {
  const contexte =
    semainesManquees > 0
      ? `Après ${semainesManquees} semaine${semainesManquees > 1 ? 's' : ''} de poussée, `
      : '';
  return REPRISE_VOLUMES.map((volumePct, i) => {
    const reduction = Math.round((1 - volumePct) * 100);
    const description =
      volumePct === 1
        ? `${i === 0 ? contexte : ''}Palier ${i + 1} : retour à la trame complète.`
        : `${i === 0 ? contexte : ''}Palier ${i + 1} : volume −${reduction} %. On valide quand le score de forme moyen de la semaine atteint ${REPRISE_SCORE_MIN}.`;
    return { palier: i + 1, volumePct, scoreFormeMinSortie: REPRISE_SCORE_MIN, description };
  });
}

/** Vrai si un palier de reprise est validé (score de forme moyen suffisant). */
export function palierRepriseValide(scoreFormeMoyenSemaine: number): boolean {
  return scoreFormeMoyenSemaine >= REPRISE_SCORE_MIN;
}

/**
 * Suggère (sans jamais l'activer) le mode poussée après
 * `JOURS_SUGGESTION_POUSSEE` jours dégradés consécutifs. L'activation reste un
 * geste explicite de l'utilisateur.
 */
export function suggererModePousse(journal: EntreeJournal[], date: DateISO): boolean {
  return joursDegradesConsecutifs(journal, date) >= JOURS_SUGGESTION_POUSSEE;
}

/**
 * Vrai si l'utilisateur peut sortir du mode poussée : les `JOURS_SORTIE_POUSSEE`
 * derniers jours (date incluse) sont tous saisis ET non dégradés. La déclaration
 * de sortie reste, elle aussi, à l'initiative de l'utilisateur.
 */
export function peutSortirDePoussee(journal: EntreeJournal[], date: DateISO): boolean {
  const parDate = new Map(journal.map((e) => [e.date, e]));
  for (let i = 0; i < JOURS_SORTIE_POUSSEE; i++) {
    const jour = ajouterJours(date, -i);
    const e = parDate.get(jour);
    if (!e || estJourDegrade(e, calculerBaseline(journal, jour))) return false;
  }
  return true;
}
