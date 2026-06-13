import { type DonneesRapport, construireRapportHtml } from '@/domaine/rapport';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import type { Depot } from './depot';
import type { Profil } from './profil';

// Rapport gastro en PDF (Incrément 6) : lit le dépôt sur la période, construit le HTML pur
// (domaine), le convertit en PDF (expo-print) et ouvre la feuille de partage. Aucun réseau.

/** Rassemble les données du rapport depuis le dépôt sur la fenêtre [depuis, fin]. */
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

/**
 * Génère le PDF du rapport gastro et ouvre le partage système.
 * Renvoie l'URI du PDF produit.
 */
export async function genererRapportPdf(
  depot: Depot,
  profil: Profil | null,
  depuis: string,
  fin: string,
): Promise<string> {
  const donnees = await rassemblerDonnees(depot, profil, depuis, fin);
  const html = construireRapportHtml(donnees);
  const { uri } = await Print.printToFileAsync({ html });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, {
      mimeType: 'application/pdf',
      dialogTitle: 'Rapport de suivi REGISTRE.FORME',
      UTI: 'com.adobe.pdf',
    });
  }
  return uri;
}
