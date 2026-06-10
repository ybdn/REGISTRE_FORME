import { Bouton, Carte, Corps, Echelle, Ecran, SousTitre, Titre } from '@/design/composants';
import { couleurType, couleurs, espace, rayon, typo } from '@/design/theme';
import { type ChargeExercice, obtenirModele } from '@/domaine';
import { useMagasin } from '@/etat/magasin';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

// Saisie post-séance : RPE, durée, distance (course), charges (salle), ressenti digestif, note.

export default function EcranSeance() {
  const router = useRouter();
  const { aujourdhui, seances, validerSeance, seanceDuJour } = useMagasin();
  const sdj = seanceDuJour();
  const modele = sdj ? obtenirModele(sdj.modeleApplique) : undefined;

  const [rpe, setRpe] = useState(5);
  const [dureeMin, setDureeMin] = useState(modele ? String(modele.dureeMin) : '45');
  const [distanceKm, setDistanceKm] = useState('');
  const [ressenti, setRessenti] = useState(3);
  const [note, setNote] = useState('');

  // Dernière charge connue par exercice (rappel).
  const dernieresCharges = useMemo(() => derniereChargeParExercice(seances), [seances]);
  const [charges, setCharges] = useState<Record<string, string>>(() => {
    if (!modele || modele.type !== 'salle') return {};
    const init: Record<string, string> = {};
    for (const ex of modele.exercices) {
      const ref = dernieresCharges[ex.nom] ?? ex.chargeDepartKg;
      if (ref !== undefined) init[ex.nom] = String(ref);
    }
    return init;
  });

  if (!sdj || !modele) {
    return (
      <Ecran>
        <Titre>Repos</Titre>
        <Corps>Aucune séance prévue aujourd’hui.</Corps>
        <Bouton titre="Retour" variante="secondaire" onPress={() => router.back()} />
      </Ecran>
    );
  }

  const couleur = couleurType[sdj.planifiee.type];
  const estCourse = sdj.planifiee.type === 'course';
  const estSalle = modele.type === 'salle';

  async function valider() {
    if (!sdj || !modele) return;
    const chargesSaisies: ChargeExercice[] | undefined = estSalle
      ? modele.exercices
          .filter((ex) => charges[ex.nom])
          .map((ex) => ({
            exercice: ex.nom,
            series: ex.series,
            reps: ex.reps,
            chargeKg: Number(charges[ex.nom]) || 0,
          }))
      : undefined;

    await validerSeance({
      date: aujourdhui,
      type: sdj.planifiee.type,
      variante: sdj.allegee ? 'allegee' : 'normale',
      rpe,
      dureeMin: Number(dureeMin) || modele.dureeMin,
      distanceKm: estCourse && distanceKm ? Number(distanceKm) : undefined,
      charges: chargesSaisies,
      ressentiDigestif: ressenti,
      note: note.trim() || undefined,
    });
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.replace('/');
  }

  return (
    <Ecran>
      <Titre>{sdj.allegee ? 'Séance allégée' : modele.titre}</Titre>
      {modele.noteSecurite ? (
        <Carte style={styles.securite}>
          <Corps style={{ color: couleurs.texte }}>⚠️ {modele.noteSecurite}</Corps>
        </Carte>
      ) : null}

      <Carte>
        <SousTitre>Exercices</SousTitre>
        {modele.exercices.map((ex) => (
          <View key={ex.nom} style={styles.exercice}>
            <View style={styles.exerciceEntete}>
              <Text style={styles.exerciceNom}>{ex.nom}</Text>
              <Text style={styles.exerciceDose}>
                {ex.series} × {ex.reps}
                {ex.consigne ? ` ${ex.consigne}` : ''}
              </Text>
            </View>
            {estSalle && (ex.chargeDepartKg !== undefined || dernieresCharges[ex.nom]) ? (
              <View style={styles.ligneCharge}>
                <TextInput
                  value={charges[ex.nom] ?? ''}
                  onChangeText={(v) => setCharges((c) => ({ ...c, [ex.nom]: v }))}
                  keyboardType="numeric"
                  style={styles.inputCharge}
                />
                <Text style={styles.uniteCharge}>
                  kg{dernieresCharges[ex.nom] ? ` · dernière : ${dernieresCharges[ex.nom]}` : ''}
                </Text>
              </View>
            ) : null}
          </View>
        ))}
      </Carte>

      <Carte>
        <SousTitre>Ressenti</SousTitre>
        <Text style={styles.label}>Effort perçu (RPE 1-10)</Text>
        <Echelle min={1} max={10} valeur={rpe} onChange={setRpe} couleur={couleur} />
        <Text style={styles.label}>Ressenti digestif pendant l’effort (1-5)</Text>
        <Echelle
          min={1}
          max={5}
          valeur={ressenti}
          onChange={setRessenti}
          couleur={couleurs.sante}
        />
      </Carte>

      <Carte>
        <SousTitre>Mesures</SousTitre>
        <Champ libelle="Durée (min)" valeur={dureeMin} onChange={setDureeMin} clavier="numeric" />
        {estCourse ? (
          <Champ
            libelle="Distance (km)"
            valeur={distanceKm}
            onChange={setDistanceKm}
            clavier="numeric"
          />
        ) : null}
        <Champ libelle="Note (optionnel)" valeur={note} onChange={setNote} />
      </Carte>

      <Bouton titre="Valider la séance" couleur={couleur} onPress={valider} />
    </Ecran>
  );
}

