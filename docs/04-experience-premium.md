# 04 — Expérience & finitions premium

Le premium se sent dans les deux gestes quotidiens (journal, séance) et dans mille détails.
Classé par impact ressenti / effort.

---

## 4.1 Mode séance guidée (impact maximal)

Aujourd'hui la séance est une fiche à consulter puis une saisie a posteriori. La version
guidée transforme l'écran `seance.tsx` en compagnon temps réel :

- **Déroulé exercice par exercice** : un écran par exercice, charge cible pré-calculée
  (cf. doc 02 §2.4 : « 52,5 kg × 8 — la dernière fois : 50 kg × 3×12 »), gros boutons
  « Série validée » / « Ajusté » (ouvre la saisie fine).
- **Timer de repos automatique** entre séries (90 s salle, configurable), avec haptique
  à 10 s de la fin (`expo-haptics` déjà présent). Écran toujours allumé pendant la séance
  (`expo-keep-awake` à ajouter).
- **Timers spécifiques course** : chrono 30/30 avec bips/vibrations (portion vite vs lente),
  compte à rebours d'échauffement. Pas de GPS (hors périmètre local-first simple) : durée +
  saisie distance à la fin.
- **Gainage/planche** : compte à rebours visuel plein écran avec consigne de respiration
  affichée (« respiration libre, ventre relâché » — la consigne MICI au moment où elle compte).
- **Note de sécurité MICI** affichée en interstitiel au lancement (déjà dans
  `ModeleSeance.noteSecurite`), avec le rappel hydratation.
- **Fin de séance** : récap pré-rempli (durée mesurée, charges réalisées), il ne reste que
  le RPE (sélecteur 1-10 avec descripteurs verbaux : 7 = « difficile, 3 reps en réserve »)
  et le ressenti digestif. Objectif : valider en 3 taps si tout s'est passé comme prévu.

## 4.2 Saisie du journal en < 10 s

- **Pré-positionnement** des curseurs sur les valeurs de la veille (le corps change peu
  d'un jour à l'autre ; on ajuste au lieu de saisir).
- **Tags récents en premier**, ajout d'un tag custom en 2 taps.
- **Saisie rétroactive** explicite pour hier uniquement (au-delà, le signal est trop peu
  fiable pour le moteur — et la série de jours dégradés est rompue de toute façon,
  comportement v1 conservé).
- **Raccourci « journée identique à hier »** : un bouton, tout est copié, modifiable après.

## 4.3 Notifications locales intelligentes (incrément 5 ++)

`expo-notifications` est déjà en dépendance. Au-delà des rappels fixes prévus :

- **Heure apprise** : le rappel journal se cale sur l'heure médiane des 14 dernières
  saisies (± arrondi 15 min), pas sur une heure arbitraire.
- **Silence intelligent** : journal déjà saisi → pas de rappel ; 2 rappels ignorés
  d'affilée → espacement automatique (anti-harcèlement).
- **Rappel de séance la veille au soir** avec la météo interne : « Demain : Salle A.
  Forme du jour estimée demain matin. » — jamais de culpabilisation si non faite.
- **Bilan du dimanche** (cf. doc 03 §3.2) : la seule notification « riche » de la semaine.
- Tout est local (`scheduleNotificationAsync`), débrayable finement par type.

## 4.4 Widget & accès rapides

- **Widget Android** (cible principale Pixel) : séance du jour + score de forme. Nécessite
  du natif (Glance/AppWidget) → passer en dev build EAS, effort réel mais signature premium
  forte. iOS WidgetKit : plus tard, l'app doit seulement compiler.
- **Quick actions** (app icon long-press) : « Saisir le journal », « Séance du jour » —
  trivial via `expo-quick-actions`.

## 4.5 Design & micro-interactions

Le design system sombre Space Grotesk / JetBrains Mono est déjà une signature. Pour le
niveau premium :

- **Haptique systématique et cohérente** : succès (validation série, record) = notification
  success ; alerte (adaptation déclenchée) = warning ; tick léger sur les curseurs du journal.
- **Animations sobres** : transitions de cartes en 150-200 ms, apparition de la bannière
  d'adaptation en slide-down, célébration de record en une pulsation — `react-native-reanimated`
  à ajouter, ou rester sur `Animated` core pour KISS.
- **Mode AMOLED vrai noir** (`#000`) : option d'affichage, économise la batterie du Pixel
  et renforce l'identité « registre ».
- **États vides soignés** : chaque écran sans données explique ce qui apparaîtra et après
  combien de jours (« Les corrélations apparaissent après 30 jours de journal — encore 12 »).
  C'est LE détail qui fait percevoir la fiabilité du produit.
- **Accessibilité** : tailles dynamiques respectées, contrastes AA, labels lecteur d'écran
  sur les curseurs et graphes (résumé textuel des courbes).

## 4.6 Confiance & données (différenciant premium discret)

- **Écran « Mes données »** : taille de la base, nombre d'entrées par table, bouton
  export chiffré (incrément 6), bouton suppression totale avec double confirmation.
- **Journal des adaptations consultable** (la table `adaptation` existe) : historique de
  toutes les décisions du moteur, avec raison et statut (appliquée/annulée) — la preuve
  permanente qu'il n'y a pas de boîte noire.
- **Page « Comment ça marche »** : les règles du moteur rédigées en français simple,
  les seuils actuels (y compris la baseline personnelle), liens vers les sections du
  rapport gastro. Transparence = premium.

---

## Priorisation interne de ce document

| Chantier | Impact quotidien | Effort | Verdict |
|---|---|---|---|
| 4.1 Séance guidée | ★★★ | Moyen | **Faire tôt** |
| 4.2 Journal < 10 s | ★★★ | Faible | **Faire tôt** |
| 4.3 Notifications intelligentes | ★★ | Faible-moyen | Avec l'incrément 5 |
| 4.5 Micro-interactions / états vides | ★★ | Faible (continu) | Au fil de l'eau |
| 4.6 Écrans confiance | ★★ | Faible | Avec l'incrément 6 |
| 4.4 Widget Android | ★★ | Élevé (natif, dev build) | Après le reste |
