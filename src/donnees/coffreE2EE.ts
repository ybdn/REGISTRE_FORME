import { type CodecContenu, ErreurE2EE, chiffrerContenu, dechiffrerContenu } from './e2ee';

// Coffre runtime de l'E2EE : détient la clé dérivée EN MÉMOIRE pour la durée de la session.
// Choix produit (docs/07 §7.3, validé) : aucune persistance disque, sur mobile comme sur web.
// → re-saisie de la passphrase à chaque lancement ; rien de déchiffrable ne traîne sur l'appareil.
//
// Singleton module : le store y dépose la clé après activation/déverrouillage, et les codecs
// (creerCodecCoffre) la lisent à la volée à chaque chiffrement/déchiffrement.

let configure = false; // une MetaE2EE existe côté cloud (E2EE activé pour ce compte)
let cle: string | null = null; // clé AES-256 (base64) ; null = verrouillé

/** Marque l'E2EE comme activé (meta présente côté cloud) ou non. */
export function definirConfigureE2EE(actif: boolean): void {
  configure = actif;
}

/** Dépose (ou retire avec `null`) la clé dérivée en mémoire. */
export function definirCleE2EE(cleB64: string | null): void {
  cle = cleB64;
}

/** Oublie tout (déconnexion) : verrouille et efface la clé. */
export function effacerCoffreE2EE(): void {
  configure = false;
  cle = null;
}

/** Vrai si l'E2EE est activé pour ce compte (indépendamment du verrou). */
export function e2eeConfigure(): boolean {
  return configure;
}

/** Vrai si la clé est en mémoire (E2EE déverrouillé). */
export function e2eeDeverrouille(): boolean {
  return cle !== null;
}

/**
 * Codec adossé au coffre, injecté dans depotSupabase / transportSupabase.
 * - E2EE inactif → passe-plat (clair, comportement historique).
 * - E2EE activé mais verrouillé → refuse d'écrire en clair (sécurité) et de lire l'opaque.
 * - E2EE déverrouillé → chiffre/déchiffre avec la clé en mémoire.
 */
export function creerCodecCoffre(): CodecContenu {
  return {
    chiffrer(contenu) {
      if (!configure) return contenu;
      if (!cle) {
        throw new ErreurE2EE('Chiffrement verrouillé : déverrouille-le avant d’écrire.');
      }
      return chiffrerContenu(contenu, cle);
    },
    dechiffrer(valeur) {
      return dechiffrerContenu(valeur, cle);
    },
  };
}
