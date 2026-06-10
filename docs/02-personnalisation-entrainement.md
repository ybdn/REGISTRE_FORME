# 02 — Personnalisation de l'entraînement (moteur d'adaptation v2)

Le cœur du produit. Six chantiers, classés du plus différenciant au plus cosmétique.
Tous restent **déterministes, explicables, testables en Vitest** dans `src/domaine/`.

---

## 2.1 Baseline personnelle (seuils relatifs, pas absolus)

### Problème

`estJourDegrade()` utilise `douleur ≥ 5 || énergie ≤ 2` (constantes universelles dans
`constantes.ts`). Pour une douleur chronique de fond à 3-4/10, le seuil 5 se déclenche trop
souvent (l'app « crie au loup » et l'utilisateur désactive mentalement les alertes). Pour
une période de rémission à 0-1/10, un passage brutal à 4/10 est un vrai signal… que le
moteur actuel ignore.

### Proposition

Calculer une **baseline glissante sur 28 jours** (médiane + écart absolu médian, robustes
aux valeurs extrêmes — pas de moyenne/écart-type, trop sensibles) :

```
baselineDouleur  = médiane(douleur, 28 j)
deviationDouleur = médiane(|douleur_i − baselineDouleur|, 28 j)   // MAD

jourDegradeRelatif = douleur ≥ baselineDouleur + max(2, 2 × deviationDouleur)
```

Le jour est dégradé si **relatif OU absolu** :

```
estJourDegrade = jourDegradeRelatif
              OU douleur ≥ PLAFOND_DOULEUR_ABSOLU (7)     // garde-fou MICI, jamais désactivable
              OU energie ≤ SEUIL_ENERGIE (2)              // inchangé : 2/5 est bas dans l'absolu
              OU (douleur ≥ 5 ET baseline < 3)            // l'ancien seuil reste actif tant que
                                                          // la baseline n'est pas élevée
```

**Règle de sécurité clé** : la personnalisation ne peut qu'**ajouter** des déclenchements
par rapport aux garde-fous absolus, jamais en retirer. Une douleur à 7+ est toujours dégradée,
quelle que soit la baseline.

### Démarrage à froid

Moins de 14 entrées de journal sur les 28 derniers jours → on retombe sur les seuils
absolus actuels (comportement v1 inchangé). La transition est annoncée à l'utilisateur :
« Ton journal compte maintenant 14 jours : les seuils s'adaptent à TA normale. »

### Transparence

Écran « Mes seuils » : baseline actuelle, seuil de déclenchement du jour, historique.
Chaque `Adaptation.raison` cite les chiffres : « Douleur 5/10 alors que ta normale des
4 dernières semaines est 2/10 : journée considérée comme dégradée. »

### Implémentation

- `src/domaine/baseline.ts` : `calculerBaseline(journal, date)` pur, testé.
- `estJourDegrade(entree, baseline?)` — paramètre optionnel, rétro-compatible.
- Pas de table nouvelle : la baseline se recalcule à la volée (28 entrées max, négligeable).

---

## 2.2 Score de forme quotidien (« readiness ») 0-100

### Problème

Le moteur actuel est binaire : jour dégradé ou non. Entre « pleine forme » et « séance
allégée », il existe des états intermédiaires que l'utilisateur connaît bien (« moyen,
mais ça va le faire »). Un score continu permet des adaptations graduées.

### Proposition

Score composite **transparent et décomposé**, recalculé à chaque saisie du journal :

| Composante | Poids | Calcul (chaque sous-score ∈ [0, 1]) |
|---|---|---|
| Douleur vs baseline | 35 % | `1 − clamp((douleur − baseline) / 6, 0, 1)` |
| Énergie | 25 % | `(energie − 1) / 4` |
| Digestion | 15 % | `(digestion − 1) / 4` |
| Charge d'entraînement | 25 % | 1 si ACWR ∈ [0,8 ; 1,3] ; décroît linéairement hors zone (cf. 2.3) |

`scoreForme = 100 × Σ (poids × sousScore)` — affiché avec sa décomposition (barres par
composante), jamais comme un chiffre magique.

### Adaptations graduées (remplace le binaire normale/allégée)

| Score | Niveau de séance | Effet |
|---|---|---|
| ≥ 75 | **Normale** | Séance prévue, progression autorisée |
| 50–74 | **Modérée** | Séance prévue à volume −20 % (1 série de moins par exercice, ou −20 % durée course), pas de progression de charge ce jour |
| 30–49 | **Allégée** | Bascule sur `sante-allegee` (comportement actuel) |
| < 30 | **Repos** | Repos proposé explicitement (marche libre optionnelle) |

Le type `VarianteSeance` passe de `'normale' | 'allegee'` à
`'normale' | 'moderee' | 'allegee' | 'repos'` (migration SQLite : élargir le CHECK).

**Garde-fou inchangé** : jour dégradé (au sens 2.1) ⇒ plafonné à « allégée » quel que soit
le score. Le score ne contourne jamais la règle 1 du moteur.

### Implémentation

