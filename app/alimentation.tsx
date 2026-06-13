import { Bouton, Carte, Chip, Corps, Ecran, Segments, SousTitre } from '@/design/composants';
import { couleurs, espace, rayon, typo } from '@/design/theme';
import {
  LIBELLES_STATUT,
  type StatutAliment,
  type VerdictAliment,
  ajouterJours,
  alimentsParRecence,
  classerAliments,
  normaliserAliment,
} from '@/domaine';
import { useMagasin } from '@/etat/magasin';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

// Suivi alimentaire express : chips d'aliments/boissons consommés sur la journée
// (pas de repas structurés), puis liste classée — statut manuel d'un tap, verdict
// auto par corrélation 48 h sinon. N'influence jamais le moteur d'adaptation.

const ALIMENTS_DEFAUT = ['café', 'lait', 'gluten', 'crudités', 'alcool', 'épices'];

/** Cycle du statut manuel au tap : aucun → toléré → à tester → à éviter → aucun. */
const CYCLE_STATUT: Record<'aucun' | StatutAliment, StatutAliment | null> = {
  aucun: 'tolere',
  tolere: 'a-tester',
  'a-tester': 'a-eviter',
  'a-eviter': null,
};

const LIBELLES_VERDICT: Record<VerdictAliment, string> = {
  ...LIBELLES_STATUT,
  suspect: 'suspect',
  neutre: 'neutre',
};

const COULEURS_VERDICT: Record<VerdictAliment, string> = {
  'a-eviter': couleurs.sante,
  // Ambre : signal observé, pas une décision — à distinguer du rouge « à éviter »
  // posé par l'utilisateur.
  suspect: couleurs.ambre,
  'a-tester': couleurs.course,
  tolere: couleurs.freeletics,
  neutre: couleurs.texteAttenue,
};

