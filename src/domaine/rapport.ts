// Rapport de synthèse pour le suivi gastro-entérologique (Incrément 6) — pur, sans dépendance Expo.
// Produit un HTML imprimable (converti en PDF par `src/donnees/rapportPdf.ts`).
// Objectif : donner au médecin une vue factuelle et datée des signaux Crohn et de l'activité,
// sans jamais se substituer à son jugement (disclaimer en pied de page).

import { LIBELLES_STATUT, classerAliments } from './alimentation';
import { calculerBaseline } from './baseline';
import { SEUIL_DOULEUR, SEUIL_ENERGIE } from './constantes';
import { analyserTags } from './correlations';
import type {
  ConsommationJour,
  DateISO,
  EntreeJournal,
  SeanceRealisee,
  StatutAlimentManuel,
  TypeSeance,
} from './types';

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
  consommations: ConsommationJour[];
  statutsAliments: StatutAlimentManuel[];
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
    consistanceMoy: moyenne(journal.map((e) => e.consistanceSelles)),
    joursDegrades,
    joursAvecBallonnements: journal.filter((e) => e.ballonnements).length,
    joursAvecSang: journal.filter((e) => e.sangSelles).length,
    joursAvecGlaires: journal.filter((e) => e.glaires).length,
    joursAvecUrgence: journal.filter((e) => e.urgenceFecale).length,
    joursAvecDifficulteEvacuation: journal.filter((e) => e.difficulteEvacuation).length,
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

/** Tendance de la douleur sur la période (première moitié vs seconde). */
function tendanceDouleurPeriode(journal: EntreeJournal[]): string {
  if (journal.length < 4) return '—';
  const tries = [...journal].sort((a, b) => a.date.localeCompare(b.date));
  const milieu = Math.floor(tries.length / 2);
  const m1 = moyenne(tries.slice(0, milieu).map((e) => e.douleur));
  const m2 = moyenne(tries.slice(milieu).map((e) => e.douleur));
  if (m1 === null || m2 === null) return '—';
  const diff = m2 - m1;
  if (diff > 0.5) return `en hausse (${fmt(m1)} → ${fmt(m2)})`;
  if (diff < -0.5) return `en baisse (${fmt(m1)} → ${fmt(m2)})`;
  return `stable (~${fmt(m2)})`;
}

