import {
  ITERATIONS,
  type OctetsChiffres,
  chiffrerOctets,
  dechiffrerOctets,
  deriverCleB64,
  genererSelB64,
} from './chiffrement';

// Chiffrement de bout en bout (E2EE) du contenu synchronisé (docs/07 §7.3, ADR-006, Phase 3).
//
// Logique PURE (réutilise chiffrement.ts) → 100 % testable sans réseau ni émulateur.
// Principe : la clé est dérivée UNE fois d'une passphrase distincte du mot de passe Supabase, puis
// chaque `contenu` d'enregistrement est chiffré en enveloppe avant envoi. Supabase ne voit que de
// l'opaque ; il ne peut ni dériver la clé ni lire les données (la passphrase ne quitte pas le client).
//
// Partage multi-appareils : le sel et un « canari » (témoin chiffré) sont stockés une fois côté
// cloud dans `MetaE2EE`. Tout appareil saisissant la bonne passphrase re-dérive la MÊME clé et
// valide la passphrase via le canari (sans jamais l'envoyer). Le sel/canari ne sont pas secrets.

/** Marqueur de format d'une enveloppe de contenu chiffré (distinct de la sauvegarde fichier). */
export const FORMAT_CONTENU_E2EE = 'REGISTRE.FORME-e2ee';
const VERSION_CONTENU = 1;
/** Texte témoin chiffré dans le canari : son déchiffrement réussi prouve la bonne passphrase. */
const CANARI_CLAIR = 'REGISTRE.FORME-e2ee-canari-v1';
/** Longueur minimale de la passphrase E2EE (cohérent avec la sauvegarde fichier). */
export const LONGUEUR_MIN_PASSPHRASE = 8;

/** Erreur métier E2EE (message déjà rédigé pour l'utilisateur). */
export class ErreurE2EE extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ErreurE2EE';
  }
}

/** Enveloppe d'un contenu chiffré (stockée telle quelle dans la colonne `contenu` jsonb). */
export interface EnveloppeContenu extends OctetsChiffres {
  format: typeof FORMAT_CONTENU_E2EE;
  version: number;
}

/** Métadonnées E2EE partagées (stockées en clair côté cloud : ni le sel ni le canari ne sont secrets). */
export interface MetaE2EE {
  /** Sel PBKDF2 (base64), figé à l'activation → clé identique sur tous les appareils. */
  sel: string;
  /** Coût PBKDF2 utilisé pour dériver la clé. */
  iterations: number;
  /** Témoin connu chiffré : valide une passphrase saisie sur un nouvel appareil. */
  canari: EnveloppeContenu;
}

/**
 * Transforme le `contenu` avant écriture / après lecture côté Supabase. Injecté dans depotSupabase
 * et transportSupabase : par défaut l'identité (clair, comportement historique), ou la version
 * chiffrante quand l'E2EE est déverrouillé (cf. coffreE2EE.ts).
 */
export interface CodecContenu {
  /** Avant écriture : objet domaine → enveloppe chiffrée (ou tel quel si E2EE inactif). */
  chiffrer(contenu: unknown): unknown;
  /** Après lecture : enveloppe chiffrée → objet domaine (passe-plat si déjà en clair). */
  dechiffrer(valeur: unknown): unknown;
}

/** Codec neutre : aucune transformation (E2EE désactivé). */
export const codecIdentite: CodecContenu = {
  chiffrer: (contenu) => contenu,
  dechiffrer: (valeur) => valeur,
};

/** Vrai si la valeur est une enveloppe de contenu chiffré (vs. un objet domaine en clair). */
export function estContenuChiffre(valeur: unknown): valeur is EnveloppeContenu {
  return (
    typeof valeur === 'object' &&
    valeur !== null &&
    (valeur as { format?: unknown }).format === FORMAT_CONTENU_E2EE
  );
}

function chiffrerAvecCle(contenu: unknown, cle: string): EnveloppeContenu {
  const parts = chiffrerOctets(cle, JSON.stringify(contenu));
  return { format: FORMAT_CONTENU_E2EE, version: VERSION_CONTENU, ...parts };
}

function dechiffrerAvecCle(env: EnveloppeContenu, cle: string): unknown {
  const clair = dechiffrerOctets(cle, env);
  if (clair === null) {
    throw new ErreurE2EE('Contenu chiffré illisible (mauvaise clé ou donnée altérée).');
  }
  return JSON.parse(clair);
}

/** Première activation : génère le sel, dérive la clé, scelle le canari. Renvoie la clé (base64). */
export function initialiserMeta(passphrase: string): { meta: MetaE2EE; cle: string } {
  if (passphrase.length < LONGUEUR_MIN_PASSPHRASE) {
    throw new ErreurE2EE(
      `La phrase de chiffrement doit faire au moins ${LONGUEUR_MIN_PASSPHRASE} caractères.`,
    );
  }
  const sel = genererSelB64();
  const cle = deriverCleB64(passphrase, sel, ITERATIONS);
  const canari = chiffrerAvecCle(CANARI_CLAIR, cle);
  return { meta: { sel, iterations: ITERATIONS, canari }, cle };
}

/** Déverrouillage : re-dérive la clé et valide la passphrase via le canari. Lève si incorrecte. */
export function ouvrirMeta(passphrase: string, meta: MetaE2EE): string {
  const cle = deriverCleB64(passphrase, meta.sel, meta.iterations);
  let temoin: unknown;
  try {
    temoin = dechiffrerAvecCle(meta.canari, cle);
  } catch {
    throw new ErreurE2EE('Phrase de chiffrement incorrecte.');
  }
  if (temoin !== CANARI_CLAIR) {
    throw new ErreurE2EE('Phrase de chiffrement incorrecte.');
  }
  return cle;
}

/** Chiffre un contenu domaine (les tombstones `null`/`undefined` restent tels quels). */
export function chiffrerContenu(contenu: unknown, cle: string): unknown {
  if (contenu === null || contenu === undefined) return contenu;
  return chiffrerAvecCle(contenu, cle);
}

/**
 * Déchiffre un contenu lu côté cloud.
 * - Déjà en clair (donnée pré-E2EE / tombstone) → renvoyé tel quel (rétrocompatibilité).
 * - Chiffré sans clé disponible → lève (l'E2EE doit d'abord être déverrouillé).
 */
export function dechiffrerContenu(valeur: unknown, cle: string | null): unknown {
  if (!estContenuChiffre(valeur)) return valeur;
  if (!cle) {
    throw new ErreurE2EE('Données chiffrées : déverrouille le chiffrement de bout en bout.');
  }
  return dechiffrerAvecCle(valeur, cle);
}
