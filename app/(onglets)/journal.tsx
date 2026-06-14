import {
  Bouton,
  Carte,
  Chip,
  Corps,
  Echelle,
  Ecran,
  NavigateurDate,
  SousTitre,
} from '@/design/composants';
import { couleurs, espace, rayon, typo } from '@/design/theme';
import { ajouterJours, entreeVeille, libelleJour, tagsParRecence } from '@/domaine';
import type { EntreeJournal } from '@/domaine';
import { useMagasin } from '@/etat/magasin';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

const TAGS = ['repas-gras', 'repas-tardif', 'stress', 'sommeil-court', 'voyage', 'hydratation-ok'];

// Journal express (doc 04 §4.2) : curseurs pré-positionnés sur la veille,
// « identique à hier », tags récents en premier. Navigation libre dans
// l'historique (jour par jour, futur bloqué) pour compléter les jours passés.
// Objectif : < 10 s pour la saisie du jour.

/** Valeurs initiales : l'entrée du jour ciblé, sinon les curseurs de la veille. */
function valeursInitiales(existante: EntreeJournal | undefined, veille: EntreeJournal | undefined) {
  const source = existante ?? veille;
  return {
    douleur: source?.douleur ?? 0,
    energie: source?.energie ?? 3,
    digestion: source?.digestion ?? 3,
    // Seuls les curseurs sont pré-positionnés sur la veille ; le reste repart à neuf.
    nbSelles: existante?.nbSelles ?? 1,
    ballonnements: existante?.ballonnements ?? false,
    tags: existante?.tags ?? [],
    note: existante?.note ?? '',
  };
}

export default function EcranJournal() {
  const router = useRouter();
  const { aujourdhui, journal, saisirJournal } = useMagasin();

  // Navigation libre dans l'historique ; le jour ciblé démarre sur aujourd'hui.
  const [dateCible, setDateCible] = useState(aujourdhui);
  const existante = journal.find((e) => e.date === dateCible);
  const veille = entreeVeille(journal, dateCible);
  const estAujourdhui = dateCible === aujourdhui;

  const [valeurs, setValeurs] = useState(() => valeursInitiales(existante, veille));
  const { douleur, energie, digestion, nbSelles, ballonnements, tags, note } = valeurs;
  // Confirmation éphémère quand on enregistre un jour passé (on reste sur l'onglet).
  const [enregistre, setEnregistre] = useState(false);

  const tagsOrdonnes = useMemo(() => tagsParRecence(journal, TAGS), [journal]);

  function changerDate(date: string) {
    if (date === dateCible) return;
    setDateCible(date);
    setEnregistre(false);
    const entree = journal.find((e) => e.date === date);
    setValeurs(valeursInitiales(entree, entreeVeille(journal, date)));
  }

  function poser<K extends keyof typeof valeurs>(cle: K, valeur: (typeof valeurs)[K]) {
    setValeurs((v) => ({ ...v, [cle]: valeur }));
  }

  function basculerTag(t: string) {
    poser('tags', tags.includes(t) ? tags.filter((x) => x !== t) : [...tags, t]);
  }

  /** Copie intégralement l'entrée de la veille (modifiable avant d'enregistrer). */
  function identiqueAHier() {
    if (!veille) return;
    setValeurs({
      douleur: veille.douleur,
      energie: veille.energie,
      digestion: veille.digestion,
      nbSelles: veille.nbSelles,
      ballonnements: veille.ballonnements,
      tags: [...veille.tags],
      note: '',
    });
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }

  async function valider() {
    await saisirJournal({
      date: dateCible,
      douleur,
      energie,
      digestion,
      nbSelles,
      ballonnements,
      tags,
      note: note.trim() || undefined,
    });
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (estAujourdhui) {
      // Retour au tableau de bord : l'adaptation du jour s'y affiche immédiatement.
      router.replace('/');
      return;
    }
    // Jour passé : on reste sur place avec une confirmation éphémère.
    setEnregistre(true);
    setTimeout(() => setEnregistre(false), 1500);
  }

  return (
    <Ecran>
      <Corps>Moins de 10 secondes. Tes signaux pilotent l’adaptation de la séance.</Corps>

      <NavigateurDate
        libelle={libelleJour(dateCible, aujourdhui)}
        onPrecedent={() => changerDate(ajouterJours(dateCible, -1))}
        onSuivant={() => changerDate(ajouterJours(dateCible, 1))}
        suivantDesactive={estAujourdhui}
      />

      {veille && !existante ? (
        <Bouton titre="Identique à hier" variante="secondaire" onPress={identiqueAHier} />
      ) : null}

      <Carte>
        <SousTitre>Douleur (0-10)</SousTitre>
        <Echelle
          min={0}
          max={10}
          valeur={douleur}
          onChange={(v) => poser('douleur', v)}
          couleur={couleurs.sante}
        />
        <Text style={styles.indice}>≥ 5 → séance allégée automatiquement.</Text>
      </Carte>

      <Carte>
        <SousTitre>Énergie (1-5)</SousTitre>
        <Echelle
          min={1}
          max={5}
          valeur={energie}
          onChange={(v) => poser('energie', v)}
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
          onChange={(v) => poser('digestion', v)}
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
              onPress={() => poser('nbSelles', Math.max(0, nbSelles - 1))}
            >
              <Text style={styles.stepBtnTexte}>−</Text>
            </Pressable>
            <Text style={styles.stepValeur}>{nbSelles}</Text>
            <Pressable style={styles.stepBtn} onPress={() => poser('nbSelles', nbSelles + 1)}>
              <Text style={styles.stepBtnTexte}>+</Text>
            </Pressable>
          </View>
        </View>
        <Pressable
          accessibilityRole="switch"
          accessibilityState={{ checked: ballonnements }}
          onPress={() => poser('ballonnements', !ballonnements)}
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
          {tagsOrdonnes.map((t) => (
            <Chip key={t} libelle={t} actif={tags.includes(t)} onPress={() => basculerTag(t)} />
          ))}
        </View>
        <TextInput
          value={note}
          onChangeText={(v) => poser('note', v)}
          placeholder="Note libre (optionnel)"
          placeholderTextColor={couleurs.texteAttenue}
          style={styles.input}
          multiline
        />
      </Carte>

      <Bouton
        titre={enregistre ? 'Enregistré ✓' : 'Enregistrer'}
        couleur={couleurs.sante}
        onPress={valider}
      />
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
  cocheMarque: { color: couleurs.encre, fontFamily: typo.titre, fontSize: 14 },
  toggleTexte: { fontFamily: typo.corps, fontSize: 14, color: couleurs.texte },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: espace.sm },
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
