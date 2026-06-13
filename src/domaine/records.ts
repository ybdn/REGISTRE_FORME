import { DIVISEUR_EPLEY, DUREE_MIN_ALLURE_EF_MIN, TOLERANCE_3000M_KM } from './constantes';
import { versJourAbsolu } from './dates';
import type { DateISO, EntreeJournal, SeanceRealisee } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// RECORDS PERSONNELS & JALONS — détection automatique, célébration sobre (§3.3)
//
// Salle   : meilleur 1RM estimé par exercice (Epley : charge × (1 + reps/30)),
//           pour comparer 50 kg × 12 et 55 kg × 8 sur une même échelle.
// Course  : meilleur 3000 m (chrono), plus longue sortie, meilleure allure EF
//           tenue ≥ 30 min.
// Constance : total de séances, plus longue série de jours de journal consécutifs.
//
// Tout est pur, lu depuis les séances/journal existants — aucun état stocké.
// ─────────────────────────────────────────────────────────────────────────────

/** Estimation du 1RM (Epley) : charge × (1 + reps/30). Arrondie à 0,1 kg. */
export function epley(chargeKg: number, reps: number): number {
  return Math.round(chargeKg * (1 + reps / DIVISEUR_EPLEY) * 10) / 10;
}

/** Meilleure performance de force sur un exercice (1RM estimé). */
export interface Record1RM {
  exercice: string;
  e1rm: number;
  chargeKg: number;
  reps: number;
  date: DateISO;
}

/**
 * Meilleur 1RM estimé par exercice, le plus lourd d'abord. À 1RM égal, on garde
 * la performance la plus ancienne (date à laquelle le record a été établi).
 */
export function meilleurs1RM(seances: SeanceRealisee[]): Record1RM[] {
  const meilleurs = new Map<string, Record1RM>();
  for (const s of seances) {
    for (const c of s.charges ?? []) {
      if (c.chargeKg <= 0 || c.reps <= 0) continue;
      const e1rm = epley(c.chargeKg, c.reps);
      const courant = meilleurs.get(c.exercice);
      const meilleur =
        courant === undefined ||
        e1rm > courant.e1rm ||
        (e1rm === courant.e1rm && s.date < courant.date);
      if (meilleur) {
        meilleurs.set(c.exercice, {
          exercice: c.exercice,
          e1rm,
          chargeKg: c.chargeKg,
          reps: c.reps,
          date: s.date,
        });
      }
    }
  }
  return [...meilleurs.values()].sort((a, b) => b.e1rm - a.e1rm);
}

/** Records de course (chacun optionnel : `undefined` tant qu'aucune donnée). */
export interface RecordsCourse {
  /** Meilleur chrono sur ~3000 m. */
  meilleur3000?: { tempsSec: number; date: DateISO; allureMinKm: number };
  /** Plus longue sortie (km). */
  plusLongueSortie?: { distanceKm: number; date: DateISO };
  /** Meilleure (plus rapide) allure tenue sur une sortie ≥ 30 min. */
  meilleureAllureEF?: { allureMinKm: number; date: DateISO; dureeMin: number; distanceKm: number };
}

/** Allure (min/km) d'une séance chronométrée. */
function allureMinKm(tempsSec: number, distanceKm: number): number {
  return tempsSec / 60 / distanceKm;
}

/** Calcule les records de course à partir des séances `course` chronométrées. */
export function recordsCourse(seances: SeanceRealisee[]): RecordsCourse {
  const courses = seances.filter((s) => s.type === 'course');
  const res: RecordsCourse = {};

  for (const s of courses) {
    // Meilleur 3000 m : chrono complet sur une distance proche de 3 km.
    if (
      s.distanceKm !== undefined &&
      s.tempsSec !== undefined &&
      s.tempsSec > 0 &&
      Math.abs(s.distanceKm - 3) <= TOLERANCE_3000M_KM &&
      (res.meilleur3000 === undefined || s.tempsSec < res.meilleur3000.tempsSec)
    ) {
      res.meilleur3000 = {
        tempsSec: s.tempsSec,
        date: s.date,
        allureMinKm: allureMinKm(s.tempsSec, s.distanceKm),
      };
    }

    // Plus longue sortie : distance maximale.
    if (
      s.distanceKm !== undefined &&
      s.distanceKm > 0 &&
      (res.plusLongueSortie === undefined || s.distanceKm > res.plusLongueSortie.distanceKm)
    ) {
      res.plusLongueSortie = { distanceKm: s.distanceKm, date: s.date };
    }

    // Meilleure allure EF : la plus rapide tenue sur ≥ 30 min.
    if (
      s.distanceKm !== undefined &&
      s.distanceKm > 0 &&
      s.tempsSec !== undefined &&
      s.tempsSec > 0 &&
      s.dureeMin >= DUREE_MIN_ALLURE_EF_MIN
    ) {
      const allure = allureMinKm(s.tempsSec, s.distanceKm);
      if (res.meilleureAllureEF === undefined || allure < res.meilleureAllureEF.allureMinKm) {
        res.meilleureAllureEF = {
          allureMinKm: allure,
          date: s.date,
          dureeMin: s.dureeMin,
          distanceKm: s.distanceKm,
        };
      }
    }
  }

  return res;
}

/** Séries de jours de journal consécutifs (constance). */
export interface SerieJournal {
  /** Série en cours, se terminant au jour évalué (0 si rien saisi ce jour). */
  actuelle: number;
  /** Plus longue série jamais atteinte. */
  record: number;
}

/**
 * Plus longue série de jours de journal consécutifs (stricte, sans grâce — la
 * grâce hebdomadaire concerne l'observance, cf. [[tendances]]), et série en cours
 * se terminant exactement à `date`.
 */
export function serieJournal(journal: EntreeJournal[], date: DateISO): SerieJournal {
  if (journal.length === 0) return { actuelle: 0, record: 0 };

  const joursAbs = [...new Set(journal.map((e) => versJourAbsolu(e.date)))].sort((a, b) => a - b);

  let record = 1;
  let courante = 1;
  for (let i = 1; i < joursAbs.length; i++) {
    courante = joursAbs[i] === (joursAbs[i - 1] ?? 0) + 1 ? courante + 1 : 1;
    if (courante > record) record = courante;
  }

  // Série en cours : remonter depuis `date` tant que les jours sont contigus.
  const dateAbs = versJourAbsolu(date);
  const presents = new Set(joursAbs);
  let actuelle = 0;
  while (presents.has(dateAbs - actuelle)) actuelle++;

  return { actuelle, record };
}

/** Photographie complète des records personnels. */
export interface Records {
  salle: Record1RM[];
  course: RecordsCourse;
  totalSeances: number;
  serieJournal: SerieJournal;
}

/** Agrège tous les records personnels à une date donnée. */
export function calculerRecords(
  seances: SeanceRealisee[],
  journal: EntreeJournal[],
  date: DateISO,
): Records {
  return {
    salle: meilleurs1RM(seances),
    course: recordsCourse(seances),
    totalSeances: seances.length,
    serieJournal: serieJournal(journal, date),
  };
}
