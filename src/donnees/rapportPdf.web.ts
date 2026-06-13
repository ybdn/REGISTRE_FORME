import { type DonneesRapport, construireRapportHtml } from '@/domaine/rapport';
import type { Depot } from './depot';
import type { Profil } from './profil';

// Shim web (docs/07 §8.2) : même HTML de rapport (domaine pur, identique au mobile), mais
// rendu via l'impression du navigateur (window.print) au lieu d'expo-print. Aucun réseau.

async function rassemblerDonnees(
  depot: Depot,
  profil: Profil | null,
  depuis: string,
  fin: string,
): Promise<DonneesRapport> {
  const [journal, seances, mesures, adaptations, consommations, statutsAliments] =
    await Promise.all([
      depot.lireJournal(depuis),
      depot.lireSeances(depuis),
      depot.lireMesures(depuis),
      depot.lireAdaptationsAppliquees(depuis),
      depot.lireConsommations(depuis),
      depot.lireStatutsAliments(),
    ]);
  return {
    genereLe: fin,
    periode: { debut: depuis, fin },
    profil: profil ? { tailleCm: profil.tailleCm, age: profil.age } : null,
    journal,
    seances: seances.filter((s) => s.date <= fin),
    mesures: mesures.map((m) => ({ date: m.date, poidsKg: m.poidsKg })),
    adaptations,
    consommations,
    statutsAliments,
  };
}

/** Ouvre le rapport dans un onglet et déclenche l'impression (→ PDF via le navigateur). */
export async function genererRapportPdf(
  depot: Depot,
  profil: Profil | null,
  depuis: string,
  fin: string,
): Promise<string> {
  const donnees = await rassemblerDonnees(depot, profil, depuis, fin);
  const html = construireRapportHtml(donnees);
  const fenetre = window.open('', '_blank');
  if (!fenetre) throw new Error('Impossible d’ouvrir la fenêtre d’impression (popup bloquée ?).');
  fenetre.document.write(html);
  fenetre.document.close();
  fenetre.focus();
  fenetre.print();
  return '';
}
