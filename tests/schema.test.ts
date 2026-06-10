import { MIGRATIONS, VERSION_CIBLE } from '@/donnees/schema';
import { describe, expect, it } from 'vitest';

describe('migrations SQLite', () => {
  it('les versions sont uniques et croissantes', () => {
    const versions = MIGRATIONS.map((m) => m.version);
    expect(new Set(versions).size).toBe(versions.length);
    const triees = [...versions].sort((a, b) => a - b);
    expect(versions).toEqual(triees);
  });

  it('VERSION_CIBLE = plus haute version', () => {
    expect(VERSION_CIBLE).toBe(Math.max(...MIGRATIONS.map((m) => m.version)));
  });

  it('chaque migration porte un SQL non vide et un nom', () => {
    for (const m of MIGRATIONS) {
      expect(m.sql.trim().length).toBeGreaterThan(0);
      expect(m.nom.length).toBeGreaterThan(0);
    }
  });

  it('le schéma initial crée les tables clés', () => {
    const sql = MIGRATIONS[0]?.sql ?? '';
    for (const table of [
      'profil',
      'journal_crohn',
      'seance_planifiee',
      'seance_realisee',
      'mesure_corporelle',
      'adaptation',
    ]) {
      expect(sql).toContain(`CREATE TABLE IF NOT EXISTS ${table}`);
    }
  });
});
