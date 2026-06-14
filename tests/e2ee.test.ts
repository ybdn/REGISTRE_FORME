import {
  ErreurE2EE,
  chiffrerContenu,
  dechiffrerContenu,
  estContenuChiffre,
  initialiserMeta,
  ouvrirMeta,
} from '@/donnees/e2ee';
import { describe, expect, it } from 'vitest';

// E2EE du contenu synchronisé (docs/07 §7.3, Phase 3). Logique pure, testée hors réseau.

describe('e2ee — méta, canari et dérivation de clé', () => {
  it('ouvre la méta avec la bonne passphrase (clé identique → multi-appareils)', () => {
    const { meta, cle } = initialiserMeta('passphrase-solide');
    // Un autre appareil re-dérive LA MÊME clé à partir de la méta partagée.
    expect(ouvrirMeta('passphrase-solide', meta)).toBe(cle);
  });

  it('rejette une passphrase incorrecte (canari)', () => {
    const { meta } = initialiserMeta('la-bonne-phrase');
    expect(() => ouvrirMeta('mauvaise-phrase', meta)).toThrow(ErreurE2EE);
  });

  it('refuse une passphrase trop courte à l’activation', () => {
    expect(() => initialiserMeta('court')).toThrow(ErreurE2EE);
  });
});

describe('e2ee — chiffrement du contenu', () => {
  it('déchiffre ce qu’il a chiffré (aller-retour d’un objet domaine)', () => {
    const { cle } = initialiserMeta('passphrase-solide');
    const contenu = { date: '2026-06-14', douleur: 3, note: 'énergie — accents OK 日本語' };
    const env = chiffrerContenu(contenu, cle);
    expect(estContenuChiffre(env)).toBe(true);
    expect(dechiffrerContenu(env, cle)).toEqual(contenu);
  });

  it('produit une enveloppe opaque (le clair n’y apparaît pas)', () => {
    const { cle } = initialiserMeta('passphrase-solide');
    const env = chiffrerContenu({ secret: 'REPERABLE_123' }, cle);
    expect(JSON.stringify(env)).not.toContain('REPERABLE_123');
  });

  it('laisse passer un contenu déjà en clair (rétrocompatibilité pré-E2EE)', () => {
    const { cle } = initialiserMeta('passphrase-solide');
    const clair = { date: '2026-06-14', poids: 70 };
    expect(estContenuChiffre(clair)).toBe(false);
    expect(dechiffrerContenu(clair, cle)).toEqual(clair);
  });

  it('laisse passer les tombstones (null) sans chiffrer', () => {
    const { cle } = initialiserMeta('passphrase-solide');
    expect(chiffrerContenu(null, cle)).toBeNull();
    expect(dechiffrerContenu(null, cle)).toBeNull();
  });

  it('refuse de déchiffrer un contenu chiffré sans clé (verrouillé)', () => {
    const { cle } = initialiserMeta('passphrase-solide');
    const env = chiffrerContenu({ x: 1 }, cle);
    expect(() => dechiffrerContenu(env, null)).toThrow(ErreurE2EE);
  });

  it('refuse de déchiffrer avec une clé étrangère', () => {
    const a = initialiserMeta('phrase-a');
    const b = initialiserMeta('phrase-b');
    const env = chiffrerContenu({ x: 1 }, a.cle);
    expect(() => dechiffrerContenu(env, b.cle)).toThrow(ErreurE2EE);
  });
});
