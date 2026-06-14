import { ErreurSauvegarde } from '@/domaine/sauvegarde';
import forge from 'node-forge';

// Chiffrement symétrique des sauvegardes (Incrément 6) et brique de base de l'E2EE (Phase 3).
// AES-256-GCM (confidentialité + intégrité authentifiée) ; clé dérivée de la phrase
// secrète utilisateur par PBKDF2-SHA256. Pur JS (node-forge) : fonctionne identiquement
// en React Native et sous Node (donc testable hors émulateur). Aucune sortie réseau.
//
// Deux niveaux d'API :
//   - haut niveau « sauvegarde fichier » : `chiffrer`/`dechiffrer` (enveloppe autoportée, sel
//     embarqué → 1 dérivation PBKDF2 par fichier).
//   - bas niveau « clé déjà dérivée » : `deriverCleB64` + `chiffrerOctets`/`dechiffrerOctets`.
//     L'E2EE par enregistrement dérive la clé UNE fois (coûteux) puis chiffre chaque contenu
//     avec cette clé partagée (cf. e2ee.ts) — sinon 150 000 itérations × N enregistrements.

const FORMAT_ENVELOPPE = 'REGISTRE.FORME-chiffre';
const VERSION_ENVELOPPE = 1;
export const ITERATIONS = 150_000; // coût PBKDF2 (compromis sécurité/perf mobile)
const TAILLE_SEL = 16; // octets
const TAILLE_IV = 12; // octets (recommandé pour GCM)
const TAILLE_CLE = 32; // 32 octets = AES-256

/** Enveloppe autodescriptive : tous les paramètres nécessaires au déchiffrement (sauf la clé). */
interface Enveloppe {
  format: string;
  version: number;
  kdf: 'PBKDF2-SHA256';
  iterations: number;
  cipher: 'AES-256-GCM';
  sel: string; // base64
  iv: string; // base64
  tag: string; // base64 (tag d'authentification GCM)
  donnees: string; // base64 (texte chiffré)
}

/** Triplet GCM autoportant (hors clé/sel) : ce qui suffit à déchiffrer avec une clé connue. */
export interface OctetsChiffres {
  iv: string; // base64
  tag: string; // base64
  donnees: string; // base64
}

function deriverCleRaw(passphrase: string, selRaw: string, iterations: number): string {
  return forge.pkcs5.pbkdf2(passphrase, selRaw, iterations, TAILLE_CLE, forge.md.sha256.create());
}

// ── Bas niveau : clé déjà dérivée (base64), réutilisable sur N chiffrements ────────────────

/** Sel aléatoire frais (base64), à mémoriser pour pouvoir re-dériver la même clé. */
export function genererSelB64(): string {
  return forge.util.encode64(forge.random.getBytesSync(TAILLE_SEL));
}

/** Dérive une clé AES-256 (base64) depuis une phrase secrète, un sel (base64) et un coût PBKDF2. */
export function deriverCleB64(passphrase: string, selB64: string, iterations: number): string {
  return forge.util.encode64(deriverCleRaw(passphrase, forge.util.decode64(selB64), iterations));
}

/** Chiffre un texte clair avec une clé déjà dérivée (base64). IV aléatoire à chaque appel. */
export function chiffrerOctets(cleB64: string, texteClair: string): OctetsChiffres {
  const cle = forge.util.decode64(cleB64);
  const iv = forge.random.getBytesSync(TAILLE_IV);
  const chiffreur = forge.cipher.createCipher('AES-GCM', cle);
  chiffreur.start({ iv });
  chiffreur.update(forge.util.createBuffer(texteClair, 'utf8'));
  if (!chiffreur.finish()) {
    throw new Error('Échec du chiffrement (AES-256-GCM).');
  }
  return {
    iv: forge.util.encode64(iv),
    tag: forge.util.encode64(chiffreur.mode.tag.getBytes()),
    donnees: forge.util.encode64(chiffreur.output.getBytes()),
  };
}

/**
 * Déchiffre un triplet GCM avec une clé déjà dérivée (base64).
 * Renvoie `null` si la clé est mauvaise ou le contenu altéré (échec de vérification du tag GCM) :
 * l'appelant traduit ce `null` en erreur métier (ErreurSauvegarde / ErreurE2EE).
 */
export function dechiffrerOctets(cleB64: string, parts: OctetsChiffres): string | null {
  const cle = forge.util.decode64(cleB64);
  const dechiffreur = forge.cipher.createDecipher('AES-GCM', cle);
  dechiffreur.start({
    iv: forge.util.decode64(parts.iv),
    tag: forge.util.createBuffer(forge.util.decode64(parts.tag), 'raw'),
  });
  dechiffreur.update(forge.util.createBuffer(forge.util.decode64(parts.donnees), 'raw'));
  if (!dechiffreur.finish()) return null;
  return forge.util.decodeUtf8(dechiffreur.output.getBytes());
}

// ── Haut niveau : sauvegarde fichier (enveloppe autoportée, sel embarqué) ───────────────────

/** Chiffre un texte clair avec une phrase secrète ; renvoie une enveloppe JSON (texte, partageable). */
export function chiffrer(texteClair: string, passphrase: string): string {
  if (passphrase.length === 0) {
    throw new ErreurSauvegarde('Une phrase secrète est requise pour chiffrer la sauvegarde.');
  }
  const sel = genererSelB64();
  const cle = deriverCleB64(passphrase, sel, ITERATIONS);
  const { iv, tag, donnees } = chiffrerOctets(cle, texteClair);

  const enveloppe: Enveloppe = {
    format: FORMAT_ENVELOPPE,
    version: VERSION_ENVELOPPE,
    kdf: 'PBKDF2-SHA256',
    iterations: ITERATIONS,
    cipher: 'AES-256-GCM',
    sel,
    iv,
    tag,
    donnees,
  };
  return JSON.stringify(enveloppe);
}

/**
 * Déchiffre une enveloppe produite par `chiffrer`.
 * Lève `ErreurSauvegarde` (message utilisateur) si le format est étranger, ou si la phrase
 * secrète est incorrecte / le contenu altéré (échec de vérification du tag GCM).
 */
export function dechiffrer(enveloppeJson: string, passphrase: string): string {
  let env: Partial<Enveloppe>;
  try {
    env = JSON.parse(enveloppeJson) as Partial<Enveloppe>;
  } catch {
    throw new ErreurSauvegarde('Fichier de sauvegarde illisible (format JSON invalide).');
  }
  if (env.format !== FORMAT_ENVELOPPE) {
    throw new ErreurSauvegarde('Ce fichier n’est pas une sauvegarde chiffrée REGISTRE.FORME.');
  }
  if (env.version !== VERSION_ENVELOPPE || !env.sel || !env.iv || !env.tag || !env.donnees) {
    throw new ErreurSauvegarde('Sauvegarde chiffrée incomplète ou non prise en charge.');
  }

  const cle = deriverCleB64(passphrase, env.sel, env.iterations ?? ITERATIONS);
  const clair = dechiffrerOctets(cle, { iv: env.iv, tag: env.tag, donnees: env.donnees });
  // null = tag GCM invalide : mauvaise phrase ou altération.
  if (clair === null) {
    throw new ErreurSauvegarde('Phrase secrète incorrecte ou sauvegarde corrompue.');
  }
  return clair;
}
