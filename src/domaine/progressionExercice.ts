import {
  ABSENCE_REPRISE_JOURS,
  FENETRE_PROGRESSION_SEANCES,
  INCREMENT_BAS_CORPS,
  INCREMENT_HAUT_CORPS,
  REDUCTION_PLATEAU,
  REDUCTION_REPRISE_MAX,
  REDUCTION_REPRISE_PAR_SEMAINE,
  RPE_SEANCE_REUSSIE,
  SEANCES_PLATEAU,
} from './constantes';
import { ecartJours } from './dates';
import type { ExerciceModele } from './modelesSeances';
import type { DateISO, SeanceRealisee } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// PROGRESSION PAR EXERCICE — double progression + plateaux (cf. doc 02 §2.4)
//
// Fourchette de répétitions (ex. 8-12) :
//   1. Séance réussie (reps dans la fourchette, RPE séance ≤ 8) → +1 rep.
//   2. Haut de fourchette atteint → +incrément de charge (relatif au groupe
//      musculaire, le plus petit de kg/% l'emporte) et retour bas de fourchette.
//   3. 3 séances consécutives sans progression → plateau : décharge ciblée −10 %
//      proposée (ou bascule sur la variation A↔B, choix laissé à l'utilisateur).
//
// L'historique se lit dans `seance_realisee.charges` (10 dernières séances où
// l'exercice apparaît) — aucun état stocké, tout est recalculé (KISS).
// ─────────────────────────────────────────────────────────────────────────────

/** Dernière performance enregistrée sur un exercice (pour l'affichage « la dernière fois »). */
export interface PerformanceExercice {
  date: DateISO;
  series: number;
  reps: number;
  chargeKg: number;
  /** RPE de la séance entière (proxy de difficulté, pas par exercice). */
  rpe: number;
}

/** Cible du jour pour un exercice, prête à afficher dans le mode séance guidée. */
export interface CibleExercice {
  exercice: string;
  series: number;
  reps: number;
  /** `null` pour les exercices sans charge (gainage, poids du corps, course). */
  chargeKg: number | null;
  /** Explication en français, affichable telle quelle (pas de boîte noire). */
  raison: string;
  /** Plateau détecté : l'UI propose la décharge ciblée ou la variation A↔B. */
  plateau: boolean;
  dernierePerf: PerformanceExercice | null;
}

/** Contexte d'évaluation de la cible. */
export interface OptionsCible {
  /** Date du jour (sert au calcul de l'absence pour la reprise). */
  date: DateISO;
  /** Règle `ralentir_progression` active : les incréments de charge sont gelés (les reps non). */
  ralentirProgression?: boolean;
}

/** Arrondi au demi-kilo (granularité réaliste des machines / micro-charges). */
function arrondirDemiKg(kg: number): number {
  return Math.round(kg * 2) / 2;
}

/**
 * Extrait l'historique d'un exercice : occurrences les plus récentes d'abord,
 * limité aux `FENETRE_PROGRESSION_SEANCES` dernières séances où il apparaît.
 * Le nom d'exercice identifie le modèle (les exercices diffèrent entre salle A et B).
 */
export function historiqueExercice(
  seances: SeanceRealisee[],
  nomExercice: string,
): PerformanceExercice[] {
  return [...seances]
    .sort((a, b) => b.date.localeCompare(a.date))
    .flatMap((s) => {
      const c = s.charges?.find((ch) => ch.exercice === nomExercice);
      if (!c) return [];
      return [{ date: s.date, series: c.series, reps: c.reps, chargeKg: c.chargeKg, rpe: s.rpe }];
    })
    .slice(0, FENETRE_PROGRESSION_SEANCES);
}

/** Jours écoulés depuis la dernière séance de salle (toutes séances confondues), ou `null`. */
function joursSansSalle(seances: SeanceRealisee[], date: DateISO): number | null {
  const dates = seances.filter((s) => s.type === 'salle').map((s) => s.date);
  if (dates.length === 0) return null;
  const derniere = dates.reduce((a, b) => (a > b ? a : b));
  return ecartJours(date, derniere);
}

/** Vrai si `b` (plus récente) marque une progression par rapport à `a` (rep OU charge). */
function aProgresse(a: PerformanceExercice, b: PerformanceExercice): boolean {
  return b.chargeKg > a.chargeKg || (b.chargeKg === a.chargeKg && b.reps > a.reps);
}

/**
 * Plateau : les `SEANCES_PLATEAU` dernières séances n'ont progressé ni en reps
 * ni en charge, chacune par rapport à la précédente (il faut donc n+1 points).
 */
export function estEnPlateau(historique: PerformanceExercice[]): boolean {
  if (historique.length < SEANCES_PLATEAU + 1) return false;
  for (let i = 0; i < SEANCES_PLATEAU; i++) {
    const recente = historique[i];
    const precedente = historique[i + 1];
    if (!recente || !precedente || aProgresse(precedente, recente)) return false;
  }
  return true;
}

