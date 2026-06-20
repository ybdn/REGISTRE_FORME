import { type DonneesRapport, construireRapportHtml } from '@/domaine/rapport';
import type { EntreeJournal, SeanceRealisee } from '@/domaine/types';
import { describe, expect, it } from 'vitest';

function entree(p: Partial<EntreeJournal> & Pick<EntreeJournal, 'date'>): EntreeJournal {
  return {
    douleur: 0,
    energie: 5,
    digestion: 5,
    nbSelles: 1,
    consistanceSelles: 4,
    sangSelles: false,
    glaires: false,
    urgenceFecale: false,
    difficulteEvacuation: false,
    ballonnements: false,
    tags: [],
    ...p,
  };
}

function seance(p: Partial<SeanceRealisee> & Pick<SeanceRealisee, 'id' | 'date'>): SeanceRealisee {
  return { type: 'course', variante: 'normale', rpe: 6, dureeMin: 30, ...p };
}

const baseVide: DonneesRapport = {
  genereLe: '2026-06-10',
  periode: { debut: '2026-03-12', fin: '2026-06-10' },
  profil: null,
  journal: [],
  seances: [],
  mesures: [],
  adaptations: [],
  consommations: [],
  statutsAliments: [],
};

describe('construireRapportHtml', () => {
  it('produit un document HTML complet daté de la période', () => {
    const html = construireRapportHtml(baseVide);
    expect(html).toContain('<!doctype html>');
    expect(html).toContain('REGISTRE.FORME');
    expect(html).toContain('2026-03-12');
    expect(html).toContain('2026-06-10');
  });

  it('compte les jours dégradés (douleur ≥ 5 ou énergie ≤ 2)', () => {
    const html = construireRapportHtml({
      ...baseVide,
      journal: [
        entree({ date: '2026-06-01', douleur: 6 }), // dégradé (douleur)
        entree({ date: '2026-06-02', energie: 1 }), // dégradé (énergie)
        entree({ date: '2026-06-03', douleur: 1, energie: 5 }), // ok
      ],
    });
    // 3 jours renseignés, 2 dégradés.
    expect(html).toContain('Jours dégradés');
    expect(html).toMatch(/>2<\/div><div class="l">Jours dégradés/);
  });

  it('agrège les séances (nombre, km, charge sRPE)', () => {
    const html = construireRapportHtml({
      ...baseVide,
      seances: [
        seance({ id: 'a', date: '2026-06-01', distanceKm: 5, rpe: 6, dureeMin: 30 }),
        seance({ id: 'b', date: '2026-06-03', distanceKm: 3, rpe: 8, dureeMin: 20 }),
      ],
    });
    expect(html).toContain('8.0'); // km cumulés
    // sRPE = 6*30 + 8*20 = 340
    expect(html).toContain('340');
  });

  it('calcule la variation de poids sur la période', () => {
    const html = construireRapportHtml({
      ...baseVide,
      mesures: [
        { date: '2026-03-12', poidsKg: 70 },
        { date: '2026-06-10', poidsKg: 72.5 },
      ],
    });
    expect(html).toContain('+2.5 kg');
  });

  it('échappe le texte des adaptations (anti-injection HTML)', () => {
    const html = construireRapportHtml({
      ...baseVide,
      adaptations: [{ date: '2026-06-01', raison: 'Allègement <script>alert(1)</script>' }],
    });
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('reste lisible sans aucune donnée', () => {
    const html = construireRapportHtml(baseVide);
    expect(html).toContain('Aucune adaptation appliquée');
    expect(html).toContain('Aucune consommation enregistrée');
  });

  it('liste les aliments avec statut manuel daté « (patient) », nom échappé', () => {
    const html = construireRapportHtml({
      ...baseVide,
      consommations: [{ date: '2026-06-01', aliments: ['<b>pizza</b>'] }],
      statutsAliments: [{ aliment: '<b>pizza</b>', statut: 'a-eviter', dateMaj: '2026-06-02' }],
    });
    expect(html).toContain('Alimentation');
    expect(html).toContain('à éviter (patient)');
    expect(html).not.toContain('<b>pizza</b>');
    expect(html).toContain('&lt;b&gt;pizza&lt;/b&gt;');
  });
});
