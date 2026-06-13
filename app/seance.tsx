import {
  Bouton,
  Carte,
  Corps,
  Donnee,
  Echelle,
  Ecran,
  SousTitre,
  Titre,
} from '@/design/composants';
import { couleurType, couleurs, espace, rayon, typo } from '@/design/theme';
import {
  type AlluresCibles,
  type ChargeExercice,
  type CibleExercice,
  type ExerciceModele,
  type ModeleSeance,
  PREAVIS_FIN_REPOS_SEC,
  REPOS_SERIE_SEC,
  type SeanceRealisee,
  alluresCibles,
  estimerVMA,
  formaterDureeSec,
  obtenirModele,
  prochaineCible,
} from '@/domaine';
import { type SeanceDuJour, useMagasin } from '@/etat/magasin';
import * as Haptics from 'expo-haptics';
import { useKeepAwake } from 'expo-keep-awake';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

// ─────────────────────────────────────────────────────────────────────────────
// MODE SÉANCE GUIDÉE (doc 04 §4.1) — déroulé exercice par exercice :
// cible pré-calculée (double progression §2.4), allures personnalisées (§2.5),
// timers (repos, 30/30, gainage) avec haptique, écran allumé, récap pré-rempli.
// Objectif : valider une séance conforme au prévu en ≤ 3 taps.
// ─────────────────────────────────────────────────────────────────────────────

/** Descripteurs verbaux du RPE (sélecteur du récap). */
const DESCRIPTEURS_RPE: Record<number, string> = {
  1: 'très facile',
  2: 'facile',
  3: 'modéré',
  4: 'assez soutenu',
  5: 'soutenu',
  6: 'légèrement difficile',
  7: 'difficile — ~3 reps en réserve',
  8: 'très difficile — ~2 reps en réserve',
  9: 'extrême — ~1 rep en réserve',
  10: 'maximal — rien en réserve',
};

/** Nature d'un exercice pour le déroulé guidé (pilote le timer affiché). */
type NatureExercice = 'series' | 'gainage' | 'minutes' | 'trente-trente';

function natureExercice(ex: ExerciceModele): NatureExercice {
  if (ex.nom.includes('30 s')) return 'trente-trente';
  if (ex.groupeMusculaire === 'gainage' || ex.consigne?.includes('seconde')) return 'gainage';
  if (ex.consigne?.includes('minute')) return 'minutes';
  return 'series';
}

/** Série effectivement réalisée pendant le déroulé (alimente le récap et les charges). */
interface SerieRealisee {
  reps: number;
  chargeKg: number | null;
}

/** Séance modérée : une série de moins par exercice (−20 % sur les gros blocs type 30/30). */
function seriesEffectives(series: number, moderee: boolean): number {
  if (!moderee) return series;
  return series >= 6 ? Math.round(series * 0.8) : Math.max(1, series - 1);
}

