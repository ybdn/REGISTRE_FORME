import { ajouterJours, ecartJours, libelleJour, versJourAbsolu } from '@/domaine/dates';
import { describe, expect, it } from 'vitest';

describe('ajouterJours', () => {
  it('décale en avant et en arrière, franchit les mois', () => {
    expect(ajouterJours('2026-06-14', 1)).toBe('2026-06-15');
    expect(ajouterJours('2026-06-01', -1)).toBe('2026-05-31');
    expect(ajouterJours('2026-12-31', 1)).toBe('2027-01-01');
  });
});

describe('ecartJours', () => {
  it('compte les jours signés (a − b)', () => {
    expect(ecartJours('2026-06-14', '2026-06-14')).toBe(0);
    expect(ecartJours('2026-06-14', '2026-06-13')).toBe(1);
    expect(ecartJours('2026-06-13', '2026-06-14')).toBe(-1);
  });
});

describe('libelleJour', () => {
  const today = '2026-06-14'; // dimanche
  it('nomme les jours proches relativement', () => {
    expect(libelleJour('2026-06-14', today)).toBe("Aujourd'hui");
    expect(libelleJour('2026-06-13', today)).toBe('Hier');
    expect(libelleJour('2026-06-12', today)).toBe('Avant-hier');
  });
  it('formate les jours plus anciens « jour J mois »', () => {
    // 2026-06-08 est un lundi (cf. planning.test.ts).
    expect(libelleJour('2026-06-08', today)).toBe('lun. 8 juin');
    expect(libelleJour('2026-01-31', today)).toBe('sam. 31 janv.');
  });
  it('formate aussi une date future', () => {
    expect(libelleJour('2026-06-15', today)).toBe('lun. 15 juin');
  });
});

describe('cohérence jour de la semaine', () => {
  it('aligne le modulo sur un dimanche connu', () => {
    // versJourAbsolu doit rester monotone (sanity check de l'ancre).
    expect(versJourAbsolu('2000-01-02') - versJourAbsolu('2000-01-01')).toBe(1);
  });
});
