import {
  DUREE_MAX_DEMI_COOPER_SEC,
  FACTEUR_VMA_TEST,
  LISSAGE_VMA_NOUVEAU,
  PCT_VMA_400M,
  PCT_VMA_3030,
  PCT_VMA_EF,
} from './constantes';
import type { SeanceRealisee } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// ALLURES DE COURSE PERSONNALISÉES — VMA dérivée des tests (cf. doc 02 §2.5)
//
// VMA estimée = vitesse moyenne du chrono × 1,05 (3000 m couru entre 12 et 20 min) ;
// un chrono court (≤ 8 min) est traité en demi-Cooper : la vitesse EST la VMA.
// Les tests successifs sont lissés 70 % nouveau / 30 % ancien.
//
// Sans aucun chrono : `estimerVMA` rend `null` et l'UI reste strictement v1
// (consignes au ressenti — jamais d'allure inventée).
// ─────────────────────────────────────────────────────────────────────────────

/** Une zone d'allure cible, pré-formatée pour l'affichage. */
export interface AllureCible {
  /** Texte prêt à afficher, ex. « entre 7:30 et 8:45 /km ». */
  texte: string;
}

/** Allures cibles dérivées de la VMA, par type de travail. */
export interface AlluresCibles {
  vmaKmH: number;
  /** Endurance fondamentale / sortie longue : 60-70 % VMA. */
  ef: AllureCible & { allureRapideMinKm: number; allureLenteMinKm: number };
  /** Portion « vite » du 30/30 : 100 % VMA. */
  trenteTrente: AllureCible & { allureMinKm: number; metresPar30s: number };
  /** 400 m allure 3000 : 95 % VMA. */
  quatreCents: AllureCible & { tempsSec: number };
}

/**
 * Estime la VMA (km/h) à partir des chronos saisis (`distanceKm` + `tempsSec`),
 * en lissant chaque nouveau test (70 % nouveau / 30 % ancien). `null` sans chrono.
 */
export function estimerVMA(seances: SeanceRealisee[]): number | null {
  const chronos = seances
    .filter(
      (s) =>
        s.type === 'course' &&
        s.distanceKm !== undefined &&
        s.distanceKm > 0 &&
        s.tempsSec !== undefined &&
        s.tempsSec > 0,
    )
    .sort((a, b) => a.date.localeCompare(b.date));

  let vma: number | null = null;
  for (const s of chronos) {
    const distanceKm = s.distanceKm as number;
    const tempsSec = s.tempsSec as number;
    const vitesse = distanceKm / (tempsSec / 3600);
    const facteur = tempsSec <= DUREE_MAX_DEMI_COOPER_SEC ? 1 : FACTEUR_VMA_TEST;
    const estimation = vitesse * facteur;
    vma =
      vma === null
        ? estimation
        : LISSAGE_VMA_NOUVEAU * estimation + (1 - LISSAGE_VMA_NOUVEAU) * vma;
  }
  return vma === null ? null : Math.round(vma * 10) / 10;
}

/** Formate une allure décimale (min/km) en « m:ss », ex. 7.5 → « 7:30 ». */
export function formaterAllure(minParKm: number): string {
  const totalSec = Math.round(minParKm * 60);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, '0')}`;
}

/** Allure (min/km) correspondant à une vitesse (km/h). */
function allureMinKm(vitesseKmH: number): number {
  return 60 / vitesseKmH;
}

/** Dérive les allures cibles affichables d'une VMA estimée. */
export function alluresCibles(vmaKmH: number): AlluresCibles {
  // EF : la borne « rapide » correspond à 70 % VMA, la « lente » à 60 %.
  const allureRapide = allureMinKm(vmaKmH * PCT_VMA_EF.max);
  const allureLente = allureMinKm(vmaKmH * PCT_VMA_EF.min);

  const allure3030 = allureMinKm(vmaKmH * PCT_VMA_3030);
  // Distance parcourue en 30 s à allure 30/30, arrondie à 5 m (repère terrain lisible).
  const metresPar30s = Math.round((((vmaKmH * PCT_VMA_3030 * 1000) / 3600) * 30) / 5) * 5;

  const temps400Sec = Math.round(400 / ((vmaKmH * PCT_VMA_400M * 1000) / 3600));

  return {
    vmaKmH,
    ef: {
      allureRapideMinKm: allureRapide,
      allureLenteMinKm: allureLente,
      texte: `entre ${formaterAllure(allureRapide)} et ${formaterAllure(allureLente)} /km`,
    },
    trenteTrente: {
      allureMinKm: allure3030,
      metresPar30s,
      texte: `~${formaterAllure(allure3030)} /km, soit ~${metresPar30s} m par 30 s`,
    },
    quatreCents: {
      tempsSec: temps400Sec,
      texte: `400 m en ~${formaterDureeSec(temps400Sec)}`,
    },
  };
}

/** Formate une durée en secondes en « m:ss », ex. 115 → « 1:55 ». */
export function formaterDureeSec(sec: number): string {
  const min = Math.floor(sec / 60);
  const reste = Math.round(sec % 60);
  return `${min}:${reste.toString().padStart(2, '0')}`;
}
