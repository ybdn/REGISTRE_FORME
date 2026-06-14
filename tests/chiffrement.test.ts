import { ErreurSauvegarde } from '@/domaine/sauvegarde';
import {
  ITERATIONS,
  chiffrer,
  chiffrerOctets,
  dechiffrer,
  dechiffrerOctets,
  deriverCleB64,
  genererSelB64,
} from '@/donnees/chiffrement';
import { describe, expect, it } from 'vitest';

describe('chiffrement AES-256-GCM des sauvegardes', () => {
  it('déchiffre ce qu’il a chiffré (aller-retour, accents inclus)', () => {
    const clair = 'Données privées — douleur, énergie, digestion. 日本語 aussi.';
    const enveloppe = chiffrer(clair, 'phrase-secrète-solide');
    expect(dechiffrer(enveloppe, 'phrase-secrète-solide')).toBe(clair);
  });

  it('produit une enveloppe qui ne contient pas le texte clair', () => {
    const enveloppe = chiffrer('SECRET_REPERABLE', 'pass');
    expect(enveloppe).not.toContain('SECRET_REPERABLE');
  });

  it('produit un texte chiffré différent à chaque appel (sel + IV aléatoires)', () => {
    const a = chiffrer('même contenu', 'pass');
    const b = chiffrer('même contenu', 'pass');
    expect(a).not.toBe(b);
    expect(dechiffrer(a, 'pass')).toBe('même contenu');
    expect(dechiffrer(b, 'pass')).toBe('même contenu');
  });

  it('refuse une phrase secrète incorrecte (échec d’authentification GCM)', () => {
    const enveloppe = chiffrer('contenu', 'bonne-phrase');
    expect(() => dechiffrer(enveloppe, 'mauvaise-phrase')).toThrow(ErreurSauvegarde);
  });

  it('refuse un contenu altéré', () => {
    const env = JSON.parse(chiffrer('contenu', 'pass'));
    env.donnees = `${env.donnees}AAAA`; // corruption du texte chiffré
    expect(() => dechiffrer(JSON.stringify(env), 'pass')).toThrow(ErreurSauvegarde);
  });

  it('refuse un fichier d’un format étranger', () => {
    expect(() => dechiffrer('{"format":"autre"}', 'pass')).toThrow(/REGISTRE\.FORME/);
  });

  it('exige une phrase secrète non vide pour chiffrer', () => {
    expect(() => chiffrer('x', '')).toThrow(ErreurSauvegarde);
  });
});

describe('chiffrement — primitives clé déjà dérivée (E2EE)', () => {
  it('déchiffre un triplet GCM avec la clé qui a chiffré', () => {
    const cle = deriverCleB64('passphrase', genererSelB64(), ITERATIONS);
    const clair = 'contenu — accents é è 日本語';
    const parts = chiffrerOctets(cle, clair);
    expect(dechiffrerOctets(cle, parts)).toBe(clair);
  });

  it('même sel + même passphrase → même clé (partage multi-appareils)', () => {
    const sel = genererSelB64();
    expect(deriverCleB64('p', sel, ITERATIONS)).toBe(deriverCleB64('p', sel, ITERATIONS));
  });

  it('renvoie null (et non une erreur) sur une mauvaise clé', () => {
    const sel = genererSelB64();
    const parts = chiffrerOctets(deriverCleB64('bonne', sel, ITERATIONS), 'x');
    expect(dechiffrerOctets(deriverCleB64('mauvaise', sel, ITERATIONS), parts)).toBeNull();
  });
});