/** Construit le HTML imprimable du rapport gastro. Déterministe et testable. */
export function construireRapportHtml(d: DonneesRapport): string {
  const j = syntheseJournal(d.journal);
  const s = syntheseSeances(d.seances);

  // Baseline personnelle + tendance (§3.6) : « ta normale » et son évolution.
  const baseline = calculerBaseline(d.journal, d.periode.fin);
  const tendance = tendanceDouleurPeriode(d.journal);

  // Déclencheurs possibles (§3.6) : corrélations tag ↔ poussée, AVEC effectifs —
  // jamais de causalité affirmée, c'est le gastro qui juge.
  const correlations = analyserTags(d.journal, d.periode.fin);
  const lignesDeclencheurs =
    correlations.length > 0
      ? correlations
          .map(
            (c) =>
              `<tr><td>${echapper(c.tag)}</td><td>${c.nbAvecPoussee}/${c.occurrences}</td><td>${Math.round(
                c.pAvec * 100,
              )} %</td><td>${Math.round(c.pSans * 100)} %</td></tr>`,
          )
          .join('')
      : '<tr><td colspan="4" class="vide">Aucune corrélation significative (≥ 5 occurrences, ≥ 30 jours de journal).</td></tr>';

  const poids = d.mesures.filter((m) => m.poidsKg != null) as Required<MesureRapport>[];
  const poidsDebut = poids[0]?.poidsKg ?? null;
  const poidsFin = poids[poids.length - 1]?.poidsKg ?? null;
  const variationPoids = poidsDebut !== null && poidsFin !== null ? poidsFin - poidsDebut : null;

  const lignesType = (Object.keys(s.parType) as TypeSeance[])
    .map((t) => `${LIBELLE_TYPE[t]} : ${s.parType[t]}`)
    .join(' · ');

  // Alimentation : aliments classés (statut manuel posé par le patient, ou corrélation
  // auto avec effectifs) — même prudence que les déclencheurs, jamais de causalité.
  const aliments = classerAliments(d.consommations, d.statutsAliments, d.journal, d.periode.fin);
  const lignesAliments =
    aliments.length > 0
      ? aliments
          .map((a) => {
            const statut =
              a.statutManuel !== null
                ? `${LIBELLES_STATUT[a.statutManuel]} (patient)`
                : a.verdict === 'suspect'
                  ? 'suspect (corrélation)'
                  : 'neutre';
            const effectifs = a.correlation
              ? `${a.correlation.nbAvecPoussee}/${a.correlation.occurrences} · ${Math.round(
                  a.correlation.pAvec * 100,
                )} % avec · ${Math.round(a.correlation.pSans * 100)} % sans`
              : `${a.nbJoursConsomme} jour${a.nbJoursConsomme > 1 ? 's' : ''} de consommation`;
            return `<tr><td>${echapper(a.aliment)}</td><td>${echapper(statut)}</td><td>${effectifs}</td></tr>`;
          })
          .join('')
      : '<tr><td colspan="3" class="vide">Aucune consommation enregistrée sur la période.</td></tr>';

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
    <div class="indic"><div class="v">${fmt(j.consistanceMoy)}</div><div class="l">Bristol moy. /7</div></div>
    <div class="indic"><div class="v ${j.joursDegrades > 0 ? 'alerte' : ''}">${j.joursDegrades}</div><div class="l">Jours dégradés</div></div>
    <div class="indic"><div class="v">${j.joursAvecBallonnements}</div><div class="l">Jours ballonnés</div></div>
    <div class="indic"><div class="v ${j.joursAvecSang > 0 ? 'alerte' : ''}">${j.joursAvecSang}</div><div class="l">Jours avec sang</div></div>
    <div class="indic"><div class="v">${j.joursAvecGlaires}</div><div class="l">Jours avec glaires</div></div>
    <div class="indic"><div class="v">${j.joursAvecUrgence}</div><div class="l">Jours d'urgence fécale</div></div>
    <div class="indic"><div class="v">${j.joursAvecDifficulteEvacuation}</div><div class="l">Jours de constipation</div></div>
  </div>
  <p class="meta">Jour dégradé = douleur ≥ ${SEUIL_DOULEUR}/10 ou énergie ≤ ${SEUIL_ENERGIE}/5.${
    baseline !== null
      ? ` Baseline de douleur (médiane 28 j) : ${fmt(baseline.valeur)}/10. Tendance sur la période : ${tendance}.`
      : ` Tendance de la douleur sur la période : ${tendance}.`
  }</p>

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

  <h2>Déclencheurs possibles</h2>
  <table>
    <thead><tr><th>Tag</th><th>Poussées suivies</th><th>% avec</th><th>% sans</th></tr></thead>
    <tbody>${lignesDeclencheurs}</tbody>
  </table>
  <p class="meta">Une « poussée » = douleur au-dessus de la baseline dans les 48 h suivant le tag.
  Association observée, jamais une cause : l'interprétation revient au médecin.</p>

  <h2>Alimentation</h2>
  <table>
    <thead><tr><th>Aliment</th><th>Statut</th><th>Effectifs</th></tr></thead>
    <tbody>${lignesAliments}</tbody>
  </table>
  <p class="meta">Statut « (patient) » = posé manuellement. « Suspect » = les journées avec cet
  aliment sont plus souvent suivies d'une poussée dans les 48 h. Association observée, jamais une
  cause : l'interprétation revient au médecin.</p>

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
