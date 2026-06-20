import {
  Bouton,
  Carte,
  Corps,
  Donnee,
  Ecran,
  Jauge,
  LigneInfo,
  NavigateurDate,
  SousTitre,
} from '@/design/composants';
import { couleurs, espace, rayon, typo } from '@/design/theme';
import {
  CATALOGUE_BOISSONS,
  type PriseHydrique,
  type StatutHydratation,
  ajouterJours,
  calculerBilanHydrique,
  formaterVolume,
  libelleJour,
  profilBoisson,
} from '@/domaine';
import { useMagasin } from '@/etat/magasin';
import * as Haptics from 'expo-haptics';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

// Écran Hydratation — suivi NET (apports pondérés − dette diurétique vs objectif
// adaptatif). Saisie express : 1 tap = une portion type. L'objectif monte avec le
// sport et les selles (MICI) ; chaque ligne est explicable. N'influence pas le score
// de forme (le seul lien moteur est un garde-fou « bois avant l'effort »).

const COULEUR_STATUT: Record<StatutHydratation, string> = {
  ok: couleurs.freeletics,
  'a-boire': couleurs.salle,
  deshydratation: couleurs.sante,
};

export default function EcranHydratation() {
  const { aujourdhui, hydratations, mesures, journal, seances, saisirHydratation } = useMagasin();

  const [dateCible, setDateCible] = useState(aujourdhui);
  const [prises, setPrises] = useState<PriseHydrique[]>(
    () => hydratations.find((h) => h.date === aujourdhui)?.prises ?? [],
  );
  const [enregistre, setEnregistre] = useState(false);

  // Contexte du jour ciblé (poids le plus récent, selles et séances de ce jour).
  const poidsKg = useMemo(
    () => [...mesures].reverse().find((m) => m.poidsKg != null)?.poidsKg ?? null,
    [mesures],
  );
  const nbSelles = useMemo(
    () => journal.find((e) => e.date === dateCible)?.nbSelles ?? null,
    [journal, dateCible],
  );
  const seancesDuJour = useMemo(
    () => seances.filter((s) => s.date === dateCible),
    [seances, dateCible],
  );

  // Bilan recalculé en direct au fil des ajouts (avant même l'enregistrement).
  const bilan = useMemo(
    () => calculerBilanHydrique({ date: dateCible, prises, poidsKg, nbSelles, seancesDuJour }),
    [dateCible, prises, poidsKg, nbSelles, seancesDuJour],
  );

  const couleur = COULEUR_STATUT[bilan.statut];
  const pct = Math.min(100, Math.round(bilan.ratio * 100));

  function changerDate(date: string) {
    if (date === dateCible) return;
    setDateCible(date);
    setPrises(hydratations.find((h) => h.date === date)?.prises ?? []);
    setEnregistre(false);
  }

  function ajouter(cle: string) {
    setPrises((p) => [...p, { boisson: cle, volumeMl: profilBoisson(cle).volumeDefautMl }]);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setEnregistre(false);
  }

  function retirer(index: number) {
    setPrises((p) => p.filter((_, i) => i !== index));
    setEnregistre(false);
  }

  async function valider() {
    await saisirHydratation({ date: dateCible, prises });
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setEnregistre(true);
    setTimeout(() => setEnregistre(false), 1500);
  }

  return (
    <Ecran>
      <Corps>
        Compte l’eau RÉELLEMENT utile : le café et l’alcool comptent moins (effet diurétique), et
        ton objectif monte les jours de sport ou de digestion difficile.
      </Corps>

      <NavigateurDate
        libelle={libelleJour(dateCible, aujourdhui)}
        onPrecedent={() => changerDate(ajouterJours(dateCible, -1))}
        onSuivant={() => changerDate(ajouterJours(dateCible, 1))}
        suivantDesactive={dateCible === aujourdhui}
      />

      {/* Bilan net du jour : avancement vers l'objectif adaptatif + raison explicable. */}
      <Carte>
        <View style={styles.ligneEntete}>
          <SousTitre>Bilan du jour</SousTitre>
          <Donnee valeur={formaterVolume(bilan.apportNetMl)} couleur={couleur} />
        </View>
        <Jauge valeur={pct} couleur={couleur} />
        <Text style={styles.objectif}>
          {pct} % de l’objectif · {formaterVolume(bilan.objectifMl)}
        </Text>
        <Corps style={styles.raison}>{bilan.raison}</Corps>
      </Carte>

      {/* Saisie express : 1 tap = une portion type. */}
      <Carte>
        <SousTitre>Ajouter une boisson</SousTitre>
        <View style={styles.boissons}>
          {CATALOGUE_BOISSONS.map((b) => (
            <Pressable
              key={b.cle}
              accessibilityRole="button"
              onPress={() => ajouter(b.cle)}
              style={({ hovered }: { pressed: boolean; hovered?: boolean }) => [
                styles.boisson,
                hovered && styles.boissonSurvol,
              ]}
            >
              <Text style={styles.boissonLibelle}>{b.libelle}</Text>
              <Text style={styles.boissonVolume}>{formaterVolume(b.volumeDefautMl)}</Text>
            </Pressable>
          ))}
        </View>
      </Carte>

      {/* Prises du jour : tap pour retirer. */}
      <Carte>
        <SousTitre>Bu ce jour</SousTitre>
        {prises.length === 0 ? (
          <Corps>Rien encore. Touche une boisson ci-dessus pour l’ajouter.</Corps>
        ) : (
          <>
            <Corps style={styles.indice}>Touche une ligne pour la retirer.</Corps>
            {prises.map((p, i) => (
              <Pressable
                // Liste éphémère locale : l'index identifie la prise jusqu'à l'enregistrement.
                key={`${p.boisson}-${i}`}
                accessibilityRole="button"
                onPress={() => retirer(i)}
                style={styles.lignePrise}
              >
                <Text style={styles.priseLibelle}>{profilBoisson(p.boisson).libelle}</Text>
                <Text style={styles.priseVolume}>{formaterVolume(p.volumeMl)}</Text>
              </Pressable>
            ))}
          </>
        )}
      </Carte>

      <Bouton
        titre={enregistre ? 'Enregistré ✓' : 'Enregistrer'}
        couleur={couleurs.salle}
        onPress={valider}
      />

      {/* Décomposition de l'objectif et des apports — transparence totale. */}
      <Carte>
        <SousTitre>Le détail</SousTitre>
        <LigneInfo libelle="Besoin de base" valeur={formaterVolume(bilan.besoinBaseMl)} />
        {bilan.pertesActiviteMl > 0 ? (
          <LigneInfo
            libelle="+ Sudation (séances)"
            valeur={formaterVolume(bilan.pertesActiviteMl)}
          />
        ) : null}
        {bilan.pertesDigestivesMl > 0 ? (
          <LigneInfo
            libelle="+ Pertes digestives"
            valeur={formaterVolume(bilan.pertesDigestivesMl)}
          />
        ) : null}
        <LigneInfo libelle="= Objectif du jour" valeur={formaterVolume(bilan.objectifMl)} />
        <View style={styles.separateur} />
        <LigneInfo libelle="Bu (brut)" valeur={formaterVolume(bilan.apportsBrutsMl)} />
        <LigneInfo libelle="Eau équivalente" valeur={formaterVolume(bilan.eauEquivalenteMl)} />
        {bilan.detteDiuretiqueMl > 0 ? (
          <LigneInfo
            libelle="− Effet diurétique"
            valeur={`−${formaterVolume(bilan.detteDiuretiqueMl)}`}
          />
        ) : null}
        <LigneInfo libelle="= Eau utile" valeur={formaterVolume(bilan.apportNetMl)} />
      </Carte>
    </Ecran>
  );
}

