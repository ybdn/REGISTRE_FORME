# 06 — Prompts d'implémentation

Série de prompts prêts à copier-coller (un par incrément, dans l'ordre recommandé de la
[feuille de route](05-feuille-de-route.md)). Chaque prompt est autonome : il rappelle le
contexte, le périmètre exact, les contraintes et les critères de fin.

**Conseils d'usage**
- Lancer **un prompt par session** (ou par incrément), valider `npm test`, `npm run
  typecheck`, `npm run lint` et un essai sur device avant de passer au suivant.
- Si un incrément est gros (8, 9), le prompt indique un ordre interne ; on peut aussi le
  découper en plusieurs sessions en copiant seulement la partie voulue.
- Toujours relire le diff : les règles métier touchent à la santé, rien ne se merge sans
  comprendre chaque seuil.

---

## P0 — Préambule à coller en tête de chaque prompt

```text
Contexte projet : REGISTRE.FORME (repo courant), app Expo/React Native de remise en forme
pilotée par le biofeedback santé pour une personne avec maladie de Crohn iléale sténosante.
Lis d'abord README.md et le dossier docs/ (en particulier le document cité ci-dessous).

Invariants non négociables :
- Local-first : aucune requête réseau au runtime, aucun SDK tiers traceur.
- Logique métier déterministe et explicable : chaque décision a une `raison` rédigée en
  français, affichable telle quelle. Pas de boîte noire.
- Les garde-fous MICI absolus priment toujours sur la personnalisation (douleur ≥ 7 = jour
  dégradé quoi qu'il arrive ; jamais d'effort en apnée/Valsalva dans les consignes).
- Toute logique nouvelle vit dans src/domaine/ en fonctions pures sans dépendance Expo,
  couverte par des tests Vitest dans tests/.
- Code métier en français, TypeScript strict, conventions Biome (npm run lint).
- SQLite : ne jamais réécrire une migration publiée, en ajouter une nouvelle (PRAGMA
  user_version).
- KISS : Zustand + Expo Router, pas de nouvelle grosse dépendance sans justification.

Definition of done : npm test, npm run typecheck et npm run lint passent à 0 erreur ;
le README (section État d'avancement) est mis à jour.
```

---

## P1 — Incrément 4 (suite) : Physiologie + photos chiffrées

```text
[coller P0]

Implémente l'incrément 4-suite : l'écran Physiologie (courbes poids + mensurations) et les
photos de suivi chiffrées.

Périmètre :
1. Écran app/mesures.tsx complété : saisie poids (hebdo) et mensurations (bras G/D, torse,
   ventre, hanches, cuisses) vers la table mesure_corporelle existante via les dépôts.
2. Courbe de poids en react-native-svg (déjà en dépendance) : points bruts atténués +
   moyenne mobile 7 jours en trait plein (cf. docs/03-suivi-insights.md §3.4). Composant
   maison léger dans src/design/, pas de lib de charts.
3. Courbes de mensurations : une mini-courbe par mesure, même composant réutilisé.
4. Photos de suivi : capture/import via expo-image-picker (à ajouter avec npx expo install),
   chiffrement du fichier en AES via expo-crypto avant écriture avec expo-file-system,
   chemin stocké dans photo_suivi. Galerie chronologique avec déchiffrement à l'affichage.
   Les photos ne quittent jamais le stockage local de l'app.
5. Fonctions pures de lissage (moyenne mobile) dans src/domaine/tendances.ts, testées.

Critères d'acceptation :
- Le lissage 7 j est testé (fenêtre incomplète en début de série, trous de dates).
- Une photo supprimée de l'app est effacée du disque (pas de fichier orphelin).
- Aucune permission au-delà de la galerie/caméra n'est demandée.
```

## P2 — Incrément 5 : Notifications locales

