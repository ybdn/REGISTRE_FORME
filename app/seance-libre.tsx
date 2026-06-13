import { Carte, Corps, Ecran, Pastille, SousTitre } from '@/design/composants';
import { couleurType, couleurs, espace, typo } from '@/design/theme';
import { MODELES, type ModeleSeance, type TypeSeance } from '@/domaine';
import { useMagasin } from '@/etat/magasin';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

// ─────────────────────────────────────────────────────────────────────────────
// SÉANCE LIBRE — séance lancée à l'initiative de l'utilisateur, hors plan.
// Le choix passe par les mêmes garde-fous que la séance planifiée : un jour
// dégradé bascule sur le modèle santé (mobilité & marche), jamais l'inverse.
// ─────────────────────────────────────────────────────────────────────────────

const ORDRE_TYPES: TypeSeance[] = ['course', 'salle', 'freeletics', 'sante'];
const LIBELLE_TYPE: Record<TypeSeance, string> = {
  course: 'Course',
  salle: 'Salle',
  freeletics: 'Freeletics',
  sante: 'Santé',
};

export default function EcranSeanceLibre() {
  const router = useRouter();
  const { adaptationDuJour } = useMagasin();
  const niveauJour = adaptationDuJour?.niveauSeance ?? 'normale';
  const jourDegrade = niveauJour === 'allegee' || niveauJour === 'repos';

  const parType = ORDRE_TYPES.map((type) => ({
    type,
    modeles: Object.values(MODELES).filter((m) => m.type === type),
  })).filter((g) => g.modeles.length > 0);

  return (
    <Ecran>
      <Corps>
        Une séance hors plan, comptée comme les autres : charges, progression et signaux santé sont
        pris en compte.
      </Corps>

      {jourDegrade ? (
        <Carte style={styles.garde}>
          <SousTitre>Jour à ménager</SousTitre>
          <Corps style={{ color: couleurs.texte }}>
            {adaptationDuJour?.raison ?? 'Tes signaux santé invitent à lever le pied.'}
          </Corps>
          <Corps>
            Quelle que soit la séance choisie, la version santé (mobilité & marche) sera proposée.
          </Corps>
        </Carte>
      ) : null}
      {niveauJour === 'moderee' ? (
        <Carte style={styles.garde}>
          <Corps style={{ color: couleurs.texte }}>
            Séance modérée aujourd’hui : une série de moins par exercice, charges conservées.
          </Corps>
        </Carte>
      ) : null}

      {parType.map(({ type, modeles }) => (
        <View key={type}>
          <SousTitre>{LIBELLE_TYPE[type]}</SousTitre>
          {modeles.map((m) => (
            <LigneModele
              key={m.id}
              modele={m}
              onPress={() => router.push({ pathname: '/seance', params: { modele: m.id } })}
            />
          ))}
        </View>
      ))}
    </Ecran>
  );
}

function LigneModele({ modele, onPress }: { modele: ModeleSeance; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button">
      <Carte style={styles.ligne}>
        <Pastille couleur={couleurType[modele.type]} plein />
        <Text style={styles.titreModele}>{modele.titre}</Text>
        <Text style={styles.duree}>{modele.dureeMin} min</Text>
      </Carte>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  garde: { borderColor: couleurs.sante },
  ligne: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espace.md,
    marginTop: espace.sm,
  },
  titreModele: { fontFamily: typo.corps, fontSize: 14, color: couleurs.texte, flex: 1 },
  duree: { fontFamily: typo.donnees, fontSize: 12, color: couleurs.texteAttenue },
});