export default function EcranSeance() {
  useKeepAwake(); // L'écran reste allumé pendant toute la séance.
  const router = useRouter();
  const { aujourdhui, seances, validerSeance, seanceDuJour, seanceLibre, adaptationDuJour } =
    useMagasin();
  // `modele` en paramètre = séance libre (choisie hors plan), sinon séance planifiée du jour.
  const { modele: modeleLibre } = useLocalSearchParams<{ modele?: string }>();
  const sdj = modeleLibre ? seanceLibre(modeleLibre) : seanceDuJour();
  const navigation = useNavigation();
  useEffect(() => {
    if (modeleLibre) navigation.setOptions({ title: 'Séance libre' });
  }, [modeleLibre, navigation]);
  const modele = sdj ? obtenirModele(sdj.modeleApplique) : undefined;
  const moderee = sdj?.niveau === 'moderee';

  // `ralentir_progression` actif (appliqué OU déclenché) et séance modérée gèlent
  // tous deux les incréments de charge — les reps peuvent encore progresser.
  const gelCharges =
    moderee ||
    adaptationDuJour?.type === 'ralentir_progression' ||
    (adaptationDuJour?.reglesAussiDeclenchees.includes('ralentir_progression') ?? false);

  // Cibles pré-calculées (double progression) et allures personnalisées (VMA).
  const cibles = useMemo(() => {
    if (!modele) return new Map<string, CibleExercice>();
    return new Map(
      modele.exercices.map((ex) => [
        ex.nom,
        prochaineCible(seances, ex, { date: aujourdhui, ralentirProgression: gelCharges }),
      ]),
    );
  }, [modele, seances, aujourdhui, gelCharges]);
  const allures = useMemo(() => {
    const vma = estimerVMA(seances);
    return vma === null ? null : alluresCibles(vma);
  }, [seances]);

  const [etape, setEtape] = useState<'intro' | 'exercice' | 'recap'>('intro');
  const [indexExo, setIndexExo] = useState(0);
  const [resultats, setResultats] = useState<Record<string, SerieRealisee[]>>({});
  const debutMs = useRef<number | null>(null);

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
  const exercices = modele.exercices;

  function exerciceTermine(nom: string, series: SerieRealisee[]) {
    setResultats((r) => ({ ...r, [nom]: series }));
    if (indexExo + 1 < exercices.length) setIndexExo(indexExo + 1);
    else setEtape('recap');
  }

  if (etape === 'intro') {
    return (
      <Ecran>
        <Titre>{sdj.allegee ? 'Séance allégée' : modele.titre}</Titre>
        {moderee ? (
          <Carte style={styles.securite}>
            <Corps style={{ color: couleurs.texte }}>
              Séance modérée : une série de moins par exercice, charges conservées. Pas de
              progression aujourd’hui.
            </Corps>
          </Carte>
        ) : null}
        {modele.noteSecurite ? (
          <Carte style={styles.securite}>
            <SousTitre>Avant de commencer</SousTitre>
            <Corps style={{ color: couleurs.texte }}>⚠️ {modele.noteSecurite}</Corps>
            <Corps>💧 Pense à boire avant et pendant la séance.</Corps>
          </Carte>
        ) : null}
        <Carte>
          <SousTitre>Au programme</SousTitre>
          {exercices.map((ex) => {
            const cible = cibles.get(ex.nom);
            const series = seriesEffectives(ex.series, moderee);
            return (
              <View key={ex.nom} style={styles.apercuLigne}>
                <Text style={styles.apercuNom}>{ex.nom}</Text>
                <Text style={styles.apercuCible}>
                  {cible?.chargeKg != null
                    ? `${cible.chargeKg} kg × ${series}×${cible.reps}`
                    : `${series} × ${ex.reps}${ex.consigne ? ` ${ex.consigne}` : ''}`}
                </Text>
              </View>
            );
          })}
        </Carte>
        <Bouton
          titre="Commencer la séance"
          couleur={couleur}
          onPress={() => {
            debutMs.current = Date.now();
            setEtape('exercice');
          }}
        />
        <Bouton titre="Retour" variante="secondaire" onPress={() => router.back()} />
      </Ecran>
    );
  }

  const exerciceCourant = exercices[indexExo];
  if (etape === 'exercice' && exerciceCourant) {
    const ex = exerciceCourant;
    return (
      <Ecran>
        <Text style={styles.progression}>
          Exercice {indexExo + 1}/{exercices.length}
        </Text>
        <Titre>{ex.nom}</Titre>
        <ExerciceGuide
          key={ex.nom}
          exercice={ex}
          series={seriesEffectives(ex.series, moderee)}
          cible={cibles.get(ex.nom)}
          allures={allures}
          couleur={couleur}
          onTermine={(series) => exerciceTermine(ex.nom, series)}
          onPasser={() => exerciceTermine(ex.nom, [])}
        />
      </Ecran>
    );
  }

  return (
    <Recap
      modele={modele}
      sdj={sdj}
      couleur={couleur}
      resultats={resultats}
      dureeMesureeMin={
        debutMs.current
          ? Math.max(1, Math.round((Date.now() - debutMs.current) / 60000))
          : modele.dureeMin
      }
      onValide={async (seance) => {
        await validerSeance(seance);
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        router.replace('/');
      }}
    />
  );
}

