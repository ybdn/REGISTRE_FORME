import { type DonneesRapport, construireRapportHtml } from '@/domaine/rapport';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import type * as SQLite from 'expo-sqlite';
import { lireAdaptationsAppliquees, lireJournal, lireMesures, lireSeances } from './depots';
import type { Profil } from './profil';

// Rapport gastro en PDF (Incrément 6) : lit la base sur la période, construit le HTML pur
// (domaine), le convertit en PDF (expo-print) et ouvre la feuille de partage. Aucun réseau.

/** Rassemble les données du rapport depuis la base sur la fenêtre [depuis, fin]. */
async function rassemblerDonnees(
  db: SQLite.SQLiteDatabase,
  profil: Profil | null,
  depuis: string,
  fin: string,
): Promise<DonneesRapport> {
  const [journal, seances, mesures, adaptations] = await Promise.all([
    lireJournal(db, depuis),
    lireSeances(db, depuis),
    lireMesures(db, depuis),
    lireAdaptationsAppliquees(db, depuis),
  ]);
  return {
    genereLe: fin,
    periode: { debut: depuis, fin },
    profil: profil ? { tailleCm: profil.tailleCm, age: profil.age } : null,
    journal,
    seances: seances.filter((s) => s.date <= fin),
    mesures: mesures.map((m) => ({ date: m.date, poidsKg: m.poidsKg })),
    adaptations,
  };
}

/**
 * Génère le PDF du rapport gastro et ouvre le partage système.
 * Renvoie l'URI du PDF produit.
 */
export async function genererRapportPdf(
  db: SQLite.SQLiteDatabase,
  profil: Profil | null,
  depuis: string,
  fin: string,
): Promise<string> {
  const donnees = await rassemblerDonnees(db, profil, depuis, fin);
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
