import { calculerBaseline } from './baseline';
import { acwr, chargeHebdomadaire, chargeSeance, zoneACWR } from './chargeEntrainement';
import type { ZoneACWR } from './chargeEntrainement';
import {
  FENETRE_CHARGE_CHRONIQUE,
  FENETRE_MOYENNE_MOBILE_JOURS,
  GRACE_OBSERVANCE_JOURS_PAR_SEMAINE,
} from './constantes';
import { ajouterJours, ecartJours, versJourAbsolu } from './dates';
import { calculerScoreForme } from './scoreForme';
import type { DateISO, EntreeJournal, SeanceRealisee, TypeSeance } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// TENDANCES VISUELLES & OBSERVANCE — matière première des graphes (cf. doc 03 §3.4-3.5)
//
// Des fonctions PURES qui préparent les séries à tracer (composants react-native-svg
// maison côté UI, pas de lib de charts lourde) :
//   • moyenne mobile 7 j (poids lissé : seul le lissé est interprétable sous MICI) ;
//   • charge hebdo sRPE empilée par type + charge chronique + zone ACWR ;
//   • santé hebdo (douleur/énergie moyennes) superposable à la charge ;
//   • heatmap calendrier : intensité = score de forme, point = séance réalisée ;
//   • observance bienveillante (grâce hebdomadaire : un trou/semaine n'interrompt rien).
//
// Aucun nouveau schéma : tout est recalculé depuis journal/séances (volumes négligeables).
// ─────────────────────────────────────────────────────────────────────────────

/** Un point d'une série temporelle (générique : poids, mesure…). */
export interface PointTemporel {
  date: DateISO;
  valeur: number;
}

/**
 * Moyenne mobile sur une fenêtre de jours (7 par défaut), calculée sur le temps
 * civil et non sur l'index — un point lissé = moyenne des points des `fenetre`
 * derniers jours (gaps gérés). Renvoie une série triée par date.
 */
export function moyenneMobile(
  points: PointTemporel[],
  fenetreJours = FENETRE_MOYENNE_MOBILE_JOURS,
): PointTemporel[] {
  const tries = [...points].sort((a, b) => a.date.localeCompare(b.date));
  return tries.map((p) => {
    const fenetre = tries.filter((q) => {
      const ecart = ecartJours(p.date, q.date);
      return ecart >= 0 && ecart < fenetreJours;
    });
    const somme = fenetre.reduce((acc, q) => acc + q.valeur, 0);
    return { date: p.date, valeur: somme / fenetre.length };
  });
}

/** Charge d'une semaine : sRPE total + décomposition par type + contexte ACWR. */
export interface SemaineCharge {
  /** Date de fin de la semaine (la fenêtre couvre les 7 jours jusqu'à cette date incluse). */
  fin: DateISO;
  /** sRPE total de la semaine. */
  charge: number;
  /** sRPE par type de séance (barres empilées). */
  parType: Record<TypeSeance, number>;
  /** Charge chronique (moyenne hebdo sur 28 j) à la fin de la semaine. */
  chronique: number;
  /** ACWR à la fin de la semaine, ou `null` si non calculable. */
  acwr: number | null;
  /** Zone qualitative de l'ACWR (pour la coloration), ou `null`. */
  zone: ZoneACWR | null;
}

const TYPES_SEANCE: TypeSeance[] = ['course', 'salle', 'freeletics', 'sante'];

/**
 * Série des `nbSemaines` dernières semaines (de la plus ancienne à la plus récente)
 * se terminant à `dateFin`, prête pour le graphe de charge empilée.
 */
export function serieChargeHebdo(
  seances: SeanceRealisee[],
  dateFin: DateISO,
  nbSemaines: number,
): SemaineCharge[] {
  const semaines: SemaineCharge[] = [];
  for (let k = 0; k < nbSemaines; k++) {
    const fin = ajouterJours(dateFin, -7 * k);
    const parType = Object.fromEntries(TYPES_SEANCE.map((t) => [t, 0])) as Record<
      TypeSeance,
      number
    >;
    for (const s of seances) {
      const ecart = ecartJours(fin, s.date);
      if (ecart >= 0 && ecart < 7) parType[s.type] += chargeSeance(s);
    }
    const acwrVal = acwr(seances, fin);
    semaines.push({
      fin,
      charge: chargeHebdomadaire(seances, fin, 7),
      parType,
      chronique: chargeHebdomadaire(seances, fin, FENETRE_CHARGE_CHRONIQUE) / 4,
      acwr: acwrVal,
      zone: zoneACWR(acwrVal),
    });
  }
  return semaines.reverse();
}

/** Moyennes santé d'une semaine, superposables au graphe de charge. */
export interface SemaineSante {
  fin: DateISO;
  /** Douleur moyenne de la semaine, ou `null` si aucune entrée. */
  douleur: number | null;
  /** Énergie moyenne de la semaine, ou `null` si aucune entrée. */
  energie: number | null;
  /** Nombre d'entrées de journal sur la semaine. */
  nbEntrees: number;
}