// ─── Déroulé d'un exercice ───────────────────────────────────────────────────

function ExerciceGuide({
  exercice,
  series,
  cible,
  allures,
  couleur,
  onTermine,
  onPasser,
}: {
  exercice: ExerciceModele;
  series: number;
  cible: CibleExercice | undefined;
  allures: AlluresCibles | null;
  couleur: string;
  onTermine: (series: SerieRealisee[]) => void;
  onPasser: () => void;
}) {
  const nature = natureExercice(exercice);
  return (
    <>
      {cible?.chargeKg != null ? (
        <Carte>
          <Donnee valeur={`${cible.chargeKg} kg × ${cible.reps}`} couleur={couleur} />
          {cible.dernierePerf ? (
            <Corps>
              Dernière fois : {cible.dernierePerf.chargeKg} kg × {cible.dernierePerf.series}×
              {cible.dernierePerf.reps}
            </Corps>
          ) : null}
          <Text style={styles.raison}>{cible.raison}</Text>
        </Carte>
      ) : null}
      <AllureExercice nomExercice={exercice.nom} allures={allures} />
      {nature === 'series' ? (
        <SeriesGuidees
          exercice={exercice}
          series={series}
          cible={cible}
          couleur={couleur}
          onTermine={onTermine}
        />
      ) : null}
      {nature === 'gainage' ? (
        <GainageGuide exercice={exercice} series={series} couleur={couleur} onTermine={onTermine} />
      ) : null}
      {nature === 'minutes' ? (
        <MinutesGuidees exercice={exercice} couleur={couleur} onTermine={onTermine} />
      ) : null}
      {nature === 'trente-trente' ? (
        <TrenteTrenteGuide
          exercice={exercice}
          series={series}
          couleur={couleur}
          onTermine={onTermine}
        />
      ) : null}
      <Bouton titre="Passer cet exercice" variante="secondaire" onPress={onPasser} />
    </>
  );
}

/** Allure cible personnalisée d'un exercice de course — rien sans test chrono (UI v1). */
function AllureExercice({
  nomExercice,
  allures,
}: {
  nomExercice: string;
  allures: AlluresCibles | null;
}) {
  if (!allures) return null;
  let texte: string | null = null;
  if (nomExercice.includes('30 s')) texte = allures.trenteTrente.texte;
  else if (nomExercice.includes('400 m')) texte = allures.quatreCents.texte;
  else if (nomExercice.includes('EF') || nomExercice.includes('longue')) texte = allures.ef.texte;
  if (!texte) return null;
  return (
    <Carte>
      <SousTitre>Allure cible</SousTitre>
      <Corps style={{ color: couleurs.texte }}>
        {texte} (VMA estimée {allures.vmaKmH} km/h)
      </Corps>
    </Carte>
  );
}

