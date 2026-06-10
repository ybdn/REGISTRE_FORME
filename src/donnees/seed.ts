import { genererProgramme } from '@/domaine/generateurSemaines';
import type * as SQLite from 'expo-sqlite';

// Insère le programme 16 semaines dans `seance_planifiee` (idempotent : ne réinsère pas si déjà peuplé).

export async function programmeDejaSeede(db: SQLite.SQLiteDatabase): Promise<boolean> {
  const ligne = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM seance_planifiee');
  return (ligne?.n ?? 0) > 0;
}

export async function seederProgramme(db: SQLite.SQLiteDatabase): Promise<void> {
  if (await programmeDejaSeede(db)) return;

  const programme = genererProgramme();
  await db.withExclusiveTransactionAsync(async (tx) => {
    for (const semaine of programme) {
      for (const [index, s] of semaine.seances.entries()) {
        const id = `S${semaine.numero}-${index}`;
        await tx.runAsync(
          `INSERT INTO seance_planifiee
             (id, semaine, phase, jour, type, modele, titre, est_decharge, est_test_chrono)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            semaine.numero,
            semaine.phase,
            s.jour,
            s.type,
            s.modele,
            s.titre,
            semaine.estDecharge ? 1 : 0,
            semaine.estTestChrono ? 1 : 0,
          ],
        );
      }
    }
  });
}
