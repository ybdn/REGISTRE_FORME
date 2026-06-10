import { jourDeLaSemaine, numeroSemaine, programmeEnCours } from '@/domaine/planning';
import { describe, expect, it } from 'vitest';

describe('numeroSemaine', () => {
  it('renvoie 1 le jour du début et pendant la première semaine', () => {
    expect(numeroSemaine('2026-06-08', '2026-06-08')).toBe(1); // lundi
    expect(numeroSemaine('2026-06-08', '2026-06-14')).toBe(1); // dimanche S1
  });
  it('passe en semaine 2 au 8e jour', () => {
    expect(numeroSemaine('2026-06-08', '2026-06-15')).toBe(2);
  });
  it('clampe à 1 avant le début', () => {
    expect(numeroSemaine('2026-06-08', '2026-06-01')).toBe(1);
  });
});

describe('jourDeLaSemaine', () => {
  it('lundi = 0, dimanche = 6', () => {
    expect(jourDeLaSemaine('2026-06-08')).toBe(0); // lundi
    expect(jourDeLaSemaine('2026-06-10')).toBe(2); // mercredi
    expect(jourDeLaSemaine('2026-06-14')).toBe(6); // dimanche
  });
});

describe('programmeEnCours', () => {
  it('vrai pendant les 16 semaines', () => {
    expect(programmeEnCours('2026-06-08', '2026-06-08')).toBe(true);
    expect(programmeEnCours('2026-06-08', '2026-09-27')).toBe(true); // ~S16
  });
  it('faux après 16 semaines', () => {
    expect(programmeEnCours('2026-06-08', '2026-10-20')).toBe(false);
  });
});