/** Séries avec validation 1-tap, ajustement fin et repos automatique entre séries. */
function SeriesGuidees({
  exercice,
  series,
  cible,
  couleur,
  onTermine,
}: {
  exercice: ExerciceModele;
  series: number;
  cible: CibleExercice | undefined;
  couleur: string;
  onTermine: (series: SerieRealisee[]) => void;
}) {
  const repsCible = cible?.reps ?? exercice.reps;
  const chargeCible = cible?.chargeKg ?? null;
  const [faites, setFaites] = useState<SerieRealisee[]>([]);
  const [ajuster, setAjuster] = useState(false);
  const [repsAjuste, setRepsAjuste] = useState(String(repsCible));
  const [chargeAjustee, setChargeAjustee] = useState(
    chargeCible === null ? '' : String(chargeCible),
  );
  const [reposSec, setReposSec] = useState(REPOS_SERIE_SEC);
  const repos = useCompteARebours();

  function validerSerie(serie: SerieRealisee) {
    const total = [...faites, serie];
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (total.length >= series) {
      onTermine(total);
      return;
    }
    setFaites(total);
    setAjuster(false);
    repos.lancer(reposSec);
  }

  if (repos.restant !== null) {
    return (
      <ReposEnCours
        restant={repos.restant}
        couleur={couleur}
        onProlonger={() => repos.lancer((repos.restant ?? 0) + 30)}
        onPasser={repos.arreter}
      />
    );
  }

  return (
    <Carte>
      <SousTitre>
        Série {faites.length + 1}/{series}
      </SousTitre>
      {ajuster ? (
        <View style={styles.ajustement}>
          <ChampCourt libelle="Reps" valeur={repsAjuste} onChange={setRepsAjuste} />
          {chargeCible !== null ? (
            <ChampCourt libelle="kg" valeur={chargeAjustee} onChange={setChargeAjustee} />
          ) : null}
          <Bouton
            titre="Valider la série"
            couleur={couleur}
            onPress={() =>
              validerSerie({
                reps: Number(repsAjuste) || repsCible,
                chargeKg: chargeCible === null ? null : Number(chargeAjustee) || chargeCible,
              })
            }
          />
        </View>
      ) : (
        <>
          <Bouton
            titre={`Série validée — ${
              chargeCible !== null ? `${chargeCible} kg × ${repsCible}` : `${repsCible} reps`
            }`}
            couleur={couleur}
            onPress={() => validerSerie({ reps: repsCible, chargeKg: chargeCible })}
          />
          <Bouton titre="Ajusté" variante="secondaire" onPress={() => setAjuster(true)} />
        </>
      )}
      <View style={styles.reposReglage}>
        <Text style={styles.reposLabel}>Repos : {reposSec} s</Text>
        <Pressable style={styles.stepBtn} onPress={() => setReposSec((s) => Math.max(30, s - 15))}>
          <Text style={styles.stepBtnTexte}>−</Text>
        </Pressable>
        <Pressable style={styles.stepBtn} onPress={() => setReposSec((s) => Math.min(300, s + 15))}>
          <Text style={styles.stepBtnTexte}>+</Text>
        </Pressable>
      </View>
    </Carte>
  );
}

/** Repos entre séries : compte à rebours bien visible, haptique à T−10 s. */
function ReposEnCours({
  restant,
  couleur,
  onProlonger,
  onPasser,
}: {
  restant: number;
  couleur: string;
  onProlonger: () => void;
  onPasser: () => void;
}) {
  return (
    <Carte style={styles.timerCarte}>
      <SousTitre>Repos</SousTitre>
      <Text style={[styles.timerGeant, { color: couleur }]}>{formaterDureeSec(restant)}</Text>
      <Bouton titre="+30 s" variante="secondaire" onPress={onProlonger} />
      <Bouton titre="Reprendre maintenant" couleur={couleur} onPress={onPasser} />
    </Carte>
  );
}

/** Gainage : compte à rebours par série, consigne de respiration MICI en évidence. */
function GainageGuide({
  exercice,
  series,
  couleur,
  onTermine,
}: {
  exercice: ExerciceModele;
  series: number;
  couleur: string;
  onTermine: (series: SerieRealisee[]) => void;
}) {
  const dureeSec = exercice.reps; // les « reps » d'un gainage sont des secondes
  const [faites, setFaites] = useState(0);
  const compte = useCompteARebours(() => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const total = faites + 1;
    if (total >= series) {
      onTermine(Array.from({ length: total }, () => ({ reps: dureeSec, chargeKg: null })));
      return;
    }
    setFaites(total);
  });

  return (
    <Carte style={styles.timerCarte}>
      <SousTitre>
        Série {Math.min(faites + 1, series)}/{series} — {dureeSec} s
      </SousTitre>
      <Corps style={{ color: couleurs.texte }}>
        🫁 Respiration libre, ventre relâché — jamais en apnée.
      </Corps>
      {compte.restant !== null ? (
        <Text style={[styles.timerGeant, { color: couleur }]}>
          {formaterDureeSec(compte.restant)}
        </Text>
      ) : (
        <Bouton
          titre={`Lancer ${dureeSec} s`}
          couleur={couleur}
          onPress={() => compte.lancer(dureeSec)}
        />
      )}
    </Carte>
  );
}

