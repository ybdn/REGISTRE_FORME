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
  /** Mode poussée actif : le plan est en pause (cf. doc 02 §2.6). */
  modePousse: boolean;
  /** Date de déclaration de la poussée en cours (AAAA-MM-JJ), si active. */
  dateDebutPousse?: DateISO;
}

export interface ProfilRow {
  taille_cm: number;
  age: number;
  date_debut_programme: string;
  disclaimer_accepte: number;
  date_acceptation_disclaimer: string | null;
  sante_optin: number;
  mode_pousse: number;
  date_debut_pousse: string | null;
}

export function versProfil(r: ProfilRow): Profil {
  return {
    tailleCm: r.taille_cm,
    age: r.age,
    dateDebutProgramme: r.date_debut_programme,
    disclaimerAccepte: r.disclaimer_accepte === 1,
    dateAcceptationDisclaimer: r.date_acceptation_disclaimer ?? undefined,
    santeOptin: r.sante_optin === 1,
    modePousse: r.mode_pousse === 1,
    dateDebutPousse: r.date_debut_pousse ?? undefined,
  };
}

export async function lireProfil(db: SQLite.SQLiteDatabase): Promise<Profil | null> {
  const r = await db.getFirstAsync<ProfilRow>('SELECT * FROM profil WHERE id = 1');
  return r ? versProfil(r) : null;
}

export async function enregistrerProfil(db: SQLite.SQLiteDatabase, p: Profil): Promise<void> {
  // dirty=1 / maj_le : marque le profil à pousser au cloud (docs/07 §6.1, sync Phase 2).
  await db.runAsync(
    `INSERT OR REPLACE INTO profil
       (id, taille_cm, age, date_debut_programme, disclaimer_accepte, date_acceptation_disclaimer, sante_optin, mode_pousse, date_debut_pousse, dirty, maj_le)
     VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
    [
      p.tailleCm,
      p.age,
      p.dateDebutProgramme,
      p.disclaimerAccepte ? 1 : 0,
      p.dateAcceptationDisclaimer ?? null,
      p.santeOptin ? 1 : 0,
      p.modePousse ? 1 : 0,
      p.dateDebutPousse ?? null,
      new Date().toISOString(),
    ],
  );
}
