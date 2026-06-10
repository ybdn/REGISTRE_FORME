import {
  appliquerDecharge,
  deplacerSeance,
  genererProgramme,
  phasePourSemaine,
} from '@/domaine/generateurSemaines';
import { describe, expect, it } from 'vitest';

describe('phasePourSemaine', () => {
  it('découpe les 3 phases aux bonnes bornes', () => {
    expect(phasePourSemaine(1)).toBe('reprise');
    expect(phasePourSemaine(4)).toBe('reprise');
    expect(phasePourSemaine(5)).toBe('construction');
    expect(phasePourSemaine(10)).toBe('construction');
    expect(phasePourSemaine(11)).toBe('performance');
    expect(phasePourSemaine(16)).toBe('performance');
  });
});

describe('genererProgramme', () => {
  const programme = genererProgramme();

  it('produit exactement 16 semaines numérotées 1→16', () => {
    expect(programme).toHaveLength(16);
    expect(programme.map((s) => s.numero)).toEqual(Array.from({ length: 16 }, (_, i) => i + 1));
  });

  it('chaque semaine compte 3 séances', () => {
    for (const semaine of programme) {
      expect(semaine.seances).toHaveLength(3);
    }
  });

  it('place les séances sur lundi / mercredi / samedi par défaut', () => {
    for (const semaine of programme) {
      expect(semaine.seances.map((s) => s.jour)).toEqual([0, 2, 5]);
    }
  });

  it('marque les semaines de test chronométré 14 et 16', () => {
    expect(programme.find((s) => s.numero === 14)?.estTestChrono).toBe(true);
    expect(programme.find((s) => s.numero === 16)?.estTestChrono).toBe(true);
    expect(programme.find((s) => s.numero === 13)?.estTestChrono).toBe(false);
  });

  it('les semaines de test contiennent une séance test-3000', () => {
    const s14 = programme.find((s) => s.numero === 14);
    expect(s14?.seances.some((s) => s.modele === 'test-3000')).toBe(true);
  });

  it('la phase reprise utilise course EF, la performance la VMA/sortie longue', () => {
    const s1 = programme.find((s) => s.numero === 1);
    expect(s1?.seances.some((s) => s.modele === 'course-ef')).toBe(true);
    const s11 = programme.find((s) => s.numero === 11);
    expect(s11?.seances.some((s) => s.modele === 'course-vma')).toBe(true);
    expect(s11?.seances.some((s) => s.modele === 'course-longue')).toBe(true);
  });

  it('aucune semaine n’est marquée décharge à la génération', () => {
    expect(programme.every((s) => s.estDecharge === false)).toBe(true);
  });
});

describe('appliquerDecharge', () => {
  it('réduit le volume (~60 % des séances conservées) et bascule en séances santé', () => {
    const semaine = genererProgramme()[4]; // semaine 5, construction
    if (!semaine) throw new Error('semaine introuvable');
    const decharge = appliquerDecharge(semaine);
    expect(decharge.estDecharge).toBe(true);
    expect(decharge.seances.length).toBe(2); // round(3 * 0.6) = 2
    expect(decharge.seances.every((s) => s.type === 'sante')).toBe(true);
  });

  it('est immuable : la semaine d’origine est inchangée', () => {
    const semaine = genererProgramme()[0];
    if (!semaine) throw new Error('semaine introuvable');
    const avant = semaine.seances.length;
    appliquerDecharge(semaine);
    expect(semaine.estDecharge).toBe(false);
    expect(semaine.seances.length).toBe(avant);
  });
});

describe('deplacerSeance', () => {
  it('déplace une séance vers un nouveau jour', () => {
    const semaine = genererProgramme()[0];
    if (!semaine) throw new Error('semaine introuvable');
    const modifie = deplacerSeance(semaine, 1, 3); // course → jeudi
    expect(modifie.seances[1]?.jour).toBe(3);
    expect(semaine.seances[1]?.jour).toBe(2); // immuable
  });

  it('refuse un jour hors plage', () => {
    const semaine = genererProgramme()[0];
    if (!semaine) throw new Error('semaine introuvable');
    expect(() => deplacerSeance(semaine, 0, 7)).toThrow();
  });
});
