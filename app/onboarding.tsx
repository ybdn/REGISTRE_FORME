import { Bouton, Carte, Champ, Corps, Ecran, SousTitre, Titre } from '@/design/composants';
import { couleurs, espace, rayon, typo } from '@/design/theme';
import { aujourdhuiISO, estDateISO } from '@/domaine';
import { useMagasin } from '@/etat/magasin';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

// Onboarding : profil minimal + acceptation OBLIGATOIRE du disclaimer médical.

export default function Onboarding() {
  const router = useRouter();
  const creerProfil = useMagasin((e) => e.creerProfil);

  const [taille, setTaille] = useState('184');
  const [age, setAge] = useState('32');
  const [dateDebut, setDateDebut] = useState(aujourdhuiISO());
  const [disclaimer, setDisclaimer] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function valider() {
    const t = Number(taille);
    const a = Number(age);
    if (!Number.isFinite(t) || t < 120 || t > 230) return setErreur('Taille invalide (cm).');
    if (!Number.isFinite(a) || a < 14 || a > 100) return setErreur('Âge invalide.');
    if (!estDateISO(dateDebut)) return setErreur('Date de début invalide (AAAA-MM-JJ).');
    if (!disclaimer) return setErreur('Le disclaimer médical doit être accepté pour continuer.');
    setErreur(null);
    await creerProfil({
      tailleCm: t,
      age: a,
      dateDebutProgramme: dateDebut,
      santeOptin: false,
    });
    router.replace('/');
  }

  return (
    <Ecran bordHaut>
      <Titre>REGISTRE.FORME</Titre>
      <Corps>
        Remise en forme pilotée par tes signaux santé. Quelques infos pour caler le programme 16
        semaines.
      </Corps>

      <Carte>
        <SousTitre>Profil</SousTitre>
        <Champ libelle="Taille (cm)" valeur={taille} onChange={setTaille} clavier="numeric" />
        <Champ libelle="Âge" valeur={age} onChange={setAge} clavier="numeric" />
        <Champ
          libelle="Début du programme (lundi S1)"
          valeur={dateDebut}
          onChange={setDateDebut}
          placeholder="AAAA-MM-JJ"
        />
      </Carte>

      <Carte style={styles.disclaimerCarte}>
        <SousTitre>⚠️ Disclaimer médical</SousTitre>
        <Corps>
          Cette application ne remplace ni le suivi médical ni un avis gastro-entérologique. Le
          programme doit être validé par ton médecin. Pas d’effort en apnée/Valsalva sous charge,
          hydratation stricte, séance allégée si douleur ≥ 5/10 ou énergie ≤ 2/5.
        </Corps>
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: disclaimer }}
          onPress={() => setDisclaimer((v) => !v)}
          style={styles.case}
        >
          <View style={[styles.coche, disclaimer && styles.cocheActive]}>
            {disclaimer ? <Text style={styles.cocheMarque}>✓</Text> : null}
          </View>
          <Text style={styles.caseTexte}>
            J’ai lu et compris. Je validerai ce programme avec mon médecin.
          </Text>
        </Pressable>
      </Carte>

      {erreur ? <Text style={styles.erreur}>{erreur}</Text> : null}
      <Bouton titre="Commencer" couleur={couleurs.freeletics} onPress={valider} />
    </Ecran>
  );
}

const styles = StyleSheet.create({
  disclaimerCarte: { borderColor: couleurs.sante },
  case: { flexDirection: 'row', alignItems: 'center', gap: espace.sm, marginTop: espace.sm },
  coche: {
    width: 24,
    height: 24,
    borderRadius: rayon.sm,
    borderWidth: 1,
    borderColor: couleurs.sante,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cocheActive: { backgroundColor: couleurs.sante },
  cocheMarque: { color: couleurs.encre, fontFamily: typo.titre, fontSize: 14 },
  caseTexte: { flex: 1, fontFamily: typo.corps, fontSize: 13, color: couleurs.texte },
  erreur: { fontFamily: typo.corps, fontSize: 13, color: couleurs.alerte },
});
