import {
  creerCodecCoffre,
  definirCleE2EE,
  definirConfigureE2EE,
  e2eeConfigure,
  e2eeDeverrouille,
  effacerCoffreE2EE,
} from '@/donnees/coffreE2EE';
import { ErreurE2EE, estContenuChiffre, initialiserMeta } from '@/donnees/e2ee';
import { afterEach, describe, expect, it } from 'vitest';

// Coffre runtime : le codec se comporte selon l'état (E2EE inactif / verrouillé / déverrouillé).
// Singleton module → on réinitialise après chaque test.

afterEach(() => effacerCoffreE2EE());

describe('coffreE2EE — codec adossé à la clé en mémoire', () => {
  it('passe-plat quand l’E2EE est inactif (comportement historique)', () => {
    const codec = creerCodecCoffre();
    const contenu = { date: '2026-06-14', douleur: 2 };
    expect(codec.chiffrer(contenu)).toBe(contenu);
    expect(codec.dechiffrer(contenu)).toBe(contenu);
    expect(e2eeConfigure()).toBe(false);
  });

  it('chiffre/déchiffre une fois déverrouillé', () => {
    const { cle } = initialiserMeta('passphrase-solide');
    definirConfigureE2EE(true);
    definirCleE2EE(cle);
    const codec = creerCodecCoffre();
    const contenu = { date: '2026-06-14', douleur: 2 };
    const chiffre = codec.chiffrer(contenu);
    expect(estContenuChiffre(chiffre)).toBe(true);
    expect(codec.dechiffrer(chiffre)).toEqual(contenu);
    expect(e2eeDeverrouille()).toBe(true);
  });

  it('refuse d’écrire en clair quand l’E2EE est activé mais verrouillé', () => {
    definirConfigureE2EE(true);
    definirCleE2EE(null);
    const codec = creerCodecCoffre();
    expect(() => codec.chiffrer({ x: 1 })).toThrow(ErreurE2EE);
  });
});