```text
[coller P0]

Implémente l'incrément 5 : notifications locales (expo-notifications, déjà en dépendance),
en intégrant directement les raffinements de docs/04-experience-premium.md §4.3.

Périmètre :
1. src/donnees/notifications.ts complété : planification des rappels locaux —
   a) rappel journal quotidien, b) pesée hebdomadaire, c) rappel de séance la veille au soir.
2. Heure apprise pour le rappel journal : heure médiane des 14 dernières saisies, arrondie
   au quart d'heure (fonction pure dans src/domaine/, testée). Repli sur 20h00 si < 5 saisies.
3. Silence intelligent : pas de rappel si le journal du jour est déjà saisi (annuler/replanifier
   à chaque saisie) ; après 2 rappels consécutifs sans saisie le lendemain, espacer (1 jour
   sur 2) jusqu'à la prochaine saisie.
4. Écran de réglages : chaque type de notification débrayable individuellement, état
   persisté (table profil ou nouvelle table reglages — choisir le plus simple et justifier).
5. Demande de permission au bon moment (premier réglage activé, pas à l'onboarding).

Contraintes : tout en scheduleNotificationAsync local, aucun push distant. Les textes des
notifications sont sobres et jamais culpabilisants (pas de « tu as raté… »).

Critères d'acceptation :
- La logique d'heure apprise et d'espacement est en fonctions pures testées.
- Saisir le journal annule le rappel du jour (vérifiable sur device).
- Tout désactiver ⇒ zéro notification planifiée (vérifier getAllScheduledNotificationsAsync).
```

## P3 — Incrément 6 : Rapport gastro PDF + export/import chiffré

```text
[coller P0]

Implémente l'incrément 6 : rapport gastro en PDF et export/import JSON chiffré AES-256.
Réfs : docs/03-suivi-insights.md §3.6 pour le contenu du rapport.

Périmètre :
1. Rapport PDF (expo-print + expo-sharing, déjà en dépendances) sur une période choisie
   (4/8/16 semaines) : page 1 de synthèse — jours dégradés, tendance douleur, poids lissé
   début/fin, fréquence selles/ballonnements (moyennes hebdo), séances par semaine,
   adaptations déclenchées ; annexe optionnelle avec la liste brute des entrées de journal.
   La mise en page est du HTML/CSS simple passé à expo-print, lisible en noir et blanc.
2. Construction des données du rapport en fonctions pures dans src/domaine/rapport.ts,
   testées (le HTML lui-même peut rester côté UI).
3. Export chiffré : sérialisation JSON de toutes les tables, chiffrement AES-256 avec clé
   dérivée d'une passphrase utilisateur (PBKDF2 ou scrypt via expo-crypto — documente le
   choix et les paramètres dans le code), écriture d'un fichier .registre partagé via
   expo-sharing.
4. Import : sélection du fichier, saisie de la passphrase, validation de version de schéma,
   ÉCRASEMENT explicite des données locales après double confirmation (texte clair sur la
   perte des données actuelles).
5. Bouton des deux côtés dans un écran « Mes données » minimal (sera enrichi à l'incrément 12).

Critères d'acceptation :
- Round-trip testé en domaine pur : export → import = données identiques (test Vitest sur
  la sérialisation/structure ; le chiffrement natif peut être mocké en test Node).
- Passphrase erronée ⇒ message d'erreur clair, aucune donnée modifiée.
- Le PDF se génère sans réseau et reste < 1 Mo pour 16 semaines.
```

## P4 — Incrément 8 : Fondations de la personnalisation ⭐

```text
[coller P0]

Implémente l'incrément 8 (le socle de la v2) : baseline personnelle, score de forme,
indicateurs de charge. Réfs détaillées : docs/02-personnalisation-entrainement.md §2.1,
§2.2, §2.3 et docs/05-feuille-de-route.md (incrément 8). Suis exactement les formules de
ces documents.

Ordre d'implémentation conseillé :
1. src/domaine/baseline.ts : calculerBaseline(journal, date) → médiane + MAD sur 28 j de
   la douleur. Démarrage à froid : < 14 entrées sur 28 j ⇒ baseline null.
2. estJourDegrade v2 (rétro-compatible) : dégradé si relatif (douleur ≥ baseline +
   max(2, 2×MAD)) OU absolu (douleur ≥ 7 toujours ; énergie ≤ 2 inchangé ; douleur ≥ 5 si
   baseline < 3 ou baseline null). La personnalisation ne désactive JAMAIS un garde-fou.
3. src/domaine/chargeEntrainement.ts : acwr(seances, date) (Σ sRPE 7 j / moyenne hebdo 28 j,
   null si < 21 j de données), monotonie(seances, date), contrainte(seances, date).
4. src/domaine/scoreForme.ts : score 0-100 décomposé — douleur vs baseline 35 %, énergie
   25 %, digestion 15 %, charge (ACWR en zone 0,8-1,3) 25 %. ACWR null ⇒ composante neutre.
   Retourne { score, composantes } pour l'affichage décomposé.
5. evaluerAdaptation v2 : nouveau TypeAdaptation 'lisser_charge' (ACWR > 1,5, priorité entre
   decharge_hebdo et ralentir_progression) ; feu vert enrichi (exige aussi ACWR ≤ 1,3) ;
   niveaux gradués de séance selon le score (≥75 normale, 50-74 modérée à −20 % volume,
   30-49 allégée, <30 repos), plafonné à « allégée » si jour dégradé.
6. Migration SQLite 2 : CHECK de seance_realisee.variante élargi à
   ('normale','moderee','allegee','repos') — nouvelle migration, ne pas toucher à la v1.
   Étendre le type VarianteSeance en conséquence.
7. UI : carte « Forme du jour » sur le tableau de bord (score + barres de décomposition,
   tap → détail) ; écran « Mes seuils » (baseline actuelle, seuil du jour, garde-fous) ;
   les bannières d'adaptation citent les chiffres personnels dans raison.
8. Constantes nouvelles centralisées dans constantes.ts avec commentaires explicatifs.

Critères d'acceptation (tests obligatoires) :
- Non-régression : avec < 14 j de journal, evaluerAdaptation v2 rend exactement les
  décisions v1 (réutiliser/adapter les 43 tests existants, ils doivent tous passer).
- Tests aux limites des garde-fous : douleur 7 avec baseline 6 ⇒ dégradé ; baseline élevée
  ne relève jamais un seuil absolu.
- ACWR null (< 21 j) ⇒ ni pénalité de score ni règle lisser_charge.
- Chaque raison générée cite les valeurs (baseline, ACWR, score) en français naturel.
```