/** Série santé hebdomadaire (douleur/énergie moyennes) — LE graphe santé ↔ charge. */
export function serieSante(
  journal: EntreeJournal[],
  dateFin: DateISO,
  nbSemaines: number,
): SemaineSante[] {
  const semaines: SemaineSante[] = [];
  for (let k = 0; k < nbSemaines; k++) {
    const fin = ajouterJours(dateFin, -7 * k);
    const entrees = journal.filter((e) => {
      const ecart = ecartJours(fin, e.date);
      return ecart >= 0 && ecart < 7;
    });
    const moyenne = (vs: number[]): number | null =>
      vs.length === 0 ? null : vs.reduce((a, b) => a + b, 0) / vs.length;
    semaines.push({
      fin,
      douleur: moyenne(entrees.map((e) => e.douleur)),
      energie: moyenne(entrees.map((e) => e.energie)),
      nbEntrees: entrees.length,
    });
  }
  return semaines.reverse();
}

/** Une case de la heatmap calendrier (un jour). */
export interface CelluleHeatmap {
  date: DateISO;
  /** Score de forme du jour (0-100), ou `null` si le journal n'est pas saisi. */
  score: number | null;
  /** Une séance (hors repos) a-t-elle été réalisée ce jour. */
  aSeance: boolean;
}

/**
 * Heatmap des `nbJours` derniers jours (du plus ancien au plus récent) : intensité
 * = score de forme du jour (baseline + ACWR recalculés au jour), point = séance.
 */
export function heatmapForme(
  journal: EntreeJournal[],
  seances: SeanceRealisee[],
  dateFin: DateISO,
  nbJours: number,
): CelluleHeatmap[] {
  const parDate = new Map<DateISO, EntreeJournal>();
  for (const e of journal) parDate.set(e.date, e);

  const cellules: CelluleHeatmap[] = [];
  for (let offset = 0; offset < nbJours; offset++) {
    const date = ajouterJours(dateFin, -offset);
    const entree = parDate.get(date);
    const score =
      entree === undefined
        ? null
        : calculerScoreForme({
            entree,
            baseline: calculerBaseline(journal, date),
            acwr: acwr(seances, date),
          }).score;
    const aSeance = seances.some((s) => s.date === date && s.variante !== 'repos');
    cellules.push({ date, score, aSeance });
  }
  return cellules.reverse();
}

/** Observance bienveillante du journal (cf. §3.5). */
export interface ObservanceJournal {
  joursSaisis: number;
  joursEcoules: number;
  /** Taux 0-1 = joursSaisis / joursEcoules. */
  taux: number;
  /** Série en cours, avec grâce hebdomadaire (un trou/semaine ne l'interrompt pas). */
  serieActuelle: number;
}

/** Largeur (jours) de la fenêtre glissante consommant une grâce d'observance. */
const FENETRE_GRACE_JOURS = 7;

/**
 * Observance du journal sur les `joursEcoules` derniers jours, et série en cours
 * tolérant un jour manquant par tranche de 7 jours (la maladie impose des mauvais
 * jours ; l'app ne les punit pas).
 */
export function observanceJournal(
  journal: EntreeJournal[],
  date: DateISO,
  joursEcoules: number,
): ObservanceJournal {
  const presents = new Set(journal.map((e) => versJourAbsolu(e.date)));
  const dateAbs = versJourAbsolu(date);

  const joursSaisis = journal.filter((e) => {
    const ecart = ecartJours(date, e.date);
    return ecart >= 0 && ecart < joursEcoules;
  }).length;
  const taux = joursEcoules > 0 ? joursSaisis / joursEcoules : 0;

  // Série en cours : on remonte depuis `date` en s'autorisant
  // GRACE_OBSERVANCE_JOURS_PAR_SEMAINE trou par fenêtre glissante de 7 jours
  // (une nouvelle grâce n'est rouverte qu'après 7 jours parcourus).
  let serieActuelle = 0;
  const gracesRecentes: number[] = []; // offsets des grâces encore dans la fenêtre de 7 j
  const plusAncien = presents.size === 0 ? dateAbs : Math.min(...presents);
  const limiteOffset = dateAbs - plusAncien + FENETRE_GRACE_JOURS;
  for (let offset = 0; offset <= limiteOffset; offset++) {
    if (presents.has(dateAbs - offset)) {
      serieActuelle++;
      continue;
    }
    // Jour manquant : on purge les grâces sorties de la fenêtre, puis on en consomme
    // une si le quota hebdomadaire le permet — sinon la série s'arrête.
    while (gracesRecentes.length > 0 && offset - (gracesRecentes[0] ?? 0) >= FENETRE_GRACE_JOURS) {
      gracesRecentes.shift();
    }
    if (gracesRecentes.length < GRACE_OBSERVANCE_JOURS_PAR_SEMAINE) {
      gracesRecentes.push(offset);
    } else {
      break;
    }
  }

  return { joursSaisis, joursEcoules, taux, serieActuelle };
}