/** Exercice en minutes (échauffement, EF, retour au calme) : compte à rebours simple. */
function MinutesGuidees({
  exercice,
  couleur,
  onTermine,
}: {
  exercice: ExerciceModele;
  couleur: string;
  onTermine: (series: SerieRealisee[]) => void;
}) {
  const compte = useCompteARebours(() => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onTermine([{ reps: exercice.reps, chargeKg: null }]);
  });

  return (
    <Carte style={styles.timerCarte}>
      <SousTitre>{exercice.reps} minutes</SousTitre>
      {exercice.consigne ? <Corps>{exercice.consigne}</Corps> : null}
      {compte.restant !== null ? (
        <Text style={[styles.timerGeant, { color: couleur }]}>
          {formaterDureeSec(compte.restant)}
        </Text>
      ) : (
        <Bouton
          titre="Lancer le chrono"
          couleur={couleur}
          onPress={() => compte.lancer(exercice.reps * 60)}
        />
      )}
      <Bouton
        titre="Terminé"
        variante="secondaire"
        onPress={() => {
          compte.arreter();
          onTermine([{ reps: exercice.reps, chargeKg: null }]);
        }}
      />
    </Carte>
  );
}

/** Bloc 30/30 : alternance 30 s vite / 30 s lent, haptique au changement de phase. */
function TrenteTrenteGuide({
  exercice,
  series,
  couleur,
  onTermine,
}: {
  exercice: ExerciceModele;
  series: number;
  couleur: string;
  onTermine: (series: SerieRealisee[]) => void;
}) {
  const [repetition, setRepetition] = useState(0); // répétitions terminées
  const [vite, setVite] = useState(true);
  const compte = useCompteARebours(() => {
    if (vite) {
      // Fin de la portion rapide → 30 s lentes.
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setVite(false);
      compte.lancer(30);
      return;
    }
    const total = repetition + 1;
    if (total >= series) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onTermine(Array.from({ length: total }, () => ({ reps: 1, chargeKg: null })));
      return;
    }
    // Répétition suivante → 30 s rapides.
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setRepetition(total);
    setVite(true);
    compte.lancer(30);
  });

  const enCours = compte.restant !== null;
  return (
    <Carte style={styles.timerCarte}>
      <SousTitre>
        Répétition {Math.min(repetition + 1, series)}/{series}
      </SousTitre>
      {enCours ? (
        <>
          <Text style={[styles.phase3030, { color: vite ? couleur : couleurs.texteAttenue }]}>
            {vite ? 'VITE' : 'lent'}
          </Text>
          <Text style={[styles.timerGeant, { color: vite ? couleur : couleurs.texteAttenue }]}>
            {formaterDureeSec(compte.restant ?? 0)}
          </Text>
        </>
      ) : (
        <Bouton
          titre="Lancer le bloc 30/30"
          couleur={couleur}
          onPress={() => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
            setVite(true);
            compte.lancer(30);
          }}
        />
      )}
    </Carte>
  );
}

// ─── Récap final pré-rempli (3 taps si conforme au prévu) ────────────────────