## P5 — Incrément 9 : Coaching de séance

```text
[coller P0]

Implémente l'incrément 9 : progression par exercice, allures personnalisées, mode séance
guidée, journal express. Réfs : docs/02-personnalisation-entrainement.md §2.4 et §2.5,
docs/04-experience-premium.md §4.1 et §4.2. Prérequis : incrément 8 livré.

Ordre conseillé :
1. ExerciceModele enrichi : repsMin, repsMax, groupeMusculaire ('bas' | 'haut' | 'gainage')
   sur les modèles existants de modelesSeances.ts (fourchette 8-12 par défaut, gainage exclu
   de la progression de charge).
2. src/domaine/progressionExercice.ts : prochaineCible(historique, exercice) — double
   progression (+1 rep jusqu'au haut de fourchette si séance réussie avec RPE ≤ 8, puis
   +5 kg/+5 % bas du corps ou +2,5 kg/+2,5 % haut du corps — le plus petit — et retour bas
   de fourchette) ; plateau après 3 séances sans progression ⇒ proposer −10 % ou variation
   A↔B ; reprise après ≥ 7 j d'absence ⇒ −10 % par tranche de 7 j (plancher −30 %).
   L'historique se lit dans seance_realisee.charges (JSON) des 10 dernières séances du même
   modèle — PAS de nouvelle table.
   Si ralentir_progression est actif : geler les incréments de charge (reps ok).
3. src/domaine/allures.ts : estimerVMA(seances) à partir des chronos saisis
   (vitesse 3000 m × 1,05 ; lissage 70 % nouveau / 30 % ancien si plusieurs tests),
   alluresCibles(vma) → EF 60-70 %, 30/30 à 100 %, 400 m à 95 %, formatées en min/km et
   temps par répétition. Sans aucun chrono : retourner null, l'UI reste comme en v1.
4. Mode séance guidée (refonte app/seance.tsx) : déroulé exercice par exercice avec cible
   affichée (« 52,5 kg × 8 — dernière fois : 50 kg × 3×12 »), boutons Série validée /
   Ajusté, timer de repos auto (90 s, configurable) avec haptique à T-10 s (expo-haptics),
   chrono 30/30 avec vibrations pour la course, compte à rebours gainage avec consigne de
   respiration affichée, note de sécurité MICI en interstitiel de lancement, récap final
   pré-rempli (il ne reste que RPE — sélecteur avec descripteurs verbaux — et ressenti
   digestif). Ajouter expo-keep-awake (npx expo install) pour garder l'écran allumé.
5. Journal express (app/journal.tsx) : curseurs pré-positionnés sur les valeurs de la
   veille, bouton « identique à hier », tags récents en premier, saisie rétroactive limitée
   à hier. Objectif < 10 s.

Critères d'acceptation :
- prochaineCible couverte par des tests : progression rep, palier de charge bas/haut du
  corps, plateau ×3, gel par ralentir_progression, reprise après 14 j d'absence.
- estimerVMA/alluresCibles testées (un chrono, plusieurs chronos, aucun chrono).
- Sur device : une séance salle complète se valide en ≤ 3 taps si conforme au prévu.
```

