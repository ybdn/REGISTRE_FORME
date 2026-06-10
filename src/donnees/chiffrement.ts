import { ErreurSauvegarde } from '@/domaine/sauvegarde';
import forge from 'node-forge';

// Chiffrement symétrique des sauvegardes (Incrément 6).
// AES-256-GCM (confidentialité + intégrité authentifiée) ; clé dérivée de la phrase
// secrète utilisateur par PBKDF2-SHA256. Pur JS (node-forge) : fonctionne identiquement
// en React Native et sous Node (donc testable hors émulateur). Aucune sortie réseau.

const FORMAT_ENVELOPPE = 'REGISTRE.FORME-chiffre';
const VERSION_ENVELOPPE = 1;
const ITERATIONS = 150_000; // coût PBKDF2 (compromis sécurité/perf mobile)
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

function deriverCle(passphrase: string, sel: string, iterations: number): string {
  return forge.pkcs5.pbkdf2(passphrase, sel, iterations, TAILLE_CLE, forge.md.sha256.create());
}

/** Chiffre un texte clair avec une phrase secrète ; renvoie une enveloppe JSON (texte, partageable). */
export function chiffrer(texteClair: string, passphrase: string): string {
  if (passphrase.length === 0) {
    throw new ErreurSauvegarde('Une phrase secrète est requise pour chiffrer la sauvegarde.');
  }
  const sel = forge.random.getBytesSync(TAILLE_SEL);
  const iv = forge.random.getBytesSync(TAILLE_IV);
  const cle = deriverCle(passphrase, sel, ITERATIONS);

  const chiffreur = forge.cipher.createCipher('AES-GCM', cle);
  chiffreur.start({ iv });
  chiffreur.update(forge.util.createBuffer(texteClair, 'utf8'));
  if (!chiffreur.finish()) {
    throw new ErreurSauvegarde('Échec du chiffrement de la sauvegarde.');
  }

  const enveloppe: Enveloppe = {
    format: FORMAT_ENVELOPPE,
    version: VERSION_ENVELOPPE,
    kdf: 'PBKDF2-SHA256',
    iterations: ITERATIONS,
    cipher: 'AES-256-GCM',
    sel: forge.util.encode64(sel),
    iv: forge.util.encode64(iv),
    tag: forge.util.encode64(chiffreur.mode.tag.getBytes()),
    donnees: forge.util.encode64(chiffreur.output.getBytes()),
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

  const sel = forge.util.decode64(env.sel);
  const iv = forge.util.decode64(env.iv);
  const tag = forge.util.decode64(env.tag);
  const donnees = forge.util.decode64(env.donnees);
  const cle = deriverCle(passphrase, sel, env.iterations ?? ITERATIONS);

  const dechiffreur = forge.cipher.createDecipher('AES-GCM', cle);
  dechiffreur.start({ iv, tag: forge.util.createBuffer(tag, 'raw') });
  dechiffreur.update(forge.util.createBuffer(donnees, 'raw'));
  // finish() renvoie false si le tag GCM ne correspond pas : mauvaise phrase ou altération.
  if (!dechiffreur.finish()) {
    throw new ErreurSauvegarde('Phrase secrète incorrecte ou sauvegarde corrompue.');
  }
  return forge.util.decodeUtf8(dechiffreur.output.getBytes());
}
