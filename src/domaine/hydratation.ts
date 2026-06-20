import { normaliserAliment } from './alimentation';
import {
  ALCOOL_DIURESE_ML_PAR_G,
  CAFEINE_DIURESE_ML_PAR_MG,
  CAFEINE_SEUIL_DIURESE_MG,
  HYDRATATION_GARDE_FOU_RATIO,
  HYDRATATION_ML_PAR_KG,
  HYDRATATION_OBJECTIF_DEFAUT_ML,
  HYDRATATION_OBJECTIF_PLANCHER_ML,
  HYDRATATION_SEUIL_DESHYDRATATION,
  HYDRATATION_SEUIL_OK,
  PERTE_ML_PAR_SELLE_EXTRA,
  SELLES_NORMALES_PAR_JOUR,
  SUDATION_ML_PAR_MIN,
} from './constantes';
import type { DateISO, PriseHydrique, SeanceRealisee } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// HYDRATATION NETTE — un suivi qui pense « déshydratation », pas « verres bus »
//
// Un verre n'égale pas un verre : un café, une bière et un grand verre d'eau
// n'apportent pas la même eau utile, et certaines boissons COÛTENT de l'eau
// (effet diurétique). On ne suit donc pas un volume bu mais un BILAN NET :
//
//   Bilan = apports pondérés (eau équivalente) − dette diurétique (café/alcool)
//           comparé à un OBJECTIF adaptatif (poids + sudation + pertes digestives)
//
// Pertinence MICI : les selles fréquentes/liquides (déjà saisies dans le journal)
// font perdre beaucoup d'eau → l'objectif MONTE les jours de poussée digestive et
// les jours de sport. Tout est déterministe et explicable (`raison` affichée telle
// quelle), pur et recalculé à la volée. N'entre PAS dans le score de forme : le
// seul lien au moteur est un garde-fou « hydrate-toi avant l'effort ».
//
// Coefficients sourcés du Beverage Hydration Index (Maughan 2016) : à dose normale
// le café/thé/bière hydratent presque autant que l'eau ; ce qui pénalise vraiment,
// c'est la caféine à forte dose et surtout l'alcool — d'où la dette diurétique à part.
// ─────────────────────────────────────────────────────────────────────────────

/** Profil d'une boisson du catalogue : portion type + effets hydriques. */
export interface ProfilBoisson {
  cle: string;
  libelle: string;
  /** Volume d'une portion « 1 tap » (verre, tasse, canette…). */
  volumeDefautMl: number;
  /** « Eau équivalente » par mL bu (fraction d'eau réellement absorbée, BHI-inspiré). */
  coeffHydrique: number;
  /** Caféine apportée par litre (mg/L) — alimente la dette diurétique au-delà du seuil. */
  cafeineMgParLitre: number;
  /** Éthanol pur par litre (g/L) — alimente la dette diurétique (diurèse de l'alcool). */
  alcoolGParLitre: number;
}

/**
 * Catalogue des boissons courantes (révisable, comme tous les seuils du domaine).
 * `coeffHydrique` ≈ fraction d'eau de la boisson ; la diurèse café/alcool est traitée
 * séparément (dette) pour ne pas la compter deux fois.
 */
