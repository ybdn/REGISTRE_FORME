import { Bouton, Carte, Corps, Donnee, Ecran, SousTitre } from '@/design/composants';
import { couleurs, espace, typo } from '@/design/theme';
import {
  BASELINE_DOULEUR_BASSE,
  MIN_ENTREES_BASELINE,
  PLAFOND_DOULEUR_ABSOLU,
  SEUIL_DOULEUR,
  SEUIL_ENERGIE,
  seuilDegradeRelatif,
} from '@/domaine';
import { useMagasin } from '@/etat/magasin';
import { StyleSheet, Text, View } from 'react-native';

// Écran de transparence : « pourquoi telle journée est-elle dégradée ? ».
// Montre la normale personnelle, le seuil relatif du jour et les garde-fous absolus
// que la personnalisation ne désactive jamais.

const fr = (n: number): string => (Math.round(n * 10) / 10).toString().replace('.', ',');

export default function EcranSeuils() {
  const { baselineDuJour, profil, definirModePousse } = useMagasin();
  const enPoussee = profil?.modePousse ?? false;

  return (
    <Ecran>
      {baselineDuJour ? (
        <>
          <Carte>
            <SousTitre>Ta normale (28 derniers jours)</SousTitre>
            <Donnee valeur={`${fr(baselineDuJour.valeur)} / 10`} couleur={couleurs.sante} />
            <Corps style={{ color: couleurs.texteAttenue }}>
              Médiane de ta douleur, calculée sur {baselineDuJour.nbEntrees} entrées. Dispersion
              (MAD) : {fr(baselineDuJour.mad)}.
            </Corps>
          </Carte>

          <Carte>
            <SousTitre>Seuil du jour (relatif)</SousTitre>
            <Donnee
              valeur={`douleur ≥ ${fr(seuilDegradeRelatif(baselineDuJour))} / 10`}
              couleur={couleurs.course}
            />
            <Corps style={{ color: couleurs.texteAttenue }}>
              Une journée est dégradée dès que ta douleur dépasse ta normale de max(2 ; 2 × MAD).
              C’est ce qui s’adapte à TA situation.
            </Corps>
          </Carte>
        </>
      ) : (
        <Carte>
          <SousTitre>Encore en apprentissage</SousTitre>
          <Corps>
            Il faut au moins {MIN_ENTREES_BASELINE} jours de journal sur 4 semaines pour calculer ta
            normale personnelle. En attendant, les seuils universels ci-dessous s’appliquent.
          </Corps>
        </Carte>
      )}

      <Carte>
        <SousTitre>Garde-fous absolus (toujours actifs)</SousTitre>
        <Corps style={{ color: couleurs.texteAttenue, marginBottom: espace.sm }}>
          La personnalisation ne peut qu’ajouter des alertes, jamais en retirer.
        </Corps>
        <LigneGardeFou
          texte={`Douleur ≥ ${PLAFOND_DOULEUR_ABSOLU}/10 — journée dégradée, quoi qu’il arrive.`}
        />
        <LigneGardeFou texte={`Énergie ≤ ${SEUIL_ENERGIE}/5 — bas dans l’absolu.`} />
        <LigneGardeFou
          texte={`Douleur ≥ ${SEUIL_DOULEUR}/10 tant que ta normale reste sous ${BASELINE_DOULEUR_BASSE}/10.`}
        />
      </Carte>

      <Carte>
        <SousTitre>Mode poussée</SousTitre>
        <Corps style={{ color: couleurs.texteAttenue, marginBottom: espace.sm }}>
          {enPoussee
            ? 'Le plan est en pause : maintien minimal seulement. Reprends quand tu te sens prêt(e) (depuis le tableau de bord, après 3 jours stables).'
            : 'Si tu traverses une poussée, tu peux mettre le plan en pause à tout moment — sans aucune notion d’échec.'}
        </Corps>
        {enPoussee ? null : (
          <Bouton
            titre="Activer le mode poussée"
            couleur={couleurs.sante}
            onPress={() => definirModePousse(true)}
          />
        )}
      </Carte>
    </Ecran>
  );
}

function LigneGardeFou({ texte }: { texte: string }) {
  return (
    <View style={styles.ligne}>
      <Text style={styles.puce}>•</Text>
      <Text style={styles.texte}>{texte}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  ligne: { flexDirection: 'row', gap: espace.sm, marginTop: espace.xs },
  puce: { color: couleurs.sante, fontFamily: typo.corps, fontSize: 14 },
  texte: { flex: 1, color: couleurs.texte, fontFamily: typo.corps, fontSize: 14 },
});