export default function EcranAlimentation() {
  const router = useRouter();
  const {
    aujourdhui,
    journal,
    consommations,
    statutsAliments,
    saisirConsommation,
    definirStatutAliment,
  } = useMagasin();
  const hier = ajouterJours(aujourdhui, -1);

  // Saisie rétroactive limitée à hier, comme le journal.
  const [dateCible, setDateCible] = useState(aujourdhui);
  const [selection, setSelection] = useState<string[]>(
    () => consommations.find((c) => c.date === aujourdhui)?.aliments ?? [],
  );
  // Aliments ajoutés à la main pendant la session (pas encore en base).
  const [ajoutes, setAjoutes] = useState<string[]>([]);
  const [saisie, setSaisie] = useState('');

  const chips = useMemo(() => {
    const recents = alimentsParRecence(consommations, ALIMENTS_DEFAUT);
    return [...ajoutes.filter((a) => !recents.includes(a)), ...recents];
  }, [consommations, ajoutes]);

  const classements = useMemo(
    () => classerAliments(consommations, statutsAliments, journal, aujourdhui),
    [consommations, statutsAliments, journal, aujourdhui],
  );

  function changerDate(date: string) {
    if (date === dateCible) return;
    setDateCible(date);
    setSelection(consommations.find((c) => c.date === date)?.aliments ?? []);
  }

  function basculer(aliment: string) {
    setSelection((s) => (s.includes(aliment) ? s.filter((x) => x !== aliment) : [...s, aliment]));
  }

  /** Ajoute l'aliment saisi librement comme chip déjà cochée. */
  function ajouter() {
    const aliment = normaliserAliment(saisie);
    if (aliment === '') return;
    if (!chips.includes(aliment)) setAjoutes((a) => [aliment, ...a]);
    if (!selection.includes(aliment)) setSelection((s) => [...s, aliment]);
    setSaisie('');
  }

  async function valider() {
    await saisirConsommation({ date: dateCible, aliments: selection });
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // Retour au tableau de bord, comme le journal.
    router.replace('/');
  }

  /** Tap sur un aliment classé : fait tourner le statut manuel. */
  async function cyclerStatut(aliment: string, statutActuel: StatutAliment | null) {
    await definirStatutAliment(aliment, CYCLE_STATUT[statutActuel ?? 'aucun']);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }

  return (
    <Ecran>
      <Corps>
        Coche ce que tu as mangé et bu. L’app croise ensuite avec tes symptômes pour repérer ce qui
        passe ou pas — sans jamais toucher ta séance.
      </Corps>

      <Segments
        options={[
          { valeur: aujourdhui, libelle: 'Aujourd’hui' },
          { valeur: hier, libelle: 'Hier' },
        ]}
        valeur={dateCible}
        onChange={changerDate}
      />

      <Carte>
        <SousTitre>Consommé ce jour</SousTitre>
        <View style={styles.tags}>
          {chips.map((aliment) => (
            <Chip
              key={aliment}
              libelle={aliment}
              actif={selection.includes(aliment)}
              onPress={() => basculer(aliment)}
            />
          ))}
        </View>
        <View style={styles.ajout}>
          <TextInput
            value={saisie}
            onChangeText={setSaisie}
            onSubmitEditing={ajouter}
            placeholder="Ajouter un aliment ou une boisson…"
            placeholderTextColor={couleurs.texteAttenue}
            style={styles.input}
            returnKeyType="done"
          />
          <Pressable accessibilityRole="button" onPress={ajouter} style={styles.btnAjout}>
            <Text style={styles.btnAjoutTexte}>+</Text>
          </Pressable>
        </View>
      </Carte>

      <Bouton titre="Enregistrer" couleur={couleurs.sante} onPress={valider} />

      <Carte>
        <SousTitre>Mes aliments</SousTitre>
        {classements.length === 0 ? (
          <Corps>
            Rien à classer pour l’instant : enregistre tes consommations au fil des jours.
          </Corps>
        ) : (
          <>
            <Corps style={styles.indice}>
              Touche un aliment pour poser ton propre statut (toléré → à tester → à éviter). Ton
              statut prime toujours sur le signal automatique.
            </Corps>
            {classements.map((c) => (
              <Pressable
                key={c.aliment}
                accessibilityRole="button"
                onPress={() => cyclerStatut(c.aliment, c.statutManuel)}
                style={styles.ligneAliment}
              >
                <View style={styles.ligneEntete}>
                  <Text style={styles.nomAliment}>{c.aliment}</Text>
                  <View style={[styles.badge, { borderColor: COULEURS_VERDICT[c.verdict] }]}>
                    <Text style={[styles.badgeTexte, { color: COULEURS_VERDICT[c.verdict] }]}>
                      {LIBELLES_VERDICT[c.verdict]}
                    </Text>
                  </View>
                </View>
                <Text style={styles.raison}>{c.raison}</Text>
                {c.source === 'manuel' && c.correlation ? (
                  <Text style={styles.raison}>{c.correlation.libelle}</Text>
                ) : null}
              </Pressable>
            ))}
          </>
        )}
      </Carte>
    </Ecran>
  );
}

const styles = StyleSheet.create({
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: espace.sm },
  ajout: { flexDirection: 'row', gap: espace.sm, marginTop: espace.md, alignItems: 'center' },
  input: {
    flex: 1,
    fontFamily: typo.corps,
    fontSize: 14,
    color: couleurs.texte,
    borderWidth: 1,
    borderColor: couleurs.trait,
    borderRadius: rayon.sm,
    padding: espace.md,
  },
  btnAjout: {
    width: 44,
    height: 44,
    borderRadius: rayon.sm,
    borderWidth: 1,
    borderColor: couleurs.trait,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnAjoutTexte: { fontFamily: typo.titre, fontSize: 20, color: couleurs.texte },
  indice: { color: couleurs.texteAttenue, fontSize: 12, marginBottom: espace.sm },
  ligneAliment: {
    paddingVertical: espace.sm,
    borderBottomWidth: 1,
    borderBottomColor: couleurs.trait,
  },
  ligneEntete: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  nomAliment: { fontFamily: typo.corps, fontSize: 14, color: couleurs.texte },
  badge: {
    paddingHorizontal: espace.sm,
    paddingVertical: 2,
    borderRadius: rayon.lg,
    borderWidth: 1,
  },
  badgeTexte: { fontFamily: typo.corps, fontSize: 11 },
  raison: {
    fontFamily: typo.corps,
    fontSize: 12,
    color: couleurs.texteAttenue,
    marginTop: espace.xs,
  },
});
