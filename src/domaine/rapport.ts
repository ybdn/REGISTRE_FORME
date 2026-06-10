// Rapport de synthèse pour le suivi gastro-entérologique (Incrément 6) — pur, sans dépendance Expo.
// Produit un HTML imprimable (converti en PDF par `src/donnees/rapportPdf.ts`).
// Objectif : donner au médecin une vue factuelle et datée des signaux Crohn et de l'activité,
// sans jamais se substituer à son jugement (disclaimer en pied de page).

import { SEUIL_DOULEUR, SEUIL_ENERGIE } from './constantes';
import type { DateISO, EntreeJournal, SeanceRealisee, TypeSeance } from './types';

/** Mesure réduite au strict nécessaire au rapport (évite de coupler le domaine à la couche données). */
export interface MesureRapport {
  date: DateISO;
  poidsKg?: number;
}

/** Adaptation appliquée, telle qu'archivée (pour la section traçabilité). */
export interface AdaptationRapport {
  date: DateISO;
  raison: string;
}

export interface DonneesRapport {
  genereLe: DateISO;
  periode: { debut: DateISO; fin: DateISO };
  profil: { tailleCm: number; age: number } | null;
  journal: EntreeJournal[];
  seances: SeanceRealisee[];
  mesures: MesureRapport[];
  adaptations: AdaptationRapport[];
}

const LIBELLE_TYPE: Record<TypeSeance, string> = {
  course: 'Course',
  salle: 'Salle',
  freeletics: 'Freeletics',
  sante: 'Santé',
};