- `src/domaine/scoreForme.ts` : `calculerScoreForme(ctx): { score, composantes }`.
- Les 4 niveaux s'insèrent dans `evaluerAdaptation()` comme raffinement de la règle 1.
- Constantes des poids et bornes dans `constantes.ts` (révisables en consultation).

---

## 2.3 Gestion de la charge : ACWR, monotonie, contrainte

### Problème

`chargeHebdomadaire()` (sRPE sommé sur 7 j) existe mais n'alimente **aucune règle**. Or les
blessures et le surmenage — particulièrement risqués sous MICI où la récupération est
compromise par l'inflammation — se prédisent bien avec trois indicateurs standards de la
science du sport, tous calculables à partir des données déjà saisies (RPE × durée) :

### Proposition — trois indicateurs dérivés du sRPE existant

**a) Ratio charge aiguë / chronique (ACWR — Gabbett)**

```
chargeAigue    = Σ sRPE sur 7 j
chargeChronique = moyenne des 4 charges hebdo sur 28 j
ACWR = chargeAigue / chargeChronique        (null si < 21 j de données)
```

| ACWR | Zone | Réaction du moteur |
|---|---|---|
| < 0,8 | Sous-charge | Information seule (« tu peux en faire un peu plus si la forme suit ») |
| 0,8 – 1,3 | **Optimale** | Rien — c'est l'objectif |
| 1,3 – 1,5 | Vigilance | Pas de progression de charge cette semaine |
| > 1,5 | **Risque** | Nouvelle règle moteur : `lisser_charge` — la prochaine séance passe en « modérée » |

**b) Monotonie (Foster)** : `moyenne(sRPE quotidien, 7 j) / écart-type(sRPE quotidien, 7 j)`.
Monotonie > 2 = entraînement trop uniforme (facteur de surmenage indépendant du volume).
Réaction : suggérer de varier (jour de repos complet ou séance courte intense à la place
d'une moyenne).

**c) Contrainte (strain)** : `chargeHebdo × monotonie`. Suivi en tendance sur le graphe de
charge ; au-delà du 90e percentile personnel des 8 dernières semaines → information de
vigilance dans le bilan hebdo.

### Insertion dans l'ordre « sécurité d'abord »

```
1. allegement_jour        (signal santé — inchangé, prime sur tout)
2. decharge_hebdo         (inchangé)
3. lisser_charge          (NOUVEAU : ACWR > 1,5)
4. ralentir_progression   (RPE moyen > 8 sur 14 j — inchangé)
5. progression_normale    (feu vert enrichi : exige AUSSI ACWR ≤ 1,3)
```

### Implémentation

- `src/domaine/chargeEntrainement.ts` : `acwr()`, `monotonie()`, `contrainte()` — purs.
- Nouveau `TypeAdaptation` : `'lisser_charge'`. Migration : aucune (la colonne `type`
  d'`adaptation` n'a pas de CHECK).

---

## 2.4 Progression de charge par exercice (double progression + plateaux)

### Problème