/** Reconstruit la dernière charge connue par exercice à partir des séances réalisées. */
function derniereChargeParExercice(
  seances: { date: string; charges?: ChargeExercice[] }[],
): Record<string, number> {
  const resultat: Record<string, number> = {};
  const triees = [...seances].sort((a, b) => a.date.localeCompare(b.date));
  for (const s of triees) {
    for (const c of s.charges ?? []) resultat[c.exercice] = c.chargeKg;
  }
  return resultat;
}

function Champ({
  libelle,
  valeur,
  onChange,
  clavier = 'default',
}: {
  libelle: string;
  valeur: string;
  onChange: (v: string) => void;
  clavier?: 'default' | 'numeric';
}) {
  return (
    <View style={styles.champ}>
      <Text style={styles.label}>{libelle}</Text>
      <TextInput
        value={valeur}
        onChangeText={onChange}
        keyboardType={clavier}
        placeholderTextColor={couleurs.texteAttenue}
        style={styles.input}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  securite: { borderColor: couleurs.sante },
  exercice: { paddingVertical: espace.sm, borderTopWidth: 1, borderTopColor: couleurs.trait },
  exerciceEntete: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  exerciceNom: { fontFamily: typo.corps, fontSize: 14, color: couleurs.texte, flex: 1 },
  exerciceDose: { fontFamily: typo.donnees, fontSize: 12, color: couleurs.texteAttenue },
  ligneCharge: { flexDirection: 'row', alignItems: 'center', gap: espace.sm, marginTop: espace.xs },
  inputCharge: {
    fontFamily: typo.donnees,
    fontSize: 15,
    color: couleurs.texte,
    borderWidth: 1,
    borderColor: couleurs.trait,
    borderRadius: rayon.sm,
    paddingHorizontal: espace.md,
    paddingVertical: espace.xs,
    width: 90,
  },
  uniteCharge: { fontFamily: typo.corps, fontSize: 12, color: couleurs.texteAttenue },
  champ: { gap: espace.xs, marginTop: espace.sm },
  label: {
    fontFamily: typo.corps,
    fontSize: 13,
    color: couleurs.texteAttenue,
    marginTop: espace.sm,
  },
  input: {
    fontFamily: typo.donnees,
    fontSize: 16,
    color: couleurs.texte,
    borderWidth: 1,
    borderColor: couleurs.trait,
    borderRadius: rayon.sm,
    paddingHorizontal: espace.md,
    paddingVertical: espace.sm,
  },
});