## P6 — Incrément 10 : Insights

```text
[coller P0]

Implémente l'incrément 10 : corrélations, bilan hebdo, records, tendances visuelles,
observance. Réfs : docs/03-suivi-insights.md (entier). Prérequis : incrément 8 (baseline,
ACWR) ; le lissage de tendances.ts existe depuis l'incrément 4-suite.

Ordre conseillé :
1. src/domaine/correlations.ts : analyserTags(journal, fenetreJours=90) — pour chaque tag
   ≥ 5 occurrences : P(douleur > baseline+1 sous 48 h | avec tag) vs sans tag, ratio ≥ 1,8
   ⇒ insight avec effectifs (« 7 cas sur 11 (64 %) contre 18 % sans »). Jamais d'affichage
   sous 5 occurrences OU < 30 j de journal. Même mécanique pour type de séance ↔
   ressenti_digestif bas. Formulation « sont suivies de », jamais causale.
2. src/domaine/records.ts : 1RM estimé d'Epley (charge × (1 + reps/30)) par exercice,
   meilleur 3000 m, meilleure allure EF ≥ 30 min, plus longue sortie, jalons de constance.
   detecterNouveauxRecords(seances, nouvelleSeance) pour la célébration post-séance
   (haptique success + carte sobre, pas de confettis).
3. Bilan hebdo : construireBilanHebdo(ctx) en domaine pur — charge sRPE vs 4 semaines,
   ACWR avec zone, score de forme moyen, tendance douleur (pente 14 j : ↗ → ↘), exercices
   ayant progressé, records, 1 insight max (le plus significatif). Carte affichée le
   dimanche soir + notification locale (réutiliser l'infra de l'incrément 5).
4. Écran Tendances : barres hebdo sRPE empilées par type avec ligne de charge chronique et
   zones ACWR colorées ; graphe douleur/énergie (moyenne 7 j) superposé à la charge hebdo ;
   heatmap calendrier 16 semaines (intensité = score de forme, point = séance). Composants
   react-native-svg maison, résumé textuel accessible pour chaque graphe.
5. Observance : séances réalisées / prévues APRÈS adaptations (une allégée réalisée compte
   pleinement) ; série de journal avec grâce hebdomadaire (1 trou/semaine toléré). Prévoir
   l'exclusion des périodes de poussée (flag à brancher à l'incrément 11).
6. Si l'incrément 6 est livré : ajouter au rapport PDF les sections corrélations (avec
   effectifs) et le graphe santé ↔ charge.

Critères d'acceptation :
- correlations.ts testé sur jeux synthétiques : tag corrélé détecté, tag non corrélé
  silencieux, effectifs insuffisants ⇒ rien, formulations avec effectifs exacts.
- Chaque insight affiché est cliquable vers la liste des journées qui le fondent.
- Le bilan hebdo se construit hors-ligne en < 1 s sur device.
```

## P7 — Incrément 11 : Plan vivant

```text
[coller P0]

Implémente l'incrément 11 : replanification par glissement et mode poussée. Réfs :
docs/02-personnalisation-entrainement.md §2.6. Prérequis : incréments 8 et 10.

Ordre conseillé :
1. Migration SQLite 3 : profil.mode_pousse (INTEGER 0/1), profil.date_debut_pousse (TEXT
   nullable) ; lever le CHECK semaine BETWEEN 1 AND 16 de seance_planifiee (recréation de
   table SQLite : CREATE nouvelle + INSERT SELECT + DROP + RENAME, dans la migration).
2. src/domaine/replanification.ts :
   - glisserProgramme(semaines, aPartirDe) : décale d'une semaine les semaines restantes,
     bornes de phases et tests chrono compris ; invariant : le contenu des 16 semaines de
     programme est préservé, les phases restent contiguës, les tests restent en fin de
     Performance.
   - programmeReprisePostPoussee(semainesManquees) : 1 semaine à −30 % de volume puis −15 %
     puis trame normale ; chaque palier n'est franchi que si le score de forme moyen de la
     semaine ≥ 60, sinon le palier est répété.
3. Mode poussée : bouton explicite « Je suis en poussée » + suggestion automatique après
   5 jours dégradés consécutifs (proposée, jamais imposée). Effets : plan en pause, seul un
   maintien minimal optionnel est proposé (sante-allegee quotidien, sans notion d'échec),
   progression gelée, période exclue des stats d'observance (brancher le flag prévu à
   l'incrément 10). Sortie : déclarée par l'utilisateur ET 3 jours non dégradés, puis
   protocole de reprise.
4. UI : bannière de proposition de glissement après une semaine de décharge insérée ou une
   semaine à 0 séance (« Décaler le programme d'une semaine ? ») — JAMAIS d'application
   silencieuse ; écran/bandeau du mode poussée, bienveillant, le journal Crohn mis en avant.
5. Chaque glissement/entrée/sortie de poussée est journalisé dans la table adaptation
   (traçable, annulable comme le reste).

Critères d'acceptation :
- glisserProgramme testé : intégrité du programme (16 semaines de contenu, phases
  contiguës, tests chrono en fin de Performance), glissements multiples cumulés.
- Le mode poussée gèle toute progression (cibles d'exercice inchangées pendant la pause).
- La reprise impose −30 % puis −15 % avec validation score ≥ 60, palier répété sinon.
- Les semaines de poussée sont exclues du calcul d'observance (test dédié).
```

