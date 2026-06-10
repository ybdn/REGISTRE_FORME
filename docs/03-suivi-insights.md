# 03 — Suivi & insights

Le suivi premium ne montre pas des données, il **rend de la connaissance** : des affirmations
courtes, sourcées, vérifiables en un tap. Tout est calculé localement avec des statistiques
simples — comptages, médianes, ratios — jamais de modèle opaque.

---

## 3.1 Corrélations symptômes ↔ déclencheurs (l'insight signature)

### Principe

Les tags du journal (`repas-gras`, `stress`, …) et les ressentis digestifs de séance sont
déjà saisis mais dorment en base. On les croise avec les symptômes des **24-48 h suivantes**
par simple comptage :

```
Pour chaque tag T apparu ≥ 5 fois sur les 90 derniers jours :
  pAvec = P(douleur > baseline + 1 dans les 48 h | jour avec tag T)
  pSans = P(douleur > baseline + 1 dans les 48 h | jour sans tag T)
  ratio = pAvec / pSans
```

- `ratio ≥ 1,8` ET au moins 5 occurrences ⇒ insight affiché :
  > « Sur 90 jours, les journées **repas-gras** sont suivies d'une poussée de douleur dans
  > 7 cas sur 11 (64 %), contre 18 % sans ce tag. » *(tap → liste des journées concernées)*
- Jamais de causalité affirmée : formulation « sont suivies de », toujours avec les effectifs.
- Même mécanique pour : type de séance ↔ `ressenti_digestif` bas (« tes fractionnés du soir
  passent moins bien que ceux du matin »), nb de selles ↔ veille de séance intense, etc.

### Implémentation

- `src/domaine/correlations.ts` : `analyserTags(journal, fenetreJours)` — pur, testé sur
  des jeux de données synthétiques.
- Calcul à la demande (ouverture de l'écran Tendances) ou au bilan hebdo ; pas de stockage.
- Garde-fou : minimum 5 occurrences ET 30 jours de journal avant d'afficher quoi que ce soit
  (éviter les fausses certitudes sur petits effectifs).

## 3.2 Bilan hebdomadaire automatique (le rendez-vous du dimanche)

Une carte générée chaque dimanche soir (notification locale, cf. incrément 5) :

1. **Charge** : sRPE de la semaine, ACWR avec zone colorée, comparaison aux 4 semaines.
2. **Santé** : score de forme moyen, jours dégradés, tendance douleur (pente sur 14 j :
   ↗ / → / ↘).
3. **Progression** : exercices ayant progressé, allure moyenne EF, records battus.
4. **1 insight max** (corrélation 3.1 ou indicateur de charge) — pas une liste, le plus
   significatif seulement.
5. **Décision** : « Semaine suivante telle que prévue » / « Voir l'ajustement proposé »
   (si le moteur a une proposition de décharge/glissement en attente).

C'est aussi la matière première du rapport gastro : un bilan = une section.

## 3.3 Records personnels et jalons

Détection automatique, célébration sobre (haptique + carte, pas de confettis) :

- **Salle** : meilleure charge × reps par exercice (estimation 1RM d'Epley
  `charge × (1 + reps/30)` pour comparer 50 kg × 12 et 55 kg × 8).
- **Course** : meilleur 3000 m, meilleure allure EF sur ≥ 30 min, plus longue sortie.
- **Constance** : total de séances, semaines complètes, 28 jours de journal consécutifs.
- Historique des records consultable (date, contexte, progression depuis le début).

## 3.4 Tendances visuelles (écran Physiologie enrichi)

Déjà prévu à l'incrément 4-suite (courbes poids + mensurations). Pour la version premium :

- **Poids** : points bruts en clair + **moyenne mobile 7 j** en trait plein (le poids sous
  MICI fluctue avec l'hydratation/l'inflammation ; seul le lissé est interprétable).
  Annotation des semaines de poussée sur la courbe.
- **Charge d'entraînement** : barres hebdo sRPE empilées par type de séance, ligne de
  charge chronique (moyenne 28 j) superposée, zones ACWR colorées.
- **Santé ↔ entraînement** : douleur/énergie (moyenne 7 j) superposées à la charge hebdo —
  LE graphe à montrer au gastro (« voilà ce que le sport fait à mes symptômes »).
- **Heatmap calendrier** (type contribution GitHub) : intensité = score de forme, point =
  séance réalisée. 16 semaines d'un coup d'œil.

Tout en `react-native-svg` (déjà dans les dépendances), composants maison légers — pas de
lib de charts lourde.

## 3.5 Observance bienveillante

- **Taux d'observance** = séances réalisées / séances prévues *après adaptations* (une
  séance allégée réalisée compte pleinement : suivre la consigne d'allègement EST
  l'observance).
- **Journal** : jours saisis / jours écoulés, avec **grâce hebdomadaire** — un trou de
  1 jour par semaine n'interrompt pas la série affichée. La maladie impose des mauvais
  jours ; l'app ne les punit pas.
- Les semaines en mode poussée sont **exclues** des statistiques d'observance (ni
  numérateur ni dénominateur) : être malade n'est pas un échec d'observance.

## 3.6 Rapport gastro enrichi (incrément 6 ++)

Le rapport PDF prévu gagne, grâce aux nouveautés ci-dessus, une vraie valeur clinique :

1. Synthèse de période : jours dégradés, baseline douleur et tendance, poussées (dates,
   durées), poids lissé début/fin.
2. Le graphe santé ↔ charge (3.4) sur la période.
3. Fréquence des selles et ballonnements (moyennes hebdo).
4. Tags déclencheurs identifiés (3.1) **avec leurs effectifs** — le gastro juge.
5. Activité physique : séances/semaine, observance, adaptations déclenchées (preuve que
   l'activité est encadrée par des garde-fous).
6. Liste brute des entrées en annexe optionnelle.

Format : 1 page de synthèse + annexes, généré par `expo-print` (déjà en dépendance),
partagé via `expo-sharing`. Aucune donnée ne transite par un serveur.

---

## Note d'architecture

Tous les calculs de ce document sont des fonctions pures sur `EntreeJournal[]`,
`SeanceRealisee[]` et `MesureCorporelle[]` — ils vivent dans `src/domaine/` (nouveaux
fichiers `correlations.ts`, `records.ts`, `tendances.ts`) et se testent en Node sans
émulateur, comme le reste de la couche domaine. Aucun nouveau besoin de schéma SQLite,
hormis d'éventuels caches si les volumes devenaient un problème (ils ne le seront pas :
16 semaines × quelques lignes/jour).
