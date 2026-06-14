import { Bouton, Carte, Champ, Corps, Ecran, SousTitre, Titre } from '@/design/composants';
import { couleurs, espace } from '@/design/theme';
import { useMagasin } from '@/etat/magasin';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

// Garde de déverrouillage E2EE (docs/07 §7.3, Phase 3). Affichée par le _layout quand le compte
// est chiffré mais que la passphrase n'a pas encore été saisie cette session (clé en mémoire, non
// persistée). Tant qu'elle n'est pas saisie, le contenu cloud est opaque : aucune lecture possible.

export default function Deverrouillage() {
  const e2ee = useMagasin((e) => e.e2ee);
  const deverrouillerE2EE = useMagasin((e) => e.deverrouillerE2EE);
  const [passphrase, setPassphrase] = useState('');

  const enCours = e2ee.statut === 'enCours';

  return (
    <Ecran bordHaut>
      <View style={styles.entete}>
        <Titre>REGISTRE.FORME</Titre>
        <SousTitre>Chiffrement de bout en bout</SousTitre>
      </View>
      <Carte>
        <Corps style={styles.intro}>
          Tes données sont chiffrées de bout en bout. Saisis ta phrase de chiffrement pour les
          déverrouiller sur cet appareil. Elle est distincte de ton mot de passe de connexion et
          n’est jamais envoyée au serveur.
        </Corps>
        <Champ
          libelle="Phrase de chiffrement"
          valeur={passphrase}
          onChange={setPassphrase}
          secret
          placeholder="Ta phrase de chiffrement"
        />
        {e2ee.statut === 'erreur' && e2ee.message ? (
          <Text style={styles.erreur}>{e2ee.message}</Text>
        ) : null}
        <Bouton
          titre={enCours ? 'Déverrouillage…' : 'Déverrouiller'}
          couleur={couleurs.freeletics}
          disabled={enCours || passphrase.length === 0}
          onPress={() => void deverrouillerE2EE(passphrase)}
        />
        <Corps style={styles.avertissement}>
          ⚠️ Phrase de chiffrement perdue = données cloud illisibles. Aucune récupération possible :
          c’est le prix du chiffrement de bout en bout.
        </Corps>
      </Carte>
    </Ecran>
  );
}

const styles = StyleSheet.create({
  entete: { marginBottom: espace.md, gap: espace.xs },
  intro: { marginBottom: espace.md },
  erreur: { color: couleurs.sante, fontSize: 13, marginBottom: espace.sm },
  avertissement: { color: couleurs.texteAttenue, fontSize: 12, marginTop: espace.sm },
});