export const CATALOGUE_BOISSONS: ProfilBoisson[] = [
  {
    cle: 'eau',
    libelle: 'Eau',
    volumeDefautMl: 250,
    coeffHydrique: 1,
    cafeineMgParLitre: 0,
    alcoolGParLitre: 0,
  },
  {
    cle: 'eau gazeuse',
    libelle: 'Eau gazeuse',
    volumeDefautMl: 250,
    coeffHydrique: 1,
    cafeineMgParLitre: 0,
    alcoolGParLitre: 0,
  },
  {
    cle: 'infusion',
    libelle: 'Infusion',
    volumeDefautMl: 200,
    coeffHydrique: 1,
    cafeineMgParLitre: 0,
    alcoolGParLitre: 0,
  },
  {
    cle: 'thé',
    libelle: 'Thé',
    volumeDefautMl: 200,
    coeffHydrique: 1,
    cafeineMgParLitre: 150,
    alcoolGParLitre: 0,
  },
  {
    cle: 'café',
    libelle: 'Café',
    volumeDefautMl: 100,
    coeffHydrique: 1,
    cafeineMgParLitre: 800,
    alcoolGParLitre: 0,
  },
  {
    cle: 'lait',
    libelle: 'Lait',
    volumeDefautMl: 250,
    coeffHydrique: 1.5,
    cafeineMgParLitre: 0,
    alcoolGParLitre: 0,
  },
  {
    cle: 'jus',
    libelle: 'Jus de fruit',
    volumeDefautMl: 200,
    coeffHydrique: 1.1,
    cafeineMgParLitre: 0,
    alcoolGParLitre: 0,
  },
  {
    cle: 'boisson de l’effort',
    libelle: 'Boisson de l’effort',
    volumeDefautMl: 500,
    coeffHydrique: 1.1,
    cafeineMgParLitre: 0,
    alcoolGParLitre: 0,
  },
  {
    cle: 'soda',
    libelle: 'Soda',
    volumeDefautMl: 330,
    coeffHydrique: 0.9,
    cafeineMgParLitre: 100,
    alcoolGParLitre: 0,
  },
  {
    cle: 'bière',
    libelle: 'Bière',
    volumeDefautMl: 330,
    coeffHydrique: 0.95,
    cafeineMgParLitre: 0,
    alcoolGParLitre: 31.6,
  },
  {
    cle: 'vin',
    libelle: 'Vin',
    volumeDefautMl: 125,
    coeffHydrique: 0.85,
    cafeineMgParLitre: 0,
    alcoolGParLitre: 95,
  },
  {
    cle: 'spiritueux',
    libelle: 'Spiritueux',
    volumeDefautMl: 40,
    coeffHydrique: 0.6,
    cafeineMgParLitre: 0,
    alcoolGParLitre: 315,
  },
];

const CATALOGUE_PAR_CLE = new Map(CATALOGUE_BOISSONS.map((b) => [b.cle, b]));

/** Profil par défaut d'une boisson inconnue (texte libre) : traitée comme de l'eau. */
function profilParDefaut(cle: string): ProfilBoisson {
  return {
    cle,
    libelle: cle,
    volumeDefautMl: 250,
    coeffHydrique: 1,
    cafeineMgParLitre: 0,
    alcoolGParLitre: 0,
  };
}

/** Profil d'une boisson : du catalogue si connue, sinon profil « eau » par défaut. */
export function profilBoisson(cle: string): ProfilBoisson {
  return CATALOGUE_PAR_CLE.get(normaliserAliment(cle)) ?? profilParDefaut(normaliserAliment(cle));
}

/** Niveau de séance effective ; on prend `rpe` pour estimer la sudation. */
function tauxSudationMlParMin(rpe: number): number {
  if (rpe <= 3) return SUDATION_ML_PAR_MIN.leger;
  if (rpe <= 6) return SUDATION_ML_PAR_MIN.modere;
  if (rpe <= 8) return SUDATION_ML_PAR_MIN.soutenu;
  return SUDATION_ML_PAR_MIN.intense;
}

/** Statut d'hydratation du jour, gradué pour l'affichage. */
export type StatutHydratation = 'ok' | 'a-boire' | 'deshydratation';

/** Contexte minimal pour évaluer l'hydratation d'un jour (valeurs déjà extraites par le store). */
export interface ContexteHydratation {
  date: DateISO;
  /** Prises de boisson du jour. */
  prises: PriseHydrique[];
  /** Dernier poids connu (kg) pour le besoin de base ; `null` ⇒ objectif par défaut. */
  poidsKg: number | null;
  /** Nombre de selles du jour (journal) ; `null` ⇒ pas de perte digestive comptée. */
  nbSelles: number | null;
  /** Séances réalisées ce jour-là (pour la sudation). */
  seancesDuJour: SeanceRealisee[];
}

