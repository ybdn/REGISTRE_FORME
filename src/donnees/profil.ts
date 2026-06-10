import type { DateISO } from '@/domaine/types';
import type * as SQLite from 'expo-sqlite';

// Profil unique de l'utilisateur (ligne id = 1).

export interface Profil {
  tailleCm: number;
  age: number;
  dateDebutProgramme: DateISO; // lundi de la semaine 1
  disclaimerAccepte: boolean;
  dateAcceptationDisclaimer?: DateISO;
  santeOptin: boolean;
}

interface ProfilRow {
  taille_cm: number;
  age: number;
  date_debut_programme: string;
  disclaimer_accepte: number;
  date_acceptation_disclaimer: string | null;
  sante_optin: number;
}

export async function lireProfil(db: SQLite.SQLiteDatabase): Promise<Profil | null> {
  const r = await db.getFirstAsync<ProfilRow>('SELECT * FROM profil WHERE id = 1');
  if (!r) return null;
  return {
    tailleCm: r.taille_cm,
    age: r.age,
    dateDebutProgramme: r.date_debut_programme,
    disclaimerAccepte: r.disclaimer_accepte === 1,
    dateAcceptationDisclaimer: r.date_acceptation_disclaimer ?? undefined,
    santeOptin: r.sante_optin === 1,
  };
}

export async function enregistrerProfil(db: SQLite.SQLiteDatabase, p: Profil): Promise<void> {
  await db.runAsync(
    `INSERT OR REPLACE INTO profil
       (id, taille_cm, age, date_debut_programme, disclaimer_accepte, date_acceptation_disclaimer, sante_optin)
     VALUES (1, ?, ?, ?, ?, ?, ?)`,
    [
      p.tailleCm,
      p.age,
      p.dateDebutProgramme,
      p.disclaimerAccepte ? 1 : 0,
      p.dateAcceptationDisclaimer ?? null,
      p.santeOptin ? 1 : 0,
    ],
  );
}