/** Incrément de charge du palier, relatif au groupe musculaire (le plus petit de kg/%). */
function incrementCharge(chargeKg: number, groupe: 'bas' | 'haut'): number {
  const regle = groupe === 'bas' ? INCREMENT_BAS_CORPS : INCREMENT_HAUT_CORPS;
  const brut = Math.min(regle.kg, chargeKg * regle.pct);
  // Jamais moins d'un demi-kilo, sinon le palier ne change rien.
  return Math.max(0.5, arrondirDemiKg(brut));
}

/**
 * Calcule la cible du jour pour un exercice selon la double progression.
 * Ordre des règles : reprise après absence > plateau > gel/progression.
 */
export function prochaineCible(
  seances: SeanceRealisee[],
  exercice: ExerciceModele,
  options: OptionsCible,
): CibleExercice {
  const base = {
    exercice: exercice.nom,
    series: exercice.series,
    plateau: false,
  };

  // Exercices sans charge (gainage, poids du corps) : pas de progression de charge.
  if (exercice.chargeDepartKg === undefined || exercice.groupeMusculaire === 'gainage') {
    return {
      ...base,
      reps: exercice.reps,
      chargeKg: null,
      raison: 'Exercice sans charge : on suit la consigne du modèle.',
      dernierePerf: null,
    };
  }

  const repsMin = exercice.repsMin ?? exercice.reps;
  const repsMax = exercice.repsMax ?? exercice.reps;
  const groupe = exercice.groupeMusculaire === 'bas' ? 'bas' : 'haut';
  const historique = historiqueExercice(seances, exercice.nom);
  const derniere = historique[0];

  // Première séance : départ indicatif du modèle, bas de fourchette.
  if (!derniere) {
    return {
      ...base,
      reps: repsMin,
      chargeKg: exercice.chargeDepartKg,
      raison: `Première séance : départ à ${exercice.chargeDepartKg} kg, bas de fourchette (${repsMin} reps).`,
      dernierePerf: null,
    };
  }

  // Reprise après absence de salle : −10 % par tranche de 7 j, plancher −30 %.
  const absence = joursSansSalle(seances, options.date);
  if (absence !== null && absence >= ABSENCE_REPRISE_JOURS) {
    const reduction = Math.min(
      REDUCTION_REPRISE_MAX,
      Math.floor(absence / ABSENCE_REPRISE_JOURS) * REDUCTION_REPRISE_PAR_SEMAINE,
    );
    const charge = arrondirDemiKg(derniere.chargeKg * (1 - reduction));
    return {
      ...base,
      reps: repsMin,
      chargeKg: charge,
      raison: `Reprise après ${absence} j sans salle : charge réduite de ${Math.round(reduction * 100)} % (${charge} kg), on remonte progressivement.`,
      dernierePerf: derniere,
    };
  }

  // Plateau : décharge ciblée proposée (−10 % et remontée), ou variation A↔B.
  if (estEnPlateau(historique)) {
    const charge = arrondirDemiKg(derniere.chargeKg * (1 - REDUCTION_PLATEAU));
    return {
      ...base,
      plateau: true,
      reps: repsMin,
      chargeKg: charge,
      raison: `Plateau : ${SEANCES_PLATEAU} séances sans progression. Proposition : −10 % (${charge} kg) et remontée, ou bascule sur l'exercice de variation.`,
      dernierePerf: derniere,
    };
  }

  const reussie = derniere.reps >= repsMin && derniere.rpe <= RPE_SEANCE_REUSSIE;

  // Séance difficile (RPE > 8) ou reps sous la fourchette : on consolide la même cible.
  if (!reussie) {
    const reps = Math.min(Math.max(derniere.reps, repsMin), repsMax);
    return {
      ...base,
      reps,
      chargeKg: derniere.chargeKg,
      raison: `Dernière séance difficile (RPE ${derniere.rpe}) : on consolide à ${derniere.chargeKg} kg × ${reps} avant de progresser.`,
      dernierePerf: derniere,
    };
  }

  // Double progression 1 : +1 rep tant que le haut de fourchette n'est pas atteint.
  if (derniere.reps < repsMax) {
    const reps = derniere.reps + 1;
    return {
      ...base,
      reps,
      chargeKg: derniere.chargeKg,
      raison: `Séance réussie : +1 rep (objectif ${derniere.chargeKg} kg × ${reps}, fourchette ${repsMin}-${repsMax}).`,
      dernierePerf: derniere,
    };
  }

  // Haut de fourchette atteint. `ralentir_progression` gèle l'incrément de charge.
  if (options.ralentirProgression) {
    return {
      ...base,
      reps: repsMax,
      chargeKg: derniere.chargeKg,
      raison: `Progression ralentie (RPE moyen élevé) : la charge reste à ${derniere.chargeKg} kg malgré le haut de fourchette atteint.`,
      dernierePerf: derniere,
    };
  }

  // Double progression 2 : +incrément de charge et retour bas de fourchette.
  const increment = incrementCharge(derniere.chargeKg, groupe);
  const charge = arrondirDemiKg(derniere.chargeKg + increment);
  return {
    ...base,
    reps: repsMin,
    chargeKg: charge,
    raison: `Haut de fourchette atteint (${repsMax} reps) : +${increment} kg (${groupe} du corps) → ${charge} kg × ${repsMin}.`,
    dernierePerf: derniere,
  };
}
