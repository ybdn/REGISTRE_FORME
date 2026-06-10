import {
  Bouton,
  Carte,
  Corps,
  Donnee,
  Ecran,
  Pastille,
  SousTitre,
  Titre,
} from '@/design/composants';
import { couleurType, couleurs, espace, rayon, typo } from '@/design/theme';
import { type TypeSeance, ajouterJours, jourDeLaSemaine } from '@/domaine';
import { useMagasin } from '@/etat/magasin';
import { Link, Redirect, useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

const JOURS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const LIBELLE_PHASE = {
  reprise: 'Reprise',
  construction: 'Construction',
  performance: 'Performance',
} as const;

export default function TableauDeBord() {
  const router = useRouter();
  const {
    profil,
    aujourdhui,
    semaineCourante,
    planifieesSemaine,
    seances,
    adaptationDuJour,
    annulerAdaptation,
    seanceDuJour,
  } = useMagasin();

  if (!profil) return <Redirect href="/onboarding" />;

  const lundi = ajouterJours(profil.dateDebutProgramme, (semaineCourante - 1) * 7);
  const jourAuj = jourDeLaSemaine(aujourdhui);
  const sdj = seanceDuJour();

  // Dates réalisées (set) pour marquer le semainier.
  const datesFaites = new Set(seances.map((s) => s.date));
  const kmCumules = seances.reduce((acc, s) => acc + (s.distanceKm ?? 0), 0);
  const streak = calculerStreak(planifieesSemaine, datesFaites, lundi);

  const phase = planifieesSemaine[0]?.phase ?? 'reprise';
  const progression = Math.min(100, Math.round((semaineCourante / 16) * 100));

  return (
    <Ecran>
      {/* Bannière d'adaptation — message bienveillant, annulable d'un tap. */}
      {adaptationDuJour && adaptationDuJour.type !== 'aucune' ? (
        <Carte style={styles.adaptation}>
          <SousTitre>Adaptation du jour</SousTitre>
          <Corps style={{ color: couleurs.texte }}>{adaptationDuJour.raison}</Corps>
          <Pressable onPress={annulerAdaptation} accessibilityRole="button">
            <Text style={styles.annuler}>Annuler cette adaptation</Text>
          </Pressable>
        </Carte>
      ) : null}

      {/* Semainier façon planning de service. */}
      <Carte>
        <View style={styles.ligneEntete}>
          <SousTitre>
            Semaine {semaineCourante}/16 · {LIBELLE_PHASE[phase]}
          </SousTitre>
        </View>
        <View style={styles.semainier}>
          {JOURS.map((lettre, jour) => {
            const planif = planifieesSemaine.find((s) => s.jour === jour);
            const date = ajouterJours(lundi, jour);
            const fait = datesFaites.has(date);
            const estAuj = jour === jourAuj;
            return (
              // Semaine fixe de 7 jours, jamais réordonnée : l'index est l'identité du jour.
              // biome-ignore lint/suspicious/noArrayIndexKey: liste statique stable
              <View key={`${lettre}-${jour}`} style={[styles.cellule, estAuj && styles.celluleAuj]}>
                <Text style={[styles.jourLettre, estAuj && styles.jourLettreAuj]}>{lettre}</Text>
                {planif ? (
                  <Pastille couleur={couleurType[planif.type as TypeSeance]} plein={fait} />
                ) : (
                  <View style={styles.pastilleVide} />
                )}
              </View>
            );
          })}
        </View>
        <BarreProgression valeur={progression} />
      </Carte>

      {/* Prochaine séance. */}
      <Carte>
        <SousTitre>Séance du jour</SousTitre>
        {sdj ? (
          <>
            <Text style={[styles.titreSeance, { color: couleurType[sdj.planifiee.type] }]}>
              {sdj.allegee ? 'Version allégée' : sdj.planifiee.titre}
            </Text>
            {sdj.allegee ? (
              <Corps>Adaptée à tes signaux santé : EF courte, mobilité, marche.</Corps>
            ) : null}
            <Bouton
              titre="Ouvrir la séance"
              couleur={couleurType[sdj.planifiee.type]}
              onPress={() => router.push('/seance')}
            />
          </>
        ) : (
          <Corps>Repos aujourd’hui. La constance prime sur le volume.</Corps>
        )}
      </Carte>

      {/* Indicateurs. */}
      <View style={styles.indicateurs}>
        <Carte style={styles.indicateur}>
          <Corps>Régularité</Corps>
          <Donnee valeur={streak} unite="séances" couleur={couleurs.freeletics} />
        </Carte>
        <Carte style={styles.indicateur}>
          <Corps>Km cumulés</Corps>
          <Donnee valeur={kmCumules.toFixed(1)} unite="km" couleur={couleurs.course} />
        </Carte>
      </View>

      <Bouton
        titre="Saisir le journal Crohn"
        variante="secondaire"
        onPress={() => router.push('/journal')}
      />

      <Bouton
        titre="Mesures corporelles"
        variante="secondaire"
        onPress={() => router.push('/mesures')}
      />

      <Bouton
        titre="Réglages & données"
        variante="secondaire"
        onPress={() => router.push('/reglages')}
      />

      <Link href="/journal" style={styles.lienDisclaimer}>
        <Text style={styles.disclaimer}>
          Rappel : programme à valider avec ton médecin. L’app ne remplace pas un avis gastro.
        </Text>
      </Link>
    </Ecran>
  );
}

/** Compte les séances planifiées de la semaine déjà réalisées (régularité, pas dépassement). */
function calculerStreak(
  planifiees: { jour: number }[],
  datesFaites: Set<string>,
  lundi: string,
): number {
  return planifiees.filter((p) => datesFaites.has(ajouterJours(lundi, p.jour))).length;
}

function BarreProgression({ valeur }: { valeur: number }) {
  return (
    <View style={styles.barre}>
      <View style={[styles.barreRemplie, { width: `${valeur}%` }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  adaptation: { borderColor: couleurs.sante },
  annuler: { fontFamily: typo.corps, fontSize: 13, color: couleurs.sante, marginTop: espace.xs },
  ligneEntete: { flexDirection: 'row', justifyContent: 'space-between' },
  semainier: { flexDirection: 'row', justifyContent: 'space-between', marginVertical: espace.md },
  cellule: {
    alignItems: 'center',
    gap: espace.sm,
    paddingVertical: espace.sm,
    paddingHorizontal: espace.xs,
    borderRadius: rayon.sm,
    minWidth: 36,
  },
  celluleAuj: { backgroundColor: couleurs.fond, borderWidth: 1, borderColor: couleurs.trait },
  jourLettre: { fontFamily: typo.donnees, fontSize: 12, color: couleurs.texteAttenue },
  jourLettreAuj: { color: couleurs.texte },
  pastilleVide: { width: 14, height: 14 },
  barre: {
    height: 6,
    backgroundColor: couleurs.fond,
    borderRadius: 3,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: couleurs.trait,
  },
  barreRemplie: { height: '100%', backgroundColor: couleurs.salle },
  titreSeance: { fontFamily: typo.titre, fontSize: 18 },
  indicateurs: { flexDirection: 'row', gap: espace.lg },
  indicateur: { flex: 1 },
  lienDisclaimer: { marginTop: espace.sm },
  disclaimer: {
    fontFamily: typo.corps,
    fontSize: 12,
    color: couleurs.texteAttenue,
    textAlign: 'center',
  },
});
