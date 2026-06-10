import { Bouton, Carte, Corps, Echelle, Ecran, SousTitre, Titre } from '@/design/composants';
import { couleurs, espace, rayon, typo } from '@/design/theme';
import { useMagasin } from '@/etat/magasin';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

const TAGS = ['repas-gras', 'repas-tardif', 'stress', 'sommeil-court', 'voyage', 'hydratation-ok'];

export default function EcranJournal() {
  const router = useRouter();
  const { aujourdhui, journal, saisirJournal } = useMagasin();
  const existante = journal.find((e) => e.date === aujourdhui);

  const [douleur, setDouleur] = useState(existante?.douleur ?? 0);
  const [energie, setEnergie] = useState(existante?.energie ?? 3);
  const [digestion, setDigestion] = useState(existante?.digestion ?? 3);
  const [nbSelles, setNbSelles] = useState(existante?.nbSelles ?? 1);
  const [ballonnements, setBallonnements] = useState(existante?.ballonnements ?? false);
  const [tags, setTags] = useState<string[]>(existante?.tags ?? []);
  const [note, setNote] = useState(existante?.note ?? '');

  function basculerTag(t: string) {
    setTags((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  }

  async function valider() {
    await saisirJournal({
      date: aujourdhui,
      douleur,
      energie,
      digestion,
      nbSelles,
      ballonnements,
      tags,
      note: note.trim() || undefined,
    });
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // Retour au tableau de bord : l'adaptation éventuelle s'y affiche immédiatement.
    router.replace('/');
  }

  return (
    <Ecran>
      <Titre>Journal du jour</Titre>
      <Corps>Moins de 20 secondes. Tes signaux pilotent l’adaptation de la séance.</Corps>

      <Carte>
        <SousTitre>Douleur (0-10)</SousTitre>
        <Echelle min={0} max={10} valeur={douleur} onChange={setDouleur} couleur={couleurs.sante} />
        <Text style={styles.indice}>≥ 5 → séance allégée automatiquement.</Text>
      </Carte>

      <Carte>
        <SousTitre>Énergie (1-5)</SousTitre>
        <Echelle
          min={1}
          max={5}
          valeur={energie}
          onChange={setEnergie}
          couleur={couleurs.freeletics}
        />
        <Text style={styles.indice}>≤ 2 → séance allégée automatiquement.</Text>
      </Carte>

      <Carte>
        <SousTitre>Digestion (1-5)</SousTitre>
        <Echelle
          min={1}
          max={5}
          valeur={digestion}
          onChange={setDigestion}
          couleur={couleurs.salle}
        />
      </Carte>

      <Carte>
        <SousTitre>Transit</SousTitre>
        <View style={styles.stepper}>
          <Text style={styles.stepperLabel}>Nombre de selles</Text>
          <View style={styles.stepperControles}>
            <Pressable
              style={styles.stepBtn}
              onPress={() => setNbSelles((n) => Math.max(0, n - 1))}
            >
              <Text style={styles.stepBtnTexte}>−</Text>
            </Pressable>
            <Text style={styles.stepValeur}>{nbSelles}</Text>
            <Pressable style={styles.stepBtn} onPress={() => setNbSelles((n) => n + 1)}>
              <Text style={styles.stepBtnTexte}>+</Text>
            </Pressable>
          </View>
        </View>
        <Pressable
          accessibilityRole="switch"
          accessibilityState={{ checked: ballonnements }}
          onPress={() => setBallonnements((v) => !v)}
          style={styles.toggle}
        >
          <View style={[styles.coche, ballonnements && styles.cocheActive]}>
            {ballonnements ? <Text style={styles.cocheMarque}>✓</Text> : null}
          </View>
          <Text style={styles.toggleTexte}>Ballonnements</Text>
        </Pressable>
      </Carte>

      <Carte>
        <SousTitre>Contexte</SousTitre>
        <View style={styles.tags}>
          {TAGS.map((t) => {
            const actif = tags.includes(t);
            return (
              <Pressable
                key={t}
                onPress={() => basculerTag(t)}
                style={[styles.tag, actif && styles.tagActif]}
              >
                <Text style={[styles.tagTexte, actif && styles.tagTexteActif]}>{t}</Text>
              </Pressable>
            );
          })}
        </View>
        <TextInput
          value={note}
          onChangeText={setNote}
          placeholder="Note libre (optionnel)"
          placeholderTextColor={couleurs.texteAttenue}
          style={styles.input}
          multiline
        />
      </Carte>

      <Bouton titre="Enregistrer" couleur={couleurs.sante} onPress={valider} />
    </Ecran>
  );
}

const styles = StyleSheet.create({
  indice: {
    fontFamily: typo.corps,
    fontSize: 12,
    color: couleurs.texteAttenue,
    marginTop: espace.xs,
  },
  stepper: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  stepperLabel: { fontFamily: typo.corps, fontSize: 14, color: couleurs.texte },
  stepperControles: { flexDirection: 'row', alignItems: 'center', gap: espace.md },
  stepBtn: {
    width: 40,
    height: 40,
    borderRadius: rayon.sm,
    borderWidth: 1,
    borderColor: couleurs.trait,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnTexte: { fontFamily: typo.titre, fontSize: 20, color: couleurs.texte },
  stepValeur: {
    fontFamily: typo.donnees,
    fontSize: 18,
    color: couleurs.texte,
    minWidth: 28,
    textAlign: 'center',
  },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: espace.sm, marginTop: espace.md },
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
  cocheMarque: { color: '#0F141B', fontFamily: typo.titre, fontSize: 14 },
  toggleTexte: { fontFamily: typo.corps, fontSize: 14, color: couleurs.texte },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: espace.sm },
  tag: {
    paddingHorizontal: espace.md,
    paddingVertical: espace.xs,
    borderRadius: rayon.lg,
    borderWidth: 1,
    borderColor: couleurs.trait,
  },
  tagActif: { backgroundColor: couleurs.salle, borderColor: couleurs.salle },
  tagTexte: { fontFamily: typo.corps, fontSize: 12, color: couleurs.texteAttenue },
  tagTexteActif: { color: '#0F141B' },
  input: {
    fontFamily: typo.corps,
    fontSize: 14,
    color: couleurs.texte,
    borderWidth: 1,
    borderColor: couleurs.trait,
    borderRadius: rayon.sm,
    padding: espace.md,
    minHeight: 60,
    textAlignVertical: 'top',
    marginTop: espace.sm,
  },
});