/** Échappe le texte utilisateur avant insertion dans le HTML (notes, tags). */
function echapper(texte: string): string {
  return texte
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function moyenne(valeurs: number[]): number | null {
  if (valeurs.length === 0) return null;
  return valeurs.reduce((a, b) => a + b, 0) / valeurs.length;
}

function fmt(valeur: number | null, decimales = 1): string {
  return valeur === null ? '—' : valeur.toFixed(decimales);
}

/** Statistiques agrégées du journal Crohn sur la période. */
function syntheseJournal(journal: EntreeJournal[]) {
  const joursDegrades = journal.filter(
    (e) => e.douleur >= SEUIL_DOULEUR || e.energie <= SEUIL_ENERGIE,
  ).length;
  return {
    nbJours: journal.length,
    douleurMoy: moyenne(journal.map((e) => e.douleur)),
    douleurMax: journal.length ? Math.max(...journal.map((e) => e.douleur)) : null,
    energieMoy: moyenne(journal.map((e) => e.energie)),
    digestionMoy: moyenne(journal.map((e) => e.digestion)),
    sellesMoy: moyenne(journal.map((e) => e.nbSelles)),
    joursDegrades,
    joursAvecBallonnements: journal.filter((e) => e.ballonnements).length,
  };
}

/** Statistiques agrégées des séances réalisées sur la période. */
function syntheseSeances(seances: SeanceRealisee[]) {
  const parType = {} as Record<TypeSeance, number>;
  for (const s of seances) parType[s.type] = (parType[s.type] ?? 0) + 1;
  return {
    nb: seances.length,
    parType,
    kmCumules: seances.reduce((acc, s) => acc + (s.distanceKm ?? 0), 0),
    rpeMoy: moyenne(seances.map((s) => s.rpe)),
    chargeTotale: seances.reduce((acc, s) => acc + s.rpe * s.dureeMin, 0), // sRPE cumulé
  };
}

/** Construit le HTML imprimable du rapport gastro. Déterministe et testable. */
export function construireRapportHtml(d: DonneesRapport): string {
  const j = syntheseJournal(d.journal);
  const s = syntheseSeances(d.seances);

  const poids = d.mesures.filter((m) => m.poidsKg != null) as Required<MesureRapport>[];
  const poidsDebut = poids[0]?.poidsKg ?? null;
  const poidsFin = poids[poids.length - 1]?.poidsKg ?? null;
  const variationPoids = poidsDebut !== null && poidsFin !== null ? poidsFin - poidsDebut : null;

  const lignesType = (Object.keys(s.parType) as TypeSeance[])
    .map((t) => `${LIBELLE_TYPE[t]} : ${s.parType[t]}`)
    .join(' · ');

  const lignesAdaptations =
    d.adaptations.length > 0
      ? d.adaptations
          .map((a) => `<tr><td>${echapper(a.date)}</td><td>${echapper(a.raison)}</td></tr>`)
          .join('')
      : '<tr><td colspan="2" class="vide">Aucune adaptation appliquée sur la période.</td></tr>';

  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Rapport de suivi — REGISTRE.FORME</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, Roboto, Helvetica, Arial, sans-serif; color: #1a1f29; margin: 0; padding: 32px; font-size: 13px; line-height: 1.5; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  h2 { font-size: 15px; margin: 24px 0 8px; border-bottom: 2px solid #1a1f29; padding-bottom: 4px; }
  .meta { color: #5b6472; font-size: 12px; }
  .grille { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 8px; }
  .indic { flex: 1 1 140px; border: 1px solid #d4d9e0; border-radius: 8px; padding: 10px 12px; }
  .indic .v { font-size: 20px; font-weight: 600; }
  .indic .l { color: #5b6472; font-size: 11px; text-transform: uppercase; letter-spacing: .04em; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #e3e7ec; vertical-align: top; }
  th { font-size: 11px; text-transform: uppercase; color: #5b6472; }
  td.vide { color: #8a94a3; font-style: italic; }
  .alerte { color: #b3261e; }
  footer { margin-top: 32px; padding-top: 12px; border-top: 1px solid #d4d9e0; color: #5b6472; font-size: 11px; }
</style>
</head>
<body>
  <h1>Rapport de suivi REGISTRE.FORME</h1>
  <p class="meta">Période du ${echapper(d.periode.debut)} au ${echapper(d.periode.fin)} · généré le ${echapper(d.genereLe)}${
    d.profil ? ` · ${d.profil.age} ans · ${d.profil.tailleCm} cm` : ''
  }</p>

  <h2>Signaux Crohn</h2>
  <div class="grille">
    <div class="indic"><div class="v">${j.nbJours}</div><div class="l">Jours renseignés</div></div>
    <div class="indic"><div class="v">${fmt(j.douleurMoy)}</div><div class="l">Douleur moy. /10</div></div>
    <div class="indic"><div class="v">${j.douleurMax ?? '—'}</div><div class="l">Douleur max</div></div>
    <div class="indic"><div class="v">${fmt(j.energieMoy)}</div><div class="l">Énergie moy. /5</div></div>
    <div class="indic"><div class="v">${fmt(j.digestionMoy)}</div><div class="l">Digestion moy. /5</div></div>
    <div class="indic"><div class="v">${fmt(j.sellesMoy)}</div><div class="l">Selles / jour</div></div>
    <div class="indic"><div class="v ${j.joursDegrades > 0 ? 'alerte' : ''}">${j.joursDegrades}</div><div class="l">Jours dégradés</div></div>
    <div class="indic"><div class="v">${j.joursAvecBallonnements}</div><div class="l">Jours ballonnés</div></div>
  </div>
  <p class="meta">Jour dégradé = douleur ≥ ${SEUIL_DOULEUR}/10 ou énergie ≤ ${SEUIL_ENERGIE}/5.</p>

  <h2>Activité physique</h2>
  <div class="grille">
    <div class="indic"><div class="v">${s.nb}</div><div class="l">Séances réalisées</div></div>
    <div class="indic"><div class="v">${s.kmCumules.toFixed(1)}</div><div class="l">Km cumulés</div></div>
    <div class="indic"><div class="v">${fmt(s.rpeMoy)}</div><div class="l">RPE moyen /10</div></div>
    <div class="indic"><div class="v">${s.chargeTotale}</div><div class="l">Charge (sRPE)</div></div>
  </div>
  ${lignesType ? `<p class="meta">Répartition : ${echapper(lignesType)}</p>` : ''}

  <h2>Poids</h2>
  <div class="grille">
    <div class="indic"><div class="v">${poidsDebut !== null ? `${poidsDebut.toFixed(1)} kg` : '—'}</div><div class="l">Début de période</div></div>
    <div class="indic"><div class="v">${poidsFin !== null ? `${poidsFin.toFixed(1)} kg` : '—'}</div><div class="l">Fin de période</div></div>
    <div class="indic"><div class="v">${
      variationPoids !== null
        ? `${variationPoids > 0 ? '+' : ''}${variationPoids.toFixed(1)} kg`
        : '—'
    }</div><div class="l">Variation</div></div>
  </div>

  <h2>Adaptations appliquées</h2>
  <table>
    <thead><tr><th>Date</th><th>Décision du moteur</th></tr></thead>
    <tbody>${lignesAdaptations}</tbody>
  </table>

  <footer>
    Document généré localement par REGISTRE.FORME à des fins de suivi personnel. Il ne constitue
    pas un avis médical et ne remplace ni le suivi gastro-entérologique ni la validation du
    programme d'entraînement par un médecin.
  </footer>
</body>
</html>`;
}
