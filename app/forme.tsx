import { Bouton, Carte, Corps, Ecran, SousTitre, Titre } from '@/design/composants';
import { couleurs, espace, rayon, typo } from '@/design/theme';
import type { ComposanteScore, VarianteSeance } from '@/domaine';
import { useMagasin } from '@/etat/magasin';
import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

// Détail du score de forme : décomposition transparente (barres par composante),
// jamais un chiffre magique. Atteint au tap depuis la carte du tableau de bord.

const COULEUR_COMPOSANTE: Record<ComposanteScore['cle'], string> = {
  douleur: couleurs.sante,
  energie: couleurs.course,
  digestion: couleurs.freeletics,
  charge: couleurs.salle,
};

const LIBELLE_NIVEAU: Record<VarianteSeance, string> = {
  normale: 'Séance normale — progression autorisée.',
  moderee: 'Séance modérée — volume −20 %, pas de progression aujourd’hui.',
  allegee: 'Séance allégée — EF courte, mobilité, marche.',
  repos: 'Repos proposé — marche libre optionnelle.',
};

export default function EcranForme() {
  const router = useRouter();
  const { scoreFormeDuJour, adaptationDuJour } = useMagasin();

  if (!scoreFormeDuJour) {
    return (
      <Ecran>
        <Titre>Forme du jour</Titre>
        <Corps>Saisis ton journal Crohn d’aujourd’hui pour calculer ton score de forme.</Corps>
        <Bouton titre="Saisir le journal" onPress={() => router.replace('/journal')} />
      </Ecran>
    );
  }

  const { score, composantes } = scoreFormeDuJour;
  const niveau = adaptationDuJour?.niveauSeance ?? 'normale';
  const couleurScore =
    score >= 75 ? couleurs.freeletics : score >= 50 ? couleurs.course : couleurs.sante;

  return (
    <Ecran>
      <Carte style={{ alignItems: 'center' }}>
        <SousTitre>Score de forme</SousTitre>
        <Text style={[styles.scoreGros, { color: couleurScore }]}>{score}</Text>
        <Text style={styles.scoreSur}>/ 100</Text>
        <Corps style={{ textAlign: 'center', marginTop: espace.sm }}>
          {LIBELLE_NIVEAU[niveau]}
        </Corps>
      </Carte>

      <Carte>
        <SousTitre>Décomposition</SousTitre>
        {composantes.map((c) => (
          <BarreComposante key={c.cle} composante={c} />
        ))}
        <Corps style={{ color: couleurs.texteAttenue, marginTop: espace.md }}>
          Chaque barre montre l’état d’une composante (0 à 100 %). Sa contribution au score dépend
          de son poids : douleur 35 %, énergie 25 %, charge 25 %, digestion 15 %.
        </Corps>
      </Carte>

      <Bouton
        titre="Voir mes seuils personnels"
        variante="secondaire"
        onPress={() => router.push('/seuils')}
      />
    </Ecran>
  );
}

function BarreComposante({ composante }: { composante: ComposanteScore }) {
  const couleur = COULEUR_COMPOSANTE[composante.cle];
  const pct = Math.round(composante.sousScore * 100);
  return (
    <View style={styles.ligne}>
      <View style={styles.ligneEntete}>
        <Text style={styles.libelle}>
          {composante.libelle} · {Math.round(composante.poids * 100)} %
        </Text>
        <Text style={[styles.points, { color: couleur }]}>
          +{Math.round(composante.points)} pts
        </Text>
      </View>
      <View style={styles.piste}>
        <View style={[styles.remplie, { width: `${pct}%`, backgroundColor: couleur }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  scoreGros: { fontFamily: typo.titre, fontSize: 64, lineHeight: 70 },
  scoreSur: { fontFamily: typo.donnees, fontSize: 14, color: couleurs.texteAttenue },
  ligne: { marginTop: espace.md, gap: espace.xs },
  ligneEntete: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  libelle: { fontFamily: typo.corps, fontSize: 13, color: couleurs.texte },
  points: { fontFamily: typo.donnees, fontSize: 13 },
  piste: {
    height: 8,
    backgroundColor: couleurs.fond,
    borderRadius: rayon.sm,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: couleurs.trait,
  },
  remplie: { height: '100%' },
});
