# 01 — Vision premium

## Ce que « premium » signifie pour REGISTRE.FORME

Premium ne veut pas dire « plus de fonctionnalités » : les apps fitness grand public en ont
des centaines et restent inutilisables pour une personne avec une MICI. Premium, ici, c'est :

> **L'app comprend *ma* maladie, *mon* corps, *ma* progression — et me le prouve à chaque
> décision qu'elle prend.**

Trois piliers :

### 1. Personnalisation profonde (le différenciant)

Aujourd'hui, le moteur utilise des seuils universels (`SEUIL_DOULEUR = 5`,
`INCREMENT_CHARGE_KG = 2.5`). C'est correct pour démarrer, mais une personne vivant avec un
Crohn iléal sténosant a une **douleur de fond chronique** : un « 4/10 » pour elle peut être
un bon jour, là où un « 3/10 » serait un signal d'alerte pour quelqu'un d'autre. De même,
+2,5 kg par séance convient à la presse à cuisses, pas au développé épaules.

La v2 remplace les constantes universelles par des **références personnelles calculées
localement** (baselines glissantes, progression par exercice, allures dérivées des tests),
encadrées par des plafonds de sécurité absolus. Voir [02](02-personnalisation-entrainement.md).

### 2. Suivi qui produit de la connaissance, pas des données

Saisir douleur/énergie/digestion tous les jours n'a de valeur que si l'app **rend quelque
chose en retour** : « tes douleurs surviennent 2× plus souvent dans les 24 h après un tag
`repas-gras` », « ta charge d'entraînement a augmenté de 40 % cette semaine, c'est la zone
de risque », « ton 3000 m s'est amélioré de 90 s depuis la S1 ». Des insights **explicables
et sourcés** (l'utilisateur peut toujours voir les données qui fondent l'affirmation).
Voir [03](03-suivi-insights.md).

### 3. Friction zéro au quotidien

Le produit vit ou meurt sur deux gestes quotidiens : la saisie du journal (< 20 s aujourd'hui,
cible < 10 s) et la réalisation de la séance. Tout le reste (graphes, rapports, réglages) est
secondaire. Le premium se joue dans le détail de ces deux gestes : pré-remplissage, timers de
séance intégrés, haptique, widget. Voir [04](04-experience-premium.md).

## Expérience cible — une journée type

**7 h 30** — Widget sur l'écran d'accueil : « Forme estimée 72/100 · Séance du jour : Salle A
(version normale) ». Le score est cliquable : décomposition transparente (douleur vs baseline,
énergie, charge récente).

**12 h** — L'utilisateur ouvre l'app, saisit son journal en 8 s (curseurs pré-positionnés sur
les valeurs d'hier, tags récents en accès direct). Le moteur recalcule : rien ne change,
pas de notification inutile.

**18 h** — Mode séance guidée : la salle A s'affiche exercice par exercice, charges cibles
pré-calculées d'après l'historique (« Presse : 52,5 kg — tu as validé 3×12 à 50 kg la dernière
fois, on passe à 52,5 × 8 »), timer de repos automatique, saisie du réalisé en un tap si
conforme au prévu.

**18 h 55** — RPE saisi en sortie de séance. L'app note : « 3e séance consécutive avec RPE ≤ 7
et progression validée — ta phase Construction est en avance, le plan reste inchangé. »

**Dimanche soir** — Bilan hebdo automatique : charge sRPE de la semaine vs moyenne 4 semaines,
ratio dans la zone verte, poids lissé, 1 insight de corrélation si pertinent. Deux boutons :
« Semaine suivante telle que prévue » / « Voir les ajustements proposés ».

## Anti-objectifs (ce que premium n'est PAS)

- **Pas de gamification culpabilisante** : pas de streaks cassés en rouge, pas de badges
  infantilisants. La maladie impose des pauses ; l'app les normalise (cf. « grâce
  hebdomadaire » dans [03](03-suivi-insights.md)).
- **Pas de comparaison sociale** : produit mono-utilisateur, la seule référence est soi-même.
- **Pas d'IA générative au runtime** : les textes du moteur restent des gabarits rédigés,
  déterministes, traduisibles en consultation.
- **Pas d'abonnement / pas de cloud** : premium = qualité, pas modèle économique.
