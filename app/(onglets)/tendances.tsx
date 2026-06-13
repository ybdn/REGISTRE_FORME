import {
  Carte,
  Corps,
  Courbe,
  Ecran,
  LigneInfo,
  LigneNavigation,
  SousTitre,
} from '@/design/composants';
import { couleurs, espace, rayon, typo } from '@/design/theme';
import {
  type CelluleHeatmap,
  LIBELLES_STATUT,
  NB_SEMAINES_HEATMAP,
  type SemaineCharge,
  analyserTags,
  calculerRecords,
  classerAliments,
  heatmapForme,
  moyenneMobile,
  serieChargeHebdo,
  serieSante,
} from '@/domaine';
import { useMagasin } from '@/etat/magasin';
import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

// Écran Tendances (cf. doc 03 §3.4) : des affirmations sourcées, vérifiables, pas
// seulement des données. Tout est calculé localement à l'ouverture, sans réseau.

const NB_SEMAINES_CHARGE = 8;

/** Couleur d'une case de heatmap selon le score de forme (vert = forme, rouge = dégradé). */
function couleurScore(score: number | null): string {
  if (score === null) return couleurs.fond;
  if (score >= 75) return couleurs.freeletics;
  if (score >= 50) return couleurs.course;
  if (score >= 30) return couleurs.ambre;
  return couleurs.sante;
}

export default function EcranTendances() {
  const router = useRouter();
  const { journal, seances, mesures, consommations, statutsAliments, aujourdhui } = useMagasin();

  const heatmap = heatmapForme(journal, seances, aujourdhui, NB_SEMAINES_HEATMAP * 7);
  const charge = serieChargeHebdo(seances, aujourdhui, NB_SEMAINES_CHARGE);
  const sante = serieSante(journal, aujourdhui, NB_SEMAINES_CHARGE);
  const records = calculerRecords(seances, journal, aujourdhui);
  const correlations = analyserTags(journal, aujourdhui);
  // « À surveiller » = signaux et précautions seulement : un aliment toléré n'en fait pas partie.
  const alimentsASurveiller = classerAliments(consommations, statutsAliments, journal, aujourdhui)
    .filter((c) => c.verdict !== 'neutre' && c.verdict !== 'tolere')
    .slice(0, 5);

  const poids = mesures
    .filter((m) => m.poidsKg !== undefined)
    .map((m) => ({ date: m.date, valeur: m.poidsKg as number }));
  const poidsLisse = moyenneMobile(poids);

  return (
    <Ecran>
      {/* Le rendez-vous du dimanche : synthèse + un insight + une décision. */}
      <LigneNavigation
        titre="Bilan hebdo"
        detail="Charge, santé, progression et décision de la semaine"
        icone="calendar"
        couleur={couleurs.course}
        onPress={() => router.push('/bilan')}
      />

      {/* Heatmap 16 semaines : intensité = forme, point = séance réalisée. */}
      <Carte>
        <SousTitre>Forme · 16 semaines</SousTitre>
        <Heatmap cellules={heatmap} />
        <Corps style={styles.legende}>
          Chaque case = un jour ; sa couleur reflète le score de forme. Le point marque une séance
          réalisée.
        </Corps>
      </Carte>

      {/* Charge hebdo sRPE + santé superposée — le graphe à montrer au gastro. */}
      <Carte>
        <SousTitre>Charge & santé · 8 semaines</SousTitre>
        <GrapheCharge charge={charge} />
        <View style={styles.lignesSante}>
          {sante.map((s) => (
            <Text key={s.fin} style={styles.santeMini}>
              {s.douleur !== null ? `D${Math.round(s.douleur)}` : '·'}
            </Text>
          ))}
        </View>
        <Corps style={styles.legende}>
          Barres : charge d’entraînement (sRPE) par semaine. Ligne D : douleur moyenne. La charge
          chronique sert de repère ; au-delà, le risque de surmenage augmente.
        </Corps>
      </Carte>

      {/* Poids lissé 7 j (le seul interprétable sous MICI). */}
      {poidsLisse.length >= 2 ? (
        <Carte>
          <SousTitre>Poids lissé (moyenne 7 j)</SousTitre>
          <Courbe valeurs={poidsLisse.map((p) => p.valeur)} couleur={couleurs.salle} />
          <Corps style={styles.legende}>
            Sous MICI, le poids fluctue avec l’hydratation et l’inflammation : seule la moyenne
            mobile est interprétable.
          </Corps>
        </Carte>
      ) : null}

      {/* Records personnels. */}
      <Carte>
        <SousTitre>Records personnels</SousTitre>
        {records.salle.length === 0 && !records.course.meilleur3000 ? (
          <Corps>Pas encore de record : enregistre des séances pour les voir apparaître.</Corps>
        ) : (
          <>
            {records.salle.slice(0, 5).map((r) => (
              <LigneInfo key={r.exercice} libelle={r.exercice} valeur={`${r.e1rm} kg (1RM est.)`} />
            ))}
            {records.course.meilleur3000 ? (
              <LigneInfo
                libelle="Meilleur 3000 m"
                valeur={formaterChrono(records.course.meilleur3000.tempsSec)}
              />
            ) : null}
            {records.course.plusLongueSortie ? (
              <LigneInfo
                libelle="Plus longue sortie"
                valeur={`${records.course.plusLongueSortie.distanceKm} km`}
              />
            ) : null}
            <LigneInfo libelle="Séances réalisées" valeur={`${records.totalSeances}`} />
            <LigneInfo
              libelle="Journal — meilleure série"
              valeur={`${records.serieJournal.record} j`}
            />
          </>
        )}
      </Carte>

      {/* Corrélations symptômes ↔ déclencheurs (l'insight signature). */}
      <Carte>
        <SousTitre>Déclencheurs possibles</SousTitre>
        {correlations.length === 0 ? (
          <Corps>
            Aucune corrélation fiable pour l’instant. Il faut au moins 30 jours de journal et qu’un
            tag revienne ≥ 5 fois. Rien n’est affirmé sans données.
          </Corps>
        ) : (
          correlations.slice(0, 3).map((c) => (
            <Corps key={c.tag} style={styles.correlation}>
              {c.libelle}
            </Corps>
          ))
        )}
      </Carte>

      {/* Aliments classés (statut manuel ou corrélation auto) — affichage croisé, sans
          influence sur le moteur d'adaptation. */}
      <Carte>
        <SousTitre>Aliments à surveiller</SousTitre>
        {alimentsASurveiller.length === 0 ? (
          <Corps>
            Aucun aliment signalé pour l’instant. Il faut au moins 30 jours de journal et qu’un
            aliment revienne ≥ 5 fois — ou un statut posé par toi dans l’écran Alimentation.
          </Corps>
        ) : (
          alimentsASurveiller.map((c) => (
            <Corps key={c.aliment} style={styles.correlation}>
              {c.aliment} (
              {c.verdict === 'suspect' || c.verdict === 'neutre'
                ? c.verdict
                : LIBELLES_STATUT[c.verdict]}
              ) : {c.raison}
            </Corps>
          ))
        )}
      </Carte>
    </Ecran>
  );
}

