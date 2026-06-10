import {
  ErreurSauvegarde,
  FORMAT_SAUVEGARDE,
  VERSION_SAUVEGARDE,
  analyserSauvegarde,
  construireSauvegarde,
  serialiserSauvegarde,
} from '@/domaine/sauvegarde';
import { describe, expect, it } from 'vitest';

describe('format de sauvegarde', () => {
  const tables = {
    profil: [{ id: 1, age: 30, taille_cm: 178 }],
    journal_crohn: [{ date: '2026-06-01', douleur: 2, energie: 4 }],
  };

  it('construit puis relit un instantané fidèlement (aller-retour)', () => {
    const s = construireSauvegarde(tables, '2026-06-10');
    const relu = analyserSauvegarde(serialiserSauvegarde(s));
    expect(relu.format).toBe(FORMAT_SAUVEGARDE);
    expect(relu.version).toBe(VERSION_SAUVEGARDE);
    expect(relu.exporteLe).toBe('2026-06-10');
    expect(relu.tables).toEqual(tables);
  });

  it('rejette un JSON illisible', () => {
    expect(() => analyserSauvegarde('pas du json')).toThrow(ErreurSauvegarde);
  });

  it('rejette un format étranger', () => {
    expect(() =>
      analyserSauvegarde(JSON.stringify({ format: 'autre', version: 1, tables: {} })),
    ).toThrow(/REGISTRE\.FORME/);
  });

  it('rejette une version non prise en charge', () => {
    const json = JSON.stringify({ format: FORMAT_SAUVEGARDE, version: 999, tables: {} });
    expect(() => analyserSauvegarde(json)).toThrow(/version/i);
  });

  it('rejette une sauvegarde sans tables exploitables', () => {
    const json = JSON.stringify({
      format: FORMAT_SAUVEGARDE,
      version: VERSION_SAUVEGARDE,
      tables: null,
    });
    expect(() => analyserSauvegarde(json)).toThrow(ErreurSauvegarde);
  });
});
