import { Bouton, Carte, Champ, Corps, Ecran, SousTitre, Titre } from '@/design/composants';
import { couleurs, espace } from '@/design/theme';
import { seConnecter } from '@/donnees/auth';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

// Écran de connexion (docs/07 §4.1, Phase 1). Compte unique, e-mail + mot de passe ;
// les inscriptions sont fermées (compte créé dans le dashboard Supabase). Affiché par le
// _layout tant qu'aucune session n'est active sur web ; la sync n'existe qu'une fois connecté.

export default function Connexion() {
  const [email, setEmail] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function valider() {
    setErreur(null);
    setEnCours(true);
    try {
      await seConnecter({ email: email.trim(), motDePasse });
      // La session devient active : le _layout détecte le changement et initialise le store.
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Connexion impossible.');
    } finally {
      setEnCours(false);
    }
  }

  return (
    <Ecran bordHaut>
      <View style={styles.entete}>
        <Titre>REGISTRE.FORME</Titre>
        <SousTitre>Synchronisation chiffrée</SousTitre>
      </View>
      <Carte>
        <Corps style={styles.intro}>
          Connecte-toi pour retrouver tes données sur cet appareil. Tes données restent privées
          (isolées par ton compte) et le moteur d’adaptation tourne entièrement sur l’appareil.
        </Corps>
        <Champ libelle="E-mail" valeur={email} onChange={setEmail} placeholder="toi@exemple.fr" />
        <Champ libelle="Mot de passe" valeur={motDePasse} onChange={setMotDePasse} secret />
        {erreur ? <Text style={styles.erreur}>{erreur}</Text> : null}
        <Bouton
          titre={enCours ? 'Connexion…' : 'Se connecter'}
          couleur={couleurs.freeletics}
          onPress={valider}
        />
      </Carte>
    </Ecran>
  );
}

const styles = StyleSheet.create({
  entete: { marginBottom: espace.md, gap: espace.xs },
  intro: { marginBottom: espace.md },
  erreur: { color: couleurs.sante, fontSize: 13, marginBottom: espace.sm },
});