function Recap({
  modele,
  sdj,
  couleur,
  resultats,
  dureeMesureeMin,
  onValide,
}: {
  modele: ModeleSeance;
  sdj: SeanceDuJour;
  couleur: string;
  resultats: Record<string, SerieRealisee[]>;
  dureeMesureeMin: number;
  onValide: (seance: Omit<SeanceRealisee, 'id'>) => Promise<void>;
}) {
  const { aujourdhui } = useMagasin();
  const estCourse = sdj.planifiee.type === 'course';
  const estTestChrono = modele.id === 'test-3000';

  const [rpe, setRpe] = useState(5);
  const [ressenti, setRessenti] = useState(3);
  const [dureeMin, setDureeMin] = useState(String(dureeMesureeMin));
  const [distanceKm, setDistanceKm] = useState(estTestChrono ? '3' : '');
  const [tempsMin, setTempsMin] = useState('');
  const [tempsSecondes, setTempsSecondes] = useState('');
  const [note, setNote] = useState('');

  // Charges persistées : agrégat conservateur par exercice (reps = minimum des séries,
  // charge = celle de la dernière série) — c'est ce que lit la double progression.
  const charges: ChargeExercice[] = modele.exercices.flatMap((ex) => {
    const series = resultats[ex.nom] ?? [];
    const chargees = series.filter(
      (s): s is SerieRealisee & { chargeKg: number } => s.chargeKg !== null,
    );
    const derniereSerie = chargees[chargees.length - 1];
    if (!derniereSerie) return [];
    return [
      {
        exercice: ex.nom,
        series: chargees.length,
        reps: Math.min(...chargees.map((s) => s.reps)),
        chargeKg: derniereSerie.chargeKg,
      },
    ];
  });

  async function valider() {
    const tempsSec =
      estTestChrono && (tempsMin || tempsSecondes)
        ? (Number(tempsMin) || 0) * 60 + (Number(tempsSecondes) || 0)
        : undefined;
    await onValide({
      date: aujourdhui,
      type: sdj.planifiee.type,
      variante: sdj.niveau,
      rpe,
      dureeMin: Number(dureeMin) || dureeMesureeMin,
      distanceKm: estCourse && distanceKm ? Number(distanceKm) : undefined,
      tempsSec,
      charges: charges.length > 0 ? charges : undefined,
      ressentiDigestif: ressenti,
      note: note.trim() || undefined,
    });
  }

  return (
    <Ecran>
      <Titre>Récap de séance</Titre>
      {charges.length > 0 ? (
        <Carte>
          <SousTitre>Charges réalisées</SousTitre>
          {charges.map((c) => (
            <View key={c.exercice} style={styles.apercuLigne}>
              <Text style={styles.apercuNom}>{c.exercice}</Text>
              <Text style={styles.apercuCible}>
                {c.chargeKg} kg × {c.series}×{c.reps}
              </Text>
            </View>
          ))}
        </Carte>
      ) : null}

      <Carte>
        <SousTitre>Effort perçu (RPE)</SousTitre>
        <Echelle min={1} max={10} valeur={rpe} onChange={setRpe} couleur={couleur} />
        <Text style={styles.descripteurRpe}>
          {rpe} — {DESCRIPTEURS_RPE[rpe]}
        </Text>
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
        <ChampCourt libelle="Durée (min)" valeur={dureeMin} onChange={setDureeMin} />
        {estCourse ? (
          <ChampCourt libelle="Distance (km)" valeur={distanceKm} onChange={setDistanceKm} />
        ) : null}
        {estTestChrono ? (
          <View style={styles.ajustement}>
            <ChampCourt libelle="Chrono min" valeur={tempsMin} onChange={setTempsMin} />
            <ChampCourt libelle="sec" valeur={tempsSecondes} onChange={setTempsSecondes} />
          </View>
        ) : null}
        <Text style={styles.label}>Note (optionnel)</Text>
        <TextInput
          value={note}
          onChangeText={setNote}
          placeholderTextColor={couleurs.texteAttenue}
          style={styles.input}
        />
      </Carte>

      <Bouton titre="Valider la séance" couleur={couleur} onPress={valider} />
    </Ecran>
  );
}

