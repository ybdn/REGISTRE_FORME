import {
  Bouton,
  Carte,
  Champ,
  Corps,
  Courbe,
  Ecran,
  LigneInfo,
  SousTitre,
} from '@/design/composants';
import { couleurs, espace, typo } from '@/design/theme';
import { useMagasin } from '@/etat/magasin';
import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

/** Convertit une saisie texte en nombre, ou `undefined` si vide/invalide (pas de 0 parasite). */
function nombreOuVide(v: string): number | undefined {
  const n = Number(v.replace(',', '.'));
  return v.trim() === '' || !Number.isFinite(n) ? undefined : n;
}

export default function EcranMesures() {
  const { aujourdhui, mesures, enregistrerMesureCorporelle } = useMagasin();
  const existante = mesures.find((m) => m.date === aujourdhui);

  const [poids, setPoids] = useState(existante?.poidsKg?.toString() ?? '');
  const [brasG, setBrasG] = useState(existante?.brasGCm?.toString() ?? '');
  const [brasD, setBrasD] = useState(existante?.brasDCm?.toString() ?? '');
  const [torse, setTorse] = useState(existante?.torseCm?.toString() ?? '');
  const [ventre, setVentre] = useState(existante?.ventreCm?.toString() ?? '');
  const [hanches, setHanches] = useState(existante?.hanchesCm?.toString() ?? '');
  const [cuisses, setCuisses] = useState(existante?.cuissesCm?.toString() ?? '');

  const historiquePoids = mesures.filter((m) => m.poidsKg != null);
  const courbePoids = historiquePoids.map((m) => m.poidsKg as number);
  const variation =
    courbePoids.length >= 2
      ? courbePoids[courbePoids.length - 1]! - courbePoids[courbePoids.length - 2]!
      : null;

  async function valider() {
    await enregistrerMesureCorporelle({
      date: aujourdhui,
      poidsKg: nombreOuVide(poids),
      brasGCm: nombreOuVide(brasG),
      brasDCm: nombreOuVide(brasD),
      torseCm: nombreOuVide(torse),
      ventreCm: nombreOuVide(ventre),
      hanchesCm: nombreOuVide(hanches),
      cuissesCm: nombreOuVide(cuisses),
    });
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }

  return (
    <Ecran>
      <Corps>Poids hebdo, mensurations bi-hebdo. Tout champ est facultatif.</Corps>

      <Carte>
        <SousTitre>Poids</SousTitre>
        <Champ libelle="Poids (kg)" valeur={poids} onChange={setPoids} clavier="numeric" />
        {courbePoids.length >= 2 ? (
          <View style={styles.courbeBloc}>
            <Courbe valeurs={courbePoids} couleur={couleurs.salle} />
            {variation !== null ? (
              <Text style={styles.variation}>
                {variation > 0 ? '+' : ''}
                {variation.toFixed(1)} kg vs mesure précédente
              </Text>
            ) : null}
          </View>
        ) : (
          <Corps style={styles.indice}>
            Pas encore assez de mesures pour afficher une courbe (2 minimum).
          </Corps>
        )}
      </Carte>

      <Carte>
        <SousTitre>Mensurations (cm)</SousTitre>
        <View style={styles.grille}>
          {(
            [
              ['Bras gauche', brasG, setBrasG],
              ['Bras droit', brasD, setBrasD],
              ['Torse', torse, setTorse],
              ['Ventre', ventre, setVentre],
              ['Hanches', hanches, setHanches],
              ['Cuisses', cuisses, setCuisses],
            ] as const
          ).map(([libelle, valeur, poser]) => (
            <Champ
              key={libelle}
              libelle={libelle}
              valeur={valeur}
              onChange={poser}
              clavier="numeric"
              style={styles.demi}
            />
          ))}
        </View>
      </Carte>

      <Bouton titre="Enregistrer" couleur={couleurs.salle} onPress={valider} />

      {historiquePoids.length > 0 ? (
        <Carte>
          <SousTitre>Historique</SousTitre>
          {[...mesures]
            .reverse()
            .slice(0, 10)
            .map((m) => (
              <LigneInfo
                key={m.date}
                libelle={m.date}
                valeur={m.poidsKg != null ? `${m.poidsKg} kg` : '—'}
              />
            ))}
        </Carte>
      ) : null}
    </Ecran>
  );
}

const styles = StyleSheet.create({
  grille: { flexDirection: 'row', flexWrap: 'wrap', gap: espace.md },
  demi: { flexBasis: '45%', flexGrow: 1 },
  courbeBloc: { marginTop: espace.sm, gap: espace.xs },
  variation: { fontFamily: typo.donnees, fontSize: 13, color: couleurs.texteAttenue },
  indice: { marginTop: espace.xs },
});
