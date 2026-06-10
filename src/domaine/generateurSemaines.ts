import { BORNES_PHASES, REDUCTION_DECHARGE, SEMAINES_TEST_CHRONO } from './constantes';
import { MODELE_ALLEGE_ID, obtenirModele } from './modelesSeances';
import type { Phase, SeancePlanifiee, SemainePlanifiee } from './types';

// Générateur du programme périodisé 16 semaines (3 séances/semaine).
// Jours par défaut : salle lundi (0), course mercredi (2), Freeletics/mix samedi (5).
// Les jours sont déplaçables côté UI ; le générateur ne pose que la trame.

const JOUR_SALLE = 0; // lundi
const JOUR_COURSE = 2; // mercredi
const JOUR_MIX = 5; // samedi

/** Renvoie la phase d'une semaine donnée (1-16). */
export function phasePourSemaine(numero: number): Phase {
  if (numero <= BORNES_PHASES.reprise.fin) return 'reprise';
  if (numero <= BORNES_PHASES.construction.fin) return 'construction';
  return 'performance';
}

/** Construit une séance planifiée à partir d'un identifiant de modèle. */
function seance(jour: number, modeleId: string): SeancePlanifiee {
  const modele = obtenirModele(modeleId);
  if (!modele) throw new Error(`Modèle de séance inconnu : ${modeleId}`);
  return { jour, type: modele.type, modele: modeleId, titre: modele.titre };
}

/** Trame des 3 séances d'une semaine selon la phase. */
function trameSemaine(phase: Phase, numero: number): SeancePlanifiee[] {
  switch (phase) {
    case 'reprise':
      // Réhabituation : salle full body, course EF, circuit doux.
      return [
        seance(JOUR_SALLE, 'salle-a'),
        seance(JOUR_COURSE, 'course-ef'),
        seance(JOUR_MIX, 'freeletics-mici'),
      ];
    case 'construction':
      // Fractionné 30/30 + salle B en alternance A/B.
      return [
        seance(JOUR_SALLE, numero % 2 === 0 ? 'salle-b' : 'salle-a'),
        seance(JOUR_COURSE, 'course-30-30'),
        seance(JOUR_MIX, 'freeletics-mici'),
      ];
    case 'performance': {
      // Sorties longues + VMA 3000 ; tests chronométrés S14 et S16.
      const estTest = (SEMAINES_TEST_CHRONO as readonly number[]).includes(numero);
      return [
        seance(JOUR_SALLE, 'salle-b'),
        seance(JOUR_COURSE, estTest ? 'test-3000' : 'course-vma'),
        seance(JOUR_MIX, 'course-longue'),
      ];
    }
  }
}

/** Génère le programme complet : 16 semaines périodisées. */
export function genererProgramme(): SemainePlanifiee[] {
  const semaines: SemainePlanifiee[] = [];
  for (let numero = 1; numero <= 16; numero++) {
    const phase = phasePourSemaine(numero);
    semaines.push({
      numero,
      phase,
      estDecharge: false,
      estTestChrono: (SEMAINES_TEST_CHRONO as readonly number[]).includes(numero),
      seances: trameSemaine(phase, numero),
    });
  }
  return semaines;
}

/**
 * Transforme une semaine en semaine de décharge : volume réduit de ~40 % et
 * séances basculées en version douce. Renvoie une nouvelle semaine (immuable).
 */
export function appliquerDecharge(semaine: SemainePlanifiee): SemainePlanifiee {
  // −40 % de volume ⇒ on conserve ~60 % des séances (arrondi haut, au moins 1).
  const nbConserve = Math.max(1, Math.round(semaine.seances.length * (1 - REDUCTION_DECHARGE)));
  const seancesAllegees = semaine.seances.slice(0, nbConserve).map((s) => {
    const modele = obtenirModele(MODELE_ALLEGE_ID);
    return {
      ...s,
      type: 'sante' as const,
      modele: MODELE_ALLEGE_ID,
      titre: modele ? modele.titre : s.titre,
    };
  });
  return { ...semaine, estDecharge: true, seances: seancesAllegees };
}

/** Déplace une séance d'un jour à un autre (jours déplaçables). */
export function deplacerSeance(
  semaine: SemainePlanifiee,
  indexSeance: number,
  nouveauJour: number,
): SemainePlanifiee {
  if (nouveauJour < 0 || nouveauJour > 6) throw new Error('Jour hors plage (0-6).');
  const seances = semaine.seances.map((s, i) =>
    i === indexSeance ? { ...s, jour: nouveauJour } : s,
  );
  return { ...semaine, seances };
}