/** Bilan hydrique net du jour : décomposé et prêt à afficher (jamais un chiffre magique). */
export interface BilanHydrique {
  date: DateISO;
  /** Somme brute des volumes bus (mL). */
  apportsBrutsMl: number;
  /** Eau équivalente reçue (Σ volume × coeff hydrique). */
  eauEquivalenteMl: number;
  /** Dette diurétique totale (café + alcool), en mL d'eau « perdue ». */
  detteDiuretiqueMl: number;
  detteCafeineMl: number;
  detteAlcoolMl: number;
  /** Apport net réellement utile = eau équivalente − dette diurétique (jamais < 0). */
  apportNetMl: number;
  /** Besoin de base (poids × 33 mL, plancher appliqué). */
  besoinBaseMl: number;
  /** Pertes par sudation des séances du jour. */
  pertesActiviteMl: number;
  /** Pertes digestives (selles au-delà de la normale). */
  pertesDigestivesMl: number;
  /** Objectif adaptatif = base + pertes activité + pertes digestives. */
  objectifMl: number;
  /** Reste à boire pour atteindre l'objectif (jamais < 0). */
  resteMl: number;
  /** Avancement vers l'objectif (apport net / objectif), borné [0 ; ~]. */
  ratio: number;
  statut: StatutHydratation;
  /** Phrase explicable affichée telle quelle. */
  raison: string;
}

/** Formate un volume en mL pour l'affichage : « 750 mL » ou « 1,8 L ». */
export function formaterVolume(ml: number): string {
  const v = Math.round(ml);
  if (Math.abs(v) < 1000) return `${v} mL`;
  return `${(v / 1000).toFixed(1).replace('.', ',')} L`;
}

/** Caféine et alcool totaux apportés par les prises (utile aux insights et à la dette). */
function cumulsDiuretiques(prises: PriseHydrique[]): { cafeineMg: number; alcoolG: number } {
  let cafeineMg = 0;
  let alcoolG = 0;
  for (const p of prises) {
    const profil = profilBoisson(p.boisson);
    const litres = p.volumeMl / 1000;
    cafeineMg += litres * profil.cafeineMgParLitre;
    alcoolG += litres * profil.alcoolGParLitre;
  }
  return { cafeineMg, alcoolG };
}

/** Calcule le bilan hydrique net du jour et sa décomposition. */
export function calculerBilanHydrique(ctx: ContexteHydratation): BilanHydrique {
  const { date, prises, poidsKg, nbSelles, seancesDuJour } = ctx;

  // Apports pondérés (eau équivalente) + apport brut.
  let apportsBrutsMl = 0;
  let eauEquivalenteMl = 0;
  for (const p of prises) {
    apportsBrutsMl += p.volumeMl;
    eauEquivalenteMl += p.volumeMl * profilBoisson(p.boisson).coeffHydrique;
  }

  // Dette diurétique : caféine seulement au-delà du seuil, alcool dès le premier gramme.
  const { cafeineMg, alcoolG } = cumulsDiuretiques(prises);
  const detteCafeineMl =
    Math.max(0, cafeineMg - CAFEINE_SEUIL_DIURESE_MG) * CAFEINE_DIURESE_ML_PAR_MG;
  const detteAlcoolMl = alcoolG * ALCOOL_DIURESE_ML_PAR_G;
  const detteDiuretiqueMl = detteCafeineMl + detteAlcoolMl;

  const apportNetMl = Math.max(0, eauEquivalenteMl - detteDiuretiqueMl);

  // Objectif adaptatif.
  const besoinBaseMl =
    poidsKg != null
      ? Math.max(HYDRATATION_OBJECTIF_PLANCHER_ML, poidsKg * HYDRATATION_ML_PAR_KG)
      : HYDRATATION_OBJECTIF_DEFAUT_ML;
  const pertesActiviteMl = seancesDuJour.reduce(
    (acc, s) => acc + s.dureeMin * tauxSudationMlParMin(s.rpe),
    0,
  );
  const sellesExtra = nbSelles != null ? Math.max(0, nbSelles - SELLES_NORMALES_PAR_JOUR) : 0;
  const pertesDigestivesMl = sellesExtra * PERTE_ML_PAR_SELLE_EXTRA;
  const objectifMl = besoinBaseMl + pertesActiviteMl + pertesDigestivesMl;

  const resteMl = Math.max(0, objectifMl - apportNetMl);
  const ratio = objectifMl > 0 ? apportNetMl / objectifMl : 0;
  const statut: StatutHydratation =
    ratio >= HYDRATATION_SEUIL_OK
      ? 'ok'
      : ratio >= HYDRATATION_SEUIL_DESHYDRATATION
        ? 'a-boire'
        : 'deshydratation';

  return {
    date,
    apportsBrutsMl: Math.round(apportsBrutsMl),
    eauEquivalenteMl: Math.round(eauEquivalenteMl),
    detteDiuretiqueMl: Math.round(detteDiuretiqueMl),
    detteCafeineMl: Math.round(detteCafeineMl),
    detteAlcoolMl: Math.round(detteAlcoolMl),
    apportNetMl: Math.round(apportNetMl),
    besoinBaseMl: Math.round(besoinBaseMl),
    pertesActiviteMl: Math.round(pertesActiviteMl),
    pertesDigestivesMl: Math.round(pertesDigestivesMl),
    objectifMl: Math.round(objectifMl),
    resteMl: Math.round(resteMl),
    ratio,
    statut,
    raison: construireRaison({
      objectifMl,
      besoinBaseMl,
      pertesActiviteMl,
      pertesDigestivesMl,
      sellesExtra,
      dureeEffort: seancesDuJour.reduce((acc, s) => acc + s.dureeMin, 0),
      apportsBrutsMl,
      apportNetMl,
      detteDiuretiqueMl,
      resteMl,
      statut,
    }),
  };
}