const styles = StyleSheet.create({
  ligneEntete: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  objectif: {
    fontFamily: typo.corps,
    fontSize: 12,
    color: couleurs.texteAttenue,
    marginTop: espace.xs,
  },
  raison: { marginTop: espace.sm },
  boissons: { flexDirection: 'row', flexWrap: 'wrap', gap: espace.sm },
  boisson: {
    paddingHorizontal: espace.md,
    paddingVertical: espace.sm,
    borderRadius: rayon.md,
    borderWidth: 1,
    borderColor: couleurs.trait,
    alignItems: 'center',
    minWidth: 88,
  },
  boissonSurvol: { borderColor: couleurs.texteAttenue, backgroundColor: couleurs.surfaceSurvol },
  boissonLibelle: { fontFamily: typo.corps, fontSize: 13, color: couleurs.texte },
  boissonVolume: {
    fontFamily: typo.donnees,
    fontSize: 11,
    color: couleurs.texteAttenue,
    marginTop: 2,
  },
  indice: { color: couleurs.texteAttenue, fontSize: 12, marginBottom: espace.xs },
  lignePrise: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: espace.sm,
    borderBottomWidth: 1,
    borderBottomColor: couleurs.trait,
  },
  priseLibelle: { fontFamily: typo.corps, fontSize: 14, color: couleurs.texte },
  priseVolume: { fontFamily: typo.donnees, fontSize: 13, color: couleurs.texteAttenue },
  separateur: { height: 1, backgroundColor: couleurs.trait, marginVertical: espace.sm },
});