/** Grille calendrier style « GitHub » : une colonne par semaine, 7 lignes (jours). */
function Heatmap({ cellules }: { cellules: CelluleHeatmap[] }) {
  // Découpe en semaines de 7 jours (les plus anciennes à gauche).
  const semaines: CelluleHeatmap[][] = [];
  for (let i = 0; i < cellules.length; i += 7) semaines.push(cellules.slice(i, i + 7));
  return (
    <View style={styles.heatmap}>
      {semaines.map((sem) => (
        <View key={sem[0]?.date ?? Math.random()} style={styles.heatmapColonne}>
          {sem.map((c) => (
            <View
              key={c.date}
              style={[styles.heatmapCase, { backgroundColor: couleurScore(c.score) }]}
            >
              {c.aSeance ? <View style={styles.heatmapPoint} /> : null}
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

/** Barres de charge hebdo, hauteur relative au max de la fenêtre. */
function GrapheCharge({ charge }: { charge: SemaineCharge[] }) {
  const max = Math.max(1, ...charge.map((s) => s.charge));
  const couleurZone: Record<string, string> = {
    sous_charge: couleurs.texteAttenue,
    optimale: couleurs.freeletics,
    vigilance: couleurs.course,
    risque: couleurs.sante,
  };
  return (
    <View style={styles.barres}>
      {charge.map((s) => (
        <View key={s.fin} style={styles.barreColonne}>
          <View
            style={[
              styles.barreCharge,
              {
                height: `${Math.round((s.charge / max) * 100)}%`,
                backgroundColor: s.zone ? couleurZone[s.zone] : couleurs.salle,
              },
            ]}
          />
        </View>
      ))}
    </View>
  );
}

/** Formate des secondes en « m:ss ». */
function formaterChrono(sec: number): string {
  return `${Math.floor(sec / 60)}:${(sec % 60).toString().padStart(2, '0')}`;
}

const styles = StyleSheet.create({
  legende: { color: couleurs.texteAttenue, fontSize: 12, marginTop: espace.sm },
  heatmap: { flexDirection: 'row', gap: 3, marginTop: espace.sm },
  heatmapColonne: { flex: 1, gap: 3 },
  heatmapCase: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heatmapPoint: { width: 4, height: 4, borderRadius: 2, backgroundColor: couleurs.encre },
  barres: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: espace.xs,
    height: 90,
    marginTop: espace.sm,
  },
  barreColonne: { flex: 1, height: '100%', justifyContent: 'flex-end' },
  barreCharge: { width: '100%', borderRadius: rayon.sm, minHeight: 2 },
  lignesSante: { flexDirection: 'row', justifyContent: 'space-between', marginTop: espace.xs },
  santeMini: {
    flex: 1,
    textAlign: 'center',
    fontFamily: typo.donnees,
    fontSize: 10,
    color: couleurs.sante,
  },
  correlation: { color: couleurs.texte, marginTop: espace.sm },
});