/** Construit la phrase explicable du bilan (objectif ajusté + apport net + reste). */
function construireRaison(d: {
  objectifMl: number;
  besoinBaseMl: number;
  pertesActiviteMl: number;
  pertesDigestivesMl: number;
  sellesExtra: number;
  dureeEffort: number;
  apportsBrutsMl: number;
  apportNetMl: number;
  detteDiuretiqueMl: number;
  resteMl: number;
  statut: StatutHydratation;
}): string {
  const ajustements: string[] = [];
  if (d.pertesDigestivesMl > 0) {
    ajustements.push(
      `${d.sellesExtra} selle${d.sellesExtra > 1 ? 's' : ''} de plus que d'habitude (+${formaterVolume(d.pertesDigestivesMl)})`,
    );
  }
  if (d.pertesActiviteMl > 0) {
    ajustements.push(`${d.dureeEffort} min d'effort (+${formaterVolume(d.pertesActiviteMl)})`);
  }

  const phraseObjectif =
    ajustements.length > 0
      ? `Objectif du jour relevé à ${formaterVolume(d.objectifMl)} : base ${formaterVolume(d.besoinBaseMl)}, ${ajustements.join(' et ')}.`
      : `Objectif du jour : ${formaterVolume(d.objectifMl)}.`;

  const phraseApport =
    d.detteDiuretiqueMl > 0
      ? `Tu as bu ${formaterVolume(d.apportsBrutsMl)}, soit ${formaterVolume(d.apportNetMl)} d'eau utile après l'effet diurétique (−${formaterVolume(d.detteDiuretiqueMl)}).`
      : `Tu as bu ${formaterVolume(d.apportsBrutsMl)}, soit ${formaterVolume(d.apportNetMl)} d'eau utile.`;

  const phraseReste =
    d.statut === 'ok'
      ? 'Objectif atteint — belle hydratation.'
      : `Reste ${formaterVolume(d.resteMl)} à boire.`;

  return `${phraseObjectif} ${phraseApport} ${phraseReste}`;
}

/**
 * Garde-fou (le seul lien au moteur) : avertit de s'hydrater AVANT l'effort si l'apport
 * net est nettement en retard sur l'objectif du jour. Jamais bloquant, jamais dans le score.
 * Renvoie `null` quand rien à signaler.
 */
export function avertissementHydratationAvantEffort(bilan: BilanHydrique): string | null {
  if (bilan.ratio >= HYDRATATION_GARDE_FOU_RATIO) return null;
  return (
    `Hydratation basse (${Math.round(bilan.ratio * 100)} % de ton objectif du jour). ` +
    `Bois ~${formaterVolume(bilan.resteMl)} avant et pendant la séance, surtout sous MICI.`
  );
}
