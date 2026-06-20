import {
  Bouton,
  Carte,
  Corps,
  Donnee,
  Ecran,
  Jauge,
  LigneNavigation,
  Pastille,
  SousTitre,
} from '@/design/composants';
import { couleurType, couleurs, espace, rayon, typo } from '@/design/theme';
import {
  type TypeSeance,
  ajouterJours,
  avertissementHydratationAvantEffort,
  formaterVolume,
  jourDeLaSemaine,
  peutSortirDePoussee,
  suggererModePousse,
} from '@/domaine';
import { useMagasin } from '@/etat/magasin';
import { Redirect, useRouter } from 'expo-router';
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
    journal,
    seances,
    adaptationDuJour,
    annulerAdaptation,
    definirModePousse,
    seanceDuJour,
    scoreFormeDuJour,
    bilanHydriqueDuJour,
  } = useMagasin();

  if (!profil) return <Redirect href="/onboarding" />;

  const enPoussee = profil.modePousse;
  const peutSortir = peutSortirDePoussee(journal, aujourdhui);
  const suggestionPoussee = !enPoussee && suggererModePousse(journal, aujourdhui);

  const lundi = ajouterJours(profil.dateDebutProgramme, (semaineCourante - 1) * 7);
  const jourAuj = jourDeLaSemaine(aujourdhui);
  const sdj = seanceDuJour();
  const journalDuJourSaisi = journal.some((e) => e.date === aujourdhui);
  // Garde-fou hydratation : seulement s'il y a une séance ET un retard marqué (jamais bloquant).
  const avertHydratation =
    sdj && bilanHydriqueDuJour ? avertissementHydratationAvantEffort(bilanHydriqueDuJour) : null;
  const couleurHydratation = bilanHydriqueDuJour
    ? bilanHydriqueDuJour.statut === 'ok'
      ? couleurs.freeletics
      : bilanHydriqueDuJour.statut === 'a-boire'
        ? couleurs.salle
        : couleurs.sante
    : couleurs.salle;

  // Dates réalisées (set) pour marquer le semainier.
  const datesFaites = new Set(seances.map((s) => s.date));
  const kmCumules = seances.reduce((acc, s) => acc + (s.distanceKm ?? 0), 0);
  const streak = calculerStreak(planifieesSemaine, datesFaites, lundi);

  const phase = planifieesSemaine[0]?.phase ?? 'reprise';
  const progression = Math.min(100, Math.round((semaineCourante / 16) * 100));

  return (
    <Ecran>
      {/* Mode poussée : pause du plan + protocole de reprise (jamais imposé). */}
      {enPoussee ? (
        <Carte style={styles.adaptation}>
          <SousTitre>Mode poussée actif</SousTitre>
          <Corps style={{ color: couleurs.texte }}>
            Le plan est en pause : maintien minimal seulement (marche, mobilité, respiration).
            Continue ton journal — c’est maintenant qu’il compte le plus.
          </Corps>
          <Bouton
            titre={
              peutSortir ? 'Je vais mieux — reprendre' : 'Reprise possible après 3 jours stables'
            }
            couleur={couleurs.freeletics}
            disabled={!peutSortir}
            onPress={() => peutSortir && definirModePousse(false)}
          />
        </Carte>
      ) : suggestionPoussee ? (
        <Carte style={styles.adaptation}>
          <SousTitre>Plusieurs jours difficiles</SousTitre>
          <Corps style={{ color: couleurs.texte }}>
            5 jours dégradés d’affilée. Si tu traverses une poussée, tu peux mettre le plan en pause
            — sans aucune notion d’échec.
          </Corps>
          <Bouton
            titre="Activer le mode poussée"
            couleur={couleurs.sante}
            onPress={() => definirModePousse(true)}
          />
        </Carte>
      ) : null}

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

      {/* Forme du jour — score + décomposition ; sinon, invitation à saisir le journal. */}
      {scoreFormeDuJour ? (
        <Pressable onPress={() => router.push('/forme')} accessibilityRole="button">
          <Carte>
            <View style={styles.ligneEntete}>
              <SousTitre>Forme du jour</SousTitre>
              <Donnee
                valeur={scoreFormeDuJour.score}
                unite="/100"
                couleur={
                  scoreFormeDuJour.score >= 75
                    ? couleurs.freeletics
                    : scoreFormeDuJour.score >= 50
                      ? couleurs.course
                      : couleurs.sante
                }
              />
            </View>
            <View style={styles.barresForme}>
              {scoreFormeDuJour.composantes.map((c) => (
                <View key={c.cle} style={styles.barreFormePiste}>
                  <View
                    style={[
                      styles.barreFormeRemplie,
                      { width: `${Math.round(c.sousScore * 100)}%` },
                    ]}
                  />
                </View>
              ))}
            </View>
            <Text style={styles.lienForme}>Voir la décomposition →</Text>
          </Carte>
        </Pressable>
      ) : !journalDuJourSaisi ? (
        <Carte>
          <SousTitre>Journal non saisi</SousTitre>
          <Corps>
            Moins de 10 secondes pour saisir tes signaux du jour — ils pilotent l’adaptation de ta
            séance.
          </Corps>
          <Bouton
            titre="Saisir le journal"
            couleur={couleurs.sante}
            onPress={() => router.push('/journal')}
          />
        </Carte>
      ) : null}

      {/* Hydratation du jour — bilan net vs objectif adaptatif, accès au détail. */}
      {bilanHydriqueDuJour ? (
        <Pressable onPress={() => router.push('/hydratation')} accessibilityRole="button">
          <Carte>
            <View style={styles.ligneEntete}>
              <SousTitre>Hydratation</SousTitre>
              <Donnee
                valeur={formaterVolume(bilanHydriqueDuJour.apportNetMl)}
                couleur={couleurHydratation}
              />
            </View>
            <Jauge
              valeur={Math.min(100, Math.round(bilanHydriqueDuJour.ratio * 100))}
              couleur={couleurHydratation}
            />
            <Text style={styles.lienForme}>
              {bilanHydriqueDuJour.statut === 'ok'
                ? 'Objectif atteint — '
                : `Reste ${formaterVolume(bilanHydriqueDuJour.resteMl)} · `}
              objectif {formaterVolume(bilanHydriqueDuJour.objectifMl)} →
            </Text>
          </Carte>
        </Pressable>
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
        <Jauge valeur={progression} />
      </Carte>

      {/* Prochaine séance. */}
      <Carte>
        <SousTitre>Séance du jour</SousTitre>
        {avertHydratation ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/hydratation')}
            style={styles.gardeFou}
          >
            <Text style={styles.gardeFouTexte}>💧 {avertHydratation}</Text>
          </Pressable>
        ) : null}
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
        <Bouton
          titre="Séance libre"
          variante="secondaire"
          onPress={() => router.push('/seance-libre')}
        />
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

      {/* Suivis complémentaires — le reste (tendances, bilan, réglages) vit dans les onglets. */}
      <LigneNavigation
        titre="Alimentation du jour"
        detail="Coche ce que tu as mangé et bu"
        icone="coffee"
        couleur={couleurs.sante}
        onPress={() => router.push('/alimentation')}
      />
      <LigneNavigation
        titre="Hydratation"
        detail="Eau utile vs objectif adaptatif"
        icone="droplet"
        couleur={couleurs.salle}
        onPress={() => router.push('/hydratation')}
      />
      <LigneNavigation
        titre="Mesures corporelles"
        detail="Poids hebdo, mensurations bi-hebdo"
        icone="bar-chart-2"
        couleur={couleurs.salle}
        onPress={() => router.push('/mesures')}
      />

      <Text style={styles.disclaimer}>
        Rappel : programme à valider avec ton médecin. L’app ne remplace pas un avis gastro.
      </Text>
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

const styles = StyleSheet.create({
  adaptation: { borderColor: couleurs.sante },
  annuler: { fontFamily: typo.corps, fontSize: 13, color: couleurs.sante, marginTop: espace.xs },
  ligneEntete: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  barresForme: { flexDirection: 'row', gap: espace.xs, marginTop: espace.md },
  barreFormePiste: {
    flex: 1,
    height: 6,
    backgroundColor: couleurs.fond,
    borderRadius: 3,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: couleurs.trait,
  },
  barreFormeRemplie: { height: '100%', backgroundColor: couleurs.freeletics },
  lienForme: {
    fontFamily: typo.corps,
    fontSize: 12,
    color: couleurs.texteAttenue,
    marginTop: espace.sm,
  },
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
  titreSeance: { fontFamily: typo.titre, fontSize: 18 },
  gardeFou: {
    backgroundColor: couleurs.fond,
    borderWidth: 1,
    borderColor: couleurs.salle,
    borderRadius: rayon.sm,
    padding: espace.sm,
  },
  gardeFouTexte: { fontFamily: typo.corps, fontSize: 13, color: couleurs.texte, lineHeight: 18 },
  indicateurs: { flexDirection: 'row', gap: espace.lg },
  indicateur: { flex: 1 },
  disclaimer: {
    fontFamily: typo.corps,
    fontSize: 12,
    color: couleurs.texteAttenue,
    textAlign: 'center',
    marginTop: espace.sm,
  },
});
