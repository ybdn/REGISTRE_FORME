import { Carte, Corps, Ecran, SousTitre } from '@/design/composants';
import { couleurs, espace, typo } from '@/design/theme';
import { StyleSheet, Text, View } from 'react-native';

// « Comment ça marche » : transparence totale du moteur (chaque décision est une
// règle lisible) + cadre de sécurité MICI. Sert aussi à montrer les règles au gastro.

const REGLES: { titre: string; texte: string }[] = [
  {
    titre: '0 · Mode poussée',
    texte:
      'Quand tu déclares une poussée, le plan se met en pause : seul un maintien minimal est proposé. Aucune progression, aucune notion d’échec. La reprise se fait par paliers (−30 %, −15 %, trame) validés par ta forme.',
  },
  {
    titre: '1 · Jour dégradé',
    texte:
      'Douleur ou énergie au-delà de tes seuils (relatifs à ta baseline personnelle, plus les garde-fous absolus MICI) → la séance est plafonnée à « allégée ». La sécurité prime toujours sur la personnalisation.',
  },
  {
    titre: '2 · Score de forme',
    texte:
      'Un score 0-100 (douleur, énergie, digestion, charge) gradue la séance : normale, modérée (−20 %), allégée ou repos. Chaque composante est affichée — jamais un chiffre magique.',
  },
  {
    titre: '3 · Décharge hebdo',
    texte:
      '3 jours dégradés d’affilée → une semaine de décharge (volume −40 %) est proposée pour récupérer.',
  },
  {
    titre: '4 · Lissage de charge',
    texte:
      'Si ta charge récente grimpe trop vite (ACWR > 1,5), la prochaine séance passe en « modérée » pour limiter le risque de surmenage.',
  },
  {
    titre: '5 · Progression',
    texte:
      '14 jours sans signal dégradé, effort maîtrisé et charge sous contrôle → feu vert pour progresser. Sinon, on consolide.',
  },
];

export default function EcranApropos() {
  return (
    <Ecran>
      <Carte>
        <Corps style={{ color: couleurs.texte }}>
          REGISTRE.FORME adapte ton entraînement à partir de tes signaux santé — jamais l’inverse.
          Chaque décision est une règle déterministe, lisible, affichée telle quelle et annulable
          d’un tap. Aucune boîte noire, aucune IA opaque.
        </Corps>
      </Carte>

      <Carte>
        <SousTitre>Les règles du moteur</SousTitre>
        {REGLES.map((r) => (
          <View key={r.titre} style={styles.regle}>
            <Text style={styles.regleTitre}>{r.titre}</Text>
            <Corps>{r.texte}</Corps>
          </View>
        ))}
        <Corps style={styles.note}>
          Une seule adaptation s’applique par jour : la première règle déclenchée selon l’ordre «
          sécurité d’abord ».
        </Corps>
      </Carte>

      <Carte>
        <SousTitre>Tes garanties</SousTitre>
        <Corps>
          • 100 % local : aucune donnée ne quitte ton téléphone, aucun compte, aucun analytics.
        </Corps>
        <Corps>• Les garde-fous MICI absolus (douleur élevée…) ne sont jamais désactivables.</Corps>
        <Corps>
          • À montrer à ton gastro : ces règles, comme tes seuils, sont faites pour être validées
          médicalement. L’app ne remplace pas un avis médical.
        </Corps>
      </Carte>
    </Ecran>
  );
}

const styles = StyleSheet.create({
  regle: { marginTop: espace.md, gap: espace.xs },
  regleTitre: { fontFamily: typo.titre, fontSize: 14, color: couleurs.texte },
  note: { color: couleurs.texteAttenue, fontSize: 12, marginTop: espace.md },
});
