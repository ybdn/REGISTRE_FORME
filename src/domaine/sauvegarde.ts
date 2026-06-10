// Format de sauvegarde/restauration de REGISTRE.FORME — pur, sans dépendance Expo/SQLite.
// La couche données (`src/donnees/sauvegarde.ts`) remplit `tables` depuis SQLite ;
// le chiffrement AES-256 vit dans `src/donnees/chiffrement.ts`. Ici : structure + validation.

import type { DateISO } from './types';

/** Version du FORMAT de sauvegarde (incrémentée si la structure change de façon incompatible). */
export const VERSION_SAUVEGARDE = 1;

/** Marqueur de format, pour refuser tout fichier étranger avant déchiffrement réussi. */
export const FORMAT_SAUVEGARDE = 'REGISTRE.FORME';

/** Une ligne de table = enregistrement clé→valeur sérialisable (représentation SQLite brute). */
export type LigneSauvegarde = Record<string, string | number | null>;

/** Instantané complet et autodescriptif de la base locale. */
export interface Sauvegarde {
  format: typeof FORMAT_SAUVEGARDE;
  version: number;
  exporteLe: DateISO;
  /** Données par nom de table (ordre = ordre de réinsertion). */
  tables: Record<string, LigneSauvegarde[]>;
}

/** Erreur métier de sauvegarde : message déjà rédigé pour l'utilisateur (affichable tel quel). */
export class ErreurSauvegarde extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ErreurSauvegarde';
  }
}

/** Assemble un instantané à partir des tables lues (la couche données fournit `tables`). */
export function construireSauvegarde(
  tables: Record<string, LigneSauvegarde[]>,
  exporteLe: DateISO,
): Sauvegarde {
  return { format: FORMAT_SAUVEGARDE, version: VERSION_SAUVEGARDE, exporteLe, tables };
}

/** Sérialise un instantané en JSON (texte clair, avant chiffrement). */
export function serialiserSauvegarde(s: Sauvegarde): string {
  return JSON.stringify(s);
}

/**
 * Analyse et valide un JSON de sauvegarde (après déchiffrement réussi).
 * Lève `ErreurSauvegarde` (message utilisateur) si le format ou la version ne conviennent pas.
 */
export function analyserSauvegarde(json: string): Sauvegarde {
  let brut: unknown;
  try {
    brut = JSON.parse(json);
  } catch {
    throw new ErreurSauvegarde('Sauvegarde illisible : contenu déchiffré invalide.');
  }
  if (typeof brut !== 'object' || brut === null) {
    throw new ErreurSauvegarde('Sauvegarde illisible : structure inattendue.');
  }
  const s = brut as Partial<Sauvegarde>;
  if (s.format !== FORMAT_SAUVEGARDE) {
    throw new ErreurSauvegarde('Ce fichier n’est pas une sauvegarde REGISTRE.FORME.');
  }
  if (s.version !== VERSION_SAUVEGARDE) {
    throw new ErreurSauvegarde(
      `Version de sauvegarde non prise en charge (${String(s.version)}). Mets l’application à jour.`,
    );
  }
  if (typeof s.tables !== 'object' || s.tables === null || Array.isArray(s.tables)) {
    throw new ErreurSauvegarde('Sauvegarde corrompue : aucune donnée exploitable.');
  }
  return {
    format: FORMAT_SAUVEGARDE,
    version: s.version,
    exporteLe: s.exporteLe ?? '',
    tables: s.tables,
  };
}