## P8 — Incrément 12 : Finitions premium

```text
[coller P0]

Implémente l'incrément 12 (budget de polissage) : à traiter en plusieurs petites sessions,
une puce = une session possible. Réfs : docs/04-experience-premium.md §4.3-4.6.

1. Quick actions (long-press sur l'icône) : « Saisir le journal », « Séance du jour »
   via expo-quick-actions.
2. Mode AMOLED vrai noir (#000) : option d'affichage dans les réglages, appliquée au design
   system (src/design/theme.ts) sans dupliquer les styles.
3. États vides soignés sur TOUS les écrans : expliquer ce qui apparaîtra et quand
   (« Les corrélations apparaissent après 30 jours de journal — encore 12 »). Recenser
   chaque écran et son état vide avant de coder.
4. Accessibilité : contrastes AA vérifiés sur le thème sombre, labels lecteur d'écran sur
   curseurs et graphes (résumé textuel des courbes), tailles de police dynamiques.
5. Écran « Mes données » complet : volumétrie par table, export/import (incrément 6),
   suppression totale avec double confirmation.
6. Écran « Comment ça marche » : les règles du moteur v2 rédigées en français simple, avec
   les seuils ACTUELS de l'utilisateur (baseline, ACWR) injectés dans le texte.
7. Journal des adaptations consultable : historique complet de la table adaptation (raison,
   statut appliquée/annulée), filtrable par type.
8. Haptique cohérente partout : success (validation, record), warning (adaptation
   déclenchée), tick léger sur les curseurs — centraliser dans un module unique.
9. (Optionnel, gros) Widget Android Glance : séance du jour + score de forme. Nécessite un
   dev build EAS — faire en dernier, sur une branche dédiée, sans casser Expo Go pour le
   reste du développement.

Critère transversal : aucune nouvelle dépendance sans justification écrite dans le commit ;
chaque session laisse test/typecheck/lint à 0 erreur.
```

## P9 — Incrément 7 : Intégration santé opt-in (optionnel, en dernier)

```text
[coller P0]

Implémente l'incrément 7 : lecture seule Health Connect (Android, cible principale) avec
opt-in explicite. HealthKit iOS : hors périmètre (l'app doit seulement compiler).

Périmètre :
1. Opt-in dans les réglages (le flag profil.sante_optin existe déjà), désactivé par défaut,
   avec explication claire de ce qui est lu et pourquoi. Désactivation = arrêt immédiat des
   lectures.
2. Lecture seule : sommeil (durée) et fréquence cardiaque de repos si disponibles, via
   react-native-health-connect (nécessite un dev build EAS — branche dédiée).
3. Intégration au score de forme (docs/02 §2.2) : le sommeil devient une 5e composante
   OPTIONNELLE du score (re-pondération automatique quand absente — le score doit rester
   identique à l'incrément 8 quand l'opt-in est désactivé : test de non-régression).
4. Aucune donnée santé externe n'est écrite, ni stockée au-delà du nécessaire au calcul du
   jour (pas de table nouvelle si possible ; sinon, documenter et purger > 35 jours).

Critères d'acceptation :
- Opt-in désactivé ⇒ zéro appel Health Connect (vérifiable dans le code par injection).
- Score de forme inchangé vs incrément 8 quand l'opt-in est désactivé (tests).
- L'écran « Comment ça marche » documente la nouvelle composante.
```