`INCREMENT_CHARGE_KG = 2.5` uniforme : trop lent pour la presse à cuisses, trop rapide pour
le développé épaules (sur 15 kg de départ, +2,5 kg = +17 % d'un coup). Et rien ne détecte
les plateaux : l'app proposera éternellement +2,5 kg même après 5 échecs.

### Proposition — double progression par exercice

Chaque exercice de salle a une **fourchette de répétitions** (ex. 8-12) :

1. Séance réussie (toutes les séries dans la fourchette, RPE séance ≤ 8) → **+1 rep** la
   prochaine fois, jusqu'au haut de fourchette.
2. Haut de fourchette atteint sur toutes les séries → **+incrément de charge** et retour au
   bas de fourchette. Incrément **relatif au groupe musculaire** :
   - Bas du corps (presse, hack squat) : +5 kg ou +5 %, le plus petit des deux.
   - Haut du corps (tirage, développés, rowing) : +2,5 kg ou +2,5 %.
3. **Détection de plateau** : 3 séances consécutives sans progression (ni rep ni charge)
   sur un exercice → proposition de **décharge ciblée** : −10 % sur cet exercice et remontée,
   ou bascule sur l'exercice de variation (salle A ↔ B).

Le tout journalisé par exercice : l'écran de séance affiche « Presse : 50 kg × 3×11 la
dernière fois → objectif aujourd'hui 3×12 » — c'est ça, le coaching premium.

### Lien avec le moteur global

- `ralentir_progression` actif ⇒ la double progression gèle les incréments de charge
  (les reps peuvent encore progresser).
- Séance « modérée » (cf. 2.2) ⇒ on garde les charges, on retire une série.
- Retour après ≥ 7 jours sans salle (poussée, maladie) ⇒ reprise automatique à −10 %
  par tranche de 7 jours d'absence (plancher −30 %).

### Implémentation

- `src/domaine/progressionExercice.ts` : `prochaineCible(historique, exercice): CibleExercice`.
- Nouvelle table `progression_exercice` (ou calcul à la volée depuis `seance_realisee.charges`
  — préférable tant que les volumes restent faibles : **KISS, pas de table**, on parse le JSON
  des 10 dernières séances du même modèle).
- `ExerciceModele` gagne `repsMin`/`repsMax` et `groupeMusculaire`.

---

## 2.5 Allures de course personnalisées (VMA dérivée des tests)

### Problème

Les modèles course (`course-ef`, `course-30-30`, `course-vma`) donnent des consignes en
minutes, sans allure cible. « 30 s vite » ne veut rien dire de précis ; l'utilisateur court
au feeling, soit trop vite (risque digestif à l'effort), soit trop lentement (pas de stimulus).

### Proposition

À partir du test 3000 m (S14/S16, et tout chrono saisi avec `distance_km`/`temps_sec`) :

```
vitesseTest (km/h) = distance / temps
VMA estimée        = vitesseTest × 1,05          (approximation valable pour un 3000 m
                                                  couru entre 12 et 20 min)
```

Allures cibles dérivées, affichées sur chaque modèle de course :

| Séance | % VMA | Affichage |
|---|---|---|
| EF / sortie longue | 60–70 % | « entre 7:30 et 8:45 /km » |
| 30/30 (portion vite) | 100 % | « ~4:50 /km, soit ~125 m par 30 s » |
| 400 m allure 3000 | 95 % | « 400 m en ~1:55 » |

- Tant qu'aucun test n'existe : consignes actuelles (au ressenti) + proposition d'un
  **demi-Cooper (6 min)** optionnel en fin de phase Reprise pour initialiser la VMA.
- Chaque nouveau test/chrono met à jour la VMA (moyenne pondérée 70 % nouveau / 30 % ancien
  pour lisser les jours sans).
- Affichage en min/km (et min/400 m pour la piste), jamais en km/h seul.

### Implémentation

- `src/domaine/allures.ts` : `estimerVMA(seances)`, `alluresCibles(vma)` — purs.
- Aucun changement de schéma : `distance_km` et `temps_sec` existent déjà dans
  `seance_realisee`.

---

## 2.6 Plan vivant (périodisation adaptative) + mode poussée

### Problème

Le programme 16 semaines est généré une fois (`genererProgramme()` + seed) et reste figé.
Deux réalités du Crohn le percutent : (a) une **poussée** peut imposer 1-3 semaines d'arrêt,
après quoi reprendre « là où on en était » est dangereux ; (b) la progression réelle peut
être plus lente OU plus rapide que la trame.

### Proposition

**a) Replanification par glissement.** Quand une semaine de décharge est insérée (règle 2)
ou qu'une semaine compte 0 séance réalisée, proposer (jamais imposer) :
« Décaler le programme d'une semaine ? » — les semaines restantes glissent, les bornes de
phases avec, la date des tests chrono aussi. Le programme devient une **liste de semaines
restantes** plutôt qu'un mapping figé semaine-calendrier → semaine-programme.

**b) Mode poussée.** Bouton explicite « Je suis en poussée » (ou suggestion automatique
après 5 jours dégradés consécutifs) :

- Le plan se met en pause ; seul un programme de **maintien minimal** est proposé
  (marche, mobilité, respiration — modèle `sante-allegee` quotidien optionnel, sans
  aucune notion d'échec).
- Le journal Crohn reste central (c'est le moment où les données comptent le plus pour
  le gastro).
- **Protocole de reprise** à la sortie (déclarée par l'utilisateur + 3 jours non dégradés) :
  1 semaine à −30 % de volume, puis −15 %, puis retour à la trame — chaque palier validé
  par le score de forme (≥ 60 en moyenne sur la semaine).

**c) Progression de phase au mérite (optionnel, plus tard).** Le passage Reprise →
Construction peut exiger 2 semaines consécutives de `progression_normale` plutôt qu'une
date. À ne faire que si (a) et (b) sont en place et digérés.

### Implémentation

- `src/domaine/replanification.ts` : `glisserProgramme(semaines, aPartirDe)`,
  `programmeReprisePostPoussee(semainesManquees)`.
- Table `profil` : colonnes `mode_pousse` (0/1) et `date_debut_pousse`.
- `seance_planifiee` : le CHECK `semaine BETWEEN 1 AND 16` saute (migration) — le
  programme peut s'étendre au-delà de 16 semaines-calendrier.

---

## Récapitulatif des nouvelles règles du moteur v2

| Priorité | Règle | Source |
|---|---|---|
| 0 | Mode poussée actif → maintien minimal | 2.6 |
| 1 | Jour dégradé (baseline personnelle + garde-fous absolus) → niveau ≤ allégée | 2.1 |
| 1bis | Score de forme → niveau gradué (normale/modérée/allégée/repos) | 2.2 |
| 2 | ≥ 3 jours dégradés consécutifs → décharge hebdo (inchangé) | v1 |
| 3 | ACWR > 1,5 → lisser la charge | 2.3 |
| 4 | RPE moyen > 8 sur 14 j → ralentir progression (inchangé) | v1 |
| 5 | Feu vert (0 jour dégradé 14 j ET RPE ≤ 8 **ET ACWR ≤ 1,3**) → progression | v1 + 2.3 |

Chaque règle reste : une condition arithmétique simple, une raison rédigée en français,
une entrée dans la table `adaptation`, un bouton Annuler.