// ─── Briques locales ─────────────────────────────────────────────────────────

/**
 * Compte à rebours seconde par seconde. Haptique d'avertissement à T−10 s
 * (préavis de fin) puis `onFin` à 0.
 */
function useCompteARebours(onFin?: () => void) {
  const [restant, setRestant] = useState<number | null>(null);
  const onFinRef = useRef(onFin);
  onFinRef.current = onFin;

  useEffect(() => {
    if (restant === null) return;
    if (restant === PREAVIS_FIN_REPOS_SEC) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    }
    if (restant <= 0) {
      setRestant(null);
      onFinRef.current?.();
      return;
    }
    const t = setTimeout(() => setRestant((r) => (r === null ? null : r - 1)), 1000);
    return () => clearTimeout(t);
  }, [restant]);

  return {
    restant,
    lancer: (sec: number) => setRestant(sec),
    arreter: () => setRestant(null),
  };
}

function ChampCourt({
  libelle,
  valeur,
  onChange,
}: {
  libelle: string;
  valeur: string;
  onChange: (v: string) => void;
}) {
  return (
    <View style={styles.champCourt}>
      <Text style={styles.label}>{libelle}</Text>
      <TextInput
        value={valeur}
        onChangeText={onChange}
        keyboardType="numeric"
        placeholderTextColor={couleurs.texteAttenue}
        style={styles.inputCourt}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  securite: { borderColor: couleurs.sante },
  progression: { fontFamily: typo.donnees, fontSize: 12, color: couleurs.texteAttenue },
  apercuLigne: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: espace.xs,
    gap: espace.sm,
  },
  apercuNom: { fontFamily: typo.corps, fontSize: 13, color: couleurs.texte, flex: 1 },
  apercuCible: { fontFamily: typo.donnees, fontSize: 12, color: couleurs.texteAttenue },
  raison: { fontFamily: typo.corps, fontSize: 12, color: couleurs.texteAttenue },
  timerCarte: { alignItems: 'stretch', gap: espace.md },
  timerGeant: {
    fontFamily: typo.donnees,
    fontSize: 64,
    textAlign: 'center',
    paddingVertical: espace.lg,
  },
  phase3030: { fontFamily: typo.titre, fontSize: 24, textAlign: 'center' },
  ajustement: { flexDirection: 'row', alignItems: 'flex-end', gap: espace.md, flexWrap: 'wrap' },
  reposReglage: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espace.sm,
    marginTop: espace.sm,
  },
  reposLabel: { fontFamily: typo.corps, fontSize: 13, color: couleurs.texteAttenue, flex: 1 },
  stepBtn: {
    width: 36,
    height: 36,
    borderRadius: rayon.sm,
    borderWidth: 1,
    borderColor: couleurs.trait,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnTexte: { fontFamily: typo.titre, fontSize: 18, color: couleurs.texte },
  descripteurRpe: { fontFamily: typo.corps, fontSize: 13, color: couleurs.texte },
  label: {
    fontFamily: typo.corps,
    fontSize: 13,
    color: couleurs.texteAttenue,
    marginTop: espace.sm,
  },
  champCourt: { gap: espace.xs },
  inputCourt: {
    fontFamily: typo.donnees,
    fontSize: 16,
    color: couleurs.texte,
    borderWidth: 1,
    borderColor: couleurs.trait,
    borderRadius: rayon.sm,
    paddingHorizontal: espace.md,
    paddingVertical: espace.xs,
    minWidth: 90,
  },
  input: {
    fontFamily: typo.corps,
    fontSize: 14,
    color: couleurs.texte,
    borderWidth: 1,
    borderColor: couleurs.trait,
    borderRadius: rayon.sm,
    paddingHorizontal: espace.md,
    paddingVertical: espace.sm,
  },
});
