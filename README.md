# REGISTRE.FORME

Application mobile de remise en forme **pilotée par le biofeedback santé**, conçue pour une personne
vivant avec une maladie de Crohn iléale sténosante. Le principe : les signaux santé (douleur, énergie,
digestion) **adaptent automatiquement** le plan d'entraînement, jamais l'inverse.

> ⚠️ **Disclaimer médical.** Cette application ne remplace ni le suivi médical ni un avis
> gastro-entérologique. Le programme doit être validé par le médecin. Aucun effort en apnée/Valsalva
> sous charge ; hydratation stricte ; séance allégée si douleur ≥ 5/10 ou énergie ≤ 2/5.

---

## Principes

- **Local-first / privacy-first** : aucune donnée ne quitte le téléphone par défaut. Pas de compte,
  pas d'analytics, pas de SDK tiers traceur. **Aucune requête réseau au runtime** hors intégration
  santé opt-in. *(Un portage web + une synchronisation cloud **opt-in** sont planifiés sans remettre
  en cause ce défaut — voir [`docs/07`](docs/07-portage-web-supabase.md).)*
- **Stockage SQLite** (`expo-sqlite`) avec migrations versionnées (`PRAGMA user_version`).
- **Export/import chiffré AES-256** (passphrase utilisateur) pour sauvegarde et changement d'appareil.
- **KISS** : Zustand pour l'état, Expo Router pour la navigation. Pas de Redux, pas de sur-architecture.
- **Code métier en français**, conventions Biome, TypeScript strict.
- Cible principale **Android (Pixel)** ; iOS doit compiler.

## Stack

React Native 0.81 + Expo (SDK 54) · React 19 · TypeScript strict · Zustand · Expo Router 6 ·
expo-sqlite · expo-notifications (local uniquement) · react-native-svg · Vitest.

> ℹ️ Expo Go ne supporte que le SDK courant : ce projet vise **SDK 54**. Si ton Expo Go est plus
> récent, monte le projet via `npx expo install expo@latest && npx expo install --fix`.

---

## Démarrage

```bash
# 1. Installer les dépendances
npm install

# 2. (optionnel) Aligner les versions natives sur le SDK Expo
npx expo install --fix

# 3. Lancer
npx expo start            # puis 'a' pour Android, ou scanne le QR avec Expo Go
```

> En cas de « No apps connected » / app qui ne charge pas : téléphone et Mac sur le **même Wi-Fi**,
> VPN désactivé, port 8081 autorisé. En dernier recours : `npx expo start --tunnel` (installe
> `@expo/ngrok` en local : `npm i -D @expo/ngrok`).

### Tests

```bash
npm test          # Vitest — couche domaine (MoteurAdaptation, générateur, migrations)
npm run typecheck # tsc --noEmit
npm run lint      # Biome
```

La suite de tests cible la **couche domaine pure** (aucune dépendance Expo), donc elle tourne en
Node sans émulateur.

### Build APK (EAS)

```bash
npm install -g eas-cli
eas login
eas build:configure
eas build -p android --profile preview   # APK installable
```

---

## Architecture

```
src/
  domaine/        # logique métier pure, testée, sans dépendance Expo
    types.ts            # modèle de domaine (Seance, EntreeJournal, Adaptation…)
    constantes.ts       # seuils du moteur (centralisés)
    dates.ts            # calculs de dates civiles déterministes
    moteurAdaptation.ts # ⭐ le différenciant — règles déterministes expliquées
    generateurSemaines.ts # programme périodisé 16 semaines
    modelesSeances.ts   # bibliothèque de modèles éditables (circuits adaptés MICI)
    sauvegarde.ts       # format d'export/import (structure + validation, pur)
    rapport.ts          # construction du HTML du rapport gastro (pur)
  donnees/        # persistance SQLite locale + I/O Expo
    schema.ts           # DDL + migrations versionnées
    db.ts               # ouverture + application des migrations
    seed.ts             # injection du programme 16 semaines
    depots.ts           # CRUD (journal, séances, mesures, adaptations)
    notifications.ts    # rappels locaux (journal quotidien, pesée hebdo)
    chiffrement.ts      # AES-256-GCM + PBKDF2 (node-forge) des sauvegardes
    sauvegarde.ts       # export/import : instantané SQLite ↔ fichier .rfb chiffré
    rapportPdf.ts       # rapport HTML → PDF (expo-print) + partage
  design/         # design system (couleurs, typo, espacements)
  etat/           # store Zustand (magasin.ts) : SQLite ↔ domaine
app/              # écrans Expo Router (tableau de bord, séance, journal, mesures, réglages)
tests/            # Vitest (couche domaine + chiffrement)
```

## Schéma de données (SQLite)

| Table | Rôle |
|---|---|
| `profil` | Profil unique (taille, âge, date début programme, disclaimer, opt-in santé) |
| `journal_crohn` | Entrée quotidienne (douleur 0-10, énergie 1-5, digestion 1-5, selles, tags…) |
| `seance_planifiee` | Trame des 16 semaines (jours déplaçables, phase, modèle) |
| `seance_realisee` | Saisie post-séance (RPE, durée, distance, charges JSON, ressenti digestif) |
| `mesure_corporelle` | Poids + mensurations (bras G/D, torse, ventre, hanches, cuisses) |
| `photo_suivi` | Photos de suivi (chemin du fichier chiffré local) |
| `adaptation` | Journal des décisions du moteur (traçable, annulable) |

## Moteur d'adaptation — règles métier verrouillées

Règles **déterministes** ; une seule adaptation est appliquée par jour selon l'ordre
**« sécurité d'abord »** (la première applicable l'emporte, les autres sont reportées dans
`reglesAussiDeclenchees` pour la transparence).

| # | Règle | Condition | Effet |
|---|---|---|---|
| 1 | Allègement du jour | `douleur ≥ 5` **OU** `énergie ≤ 2` aujourd'hui | Séance → version allégée (EF courte, mobilité, marche) |
| 2 | Décharge hebdo | ≥ 3 jours dégradés **consécutifs** | Semaine proposée à volume −40 % |
| 3 | Ralentir progression | RPE moyen > 8 sur 14 j | Progression des charges ralentie |
| 4 | Progression normale | 0 jour dégradé sur 14 j **ET** RPE moyen ≤ 8 | Feu vert progression de phase |

- **Jour dégradé** = `douleur ≥ 5 || énergie ≤ 2` (la digestion seule ne dégrade pas).
- **Charge d'entraînement** = sRPE = `RPE × durée_min`, sommée par semaine.
- Une journée sans entrée de journal **rompt** la série de jours dégradés (signal absent ≠ dégradé).
- Chaque adaptation est journalisée (quoi, pourquoi, quand) et **annulable d'un tap**.

## Programme périodisé (16 semaines)

| Phase | Semaines | Contenu |
|---|---|---|
| Reprise | 1-4 | Salle full body machines, course EF, circuit doux |
| Construction | 5-10 | Fractionné 30/30, salle A/B en alternance |
| Performance | 11-16 | Sorties longues 10 km, VMA 3000 m, **tests chrono S14 & S16** |

3 séances/semaine par défaut : **salle lundi**, **course mercredi**, **Freeletics/mix samedi**
(jours déplaçables).

---

## État d'avancement

- [x] **Incrément 1** — Couche domaine : types, `MoteurAdaptation`, générateur de semaines,
      bibliothèque de modèles. **Testée (Vitest), TS strict.**
- [x] **Incrément 2** — Couche données SQLite : schéma + migrations versionnées + seed du programme
      + dépôts. Test de cohérence des migrations.
- [x] **Incrément 3** — Store Zustand (`src/etat/magasin.ts`) câblant SQLite ↔ domaine : init +
      seed, profil, saisie journal/séance, recalcul d'adaptation, annulation.
- [x] **Incrément 4 (parcours d'acceptation)** — Écrans Expo Router : onboarding (profil + disclaimer
      obligatoire), tableau de bord (semainier + bannière d'adaptation), séance du jour + validation,
      journal Crohn. *Polices Space Grotesk / JetBrains Mono, design system sombre.*
- [x] **Incrément 4 (suite)** — Physiologie : courbes poids + mensurations (`app/mesures.tsx`).
      *Photos chiffrées reportées (nécessite une lib `expo-image-picker`, hors périmètre actuel).*
- [x] **Incrément 5** — Notifications locales (`src/donnees/notifications.ts`) : rappel journal
      quotidien (20 h) + pesée hebdomadaire (lundi 8 h), reprogrammées selon l'état, best-effort.
- [x] **Incrément 6** — Rapport gastro **PDF** (`expo-print`) + **export/import chiffré AES-256-GCM**
      (PBKDF2-SHA256, `node-forge`) via `app/reglages.tsx`. Couche pure testée (chiffrement,
      format de sauvegarde, génération du rapport).
- [ ] **Incrément 7** — Intégration santé opt-in (Health Connect / HealthKit, lecture seule).
- [x] **Incrément 8** — Fondations de la personnalisation : **baseline** douleur 28 j
      (`src/domaine/baseline.ts` — médiane + MAD, démarrage à froid), **score de forme** 0-100
      décomposé (`src/domaine/scoreForme.ts` — 4 niveaux gradués), **charge d'entraînement**
      (`src/domaine/chargeEntrainement.ts` — ACWR, monotonie, contrainte), moteur d'adaptation
      v2 (règle `lisser_charge`, niveaux `normale`→`moderee`→`allegee`→`repos`, migration 2) et
      UI (carte forme `app/forme.tsx`, écran « Mes seuils » `app/seuils.tsx`).
- [x] **Incrément 9** — Coaching de séance : **double progression** par exercice
      (`src/domaine/progressionExercice.ts` — fourchettes de reps, paliers de charge par groupe
      musculaire, plateaux, reprise après absence), **allures personnalisées** dérivées de la VMA
      (`src/domaine/allures.ts` — tests 3000 m / demi-Cooper, EF, 30/30, 400 m), **mode séance
      guidée** (`app/seance.tsx` — déroulé par exercice, timers repos/30-30/gainage, haptique,
      `expo-keep-awake`, récap 3 taps) et **journal express** (< 10 s : pré-positionnement sur la
      veille, « identique à hier », tags par récence, saisie rétroactive limitée à hier).
- [x] **Incrément 10** — Insights : **corrélations** symptômes ↔ déclencheurs
      (`src/domaine/correlations.ts` — tags ↔ poussée 48 h, ratio sourcé, garde-fous 5 occ. + 30 j),
      **records personnels** (`src/domaine/records.ts` — 1RM Epley, 3000 m, plus longue sortie,
      allure EF, séries de journal), **tendances** (`src/domaine/tendances.ts` — moyenne mobile
      poids, charge hebdo sRPE + ACWR, santé ↔ charge, heatmap forme, observance avec grâce
      hebdomadaire) et **bilan hebdo** (`src/domaine/bilanHebdo.ts`). UI : écran **Tendances**
      (`app/tendances.tsx` — heatmap, charge & santé, poids lissé, records, corrélations), écran
      **Bilan** (`app/bilan.tsx`), notification du dimanche, rapport gastro enrichi (§3.6 :
      baseline + tendance douleur, table des déclencheurs avec effectifs).
- [x] **Incrément 11** — Plan vivant : **replanification par glissement** et **protocole de
      reprise post-poussée** (`src/domaine/replanification.ts` — `glisserProgramme`,
      `programmeReprisePostPoussee`, `suggererModePousse`, `peutSortirDePoussee`), **mode poussée**
      (règle 0 du moteur, niveau maintien minimal ; migration 3 : `profil.mode_pousse` +
      `date_debut_pousse`, CHECK `semaine` levé). UI : bannière de suggestion/activation +
      reprise validée par paliers (tableau de bord, écran « Mes seuils »).
- [x] **Incrément 12 (partiel)** — Finitions : écran **« Comment ça marche »** (`app/apropos.tsx`,
      transparence des règles + cadre médical). _Hors environnement de dev (à valider sur device) :
      widget Android (build EAS), audit accessibilité AA et rendu AMOLED, validation visuelle des
      nouveaux écrans et des notifications._
- [ ] **Incrément 13 — Portage web + sync Supabase** _(planifié, cf.
      [`docs/07`](docs/07-portage-web-supabase.md))_ : app web sur GitHub Pages, backend Supabase
      sécurisé (Auth compte unique + RLS), synchronisation bidirectionnelle web ⇄ mobile,
      chiffrement de bout en bout. Le moteur reste 100 % côté client. **Phase 0 bloquante** :
      abstraction `Depot` découplant le store de `expo-sqlite`.

> Couches métier et données vérifiables immédiatement via `npm test` (**181 tests**),
> `npm run typecheck` et `npm run lint` (0 erreur). Les écrans se valident sur device :
> `npx expo start` → `a`.

### Sauvegarde chiffrée & rapport (Incrément 6)

- **Rapport gastro** : synthèse PDF des 90 derniers jours (signaux Crohn, activité, poids,
  adaptations appliquées), générée localement puis partagée via la feuille système. Disclaimer
  médical en pied de page.
- **Export** : instantané SQLite complet → JSON → **AES-256-GCM** (clé dérivée d'une phrase
  secrète par **PBKDF2-SHA256**, 150 k itérations) → fichier `.rfb` partageable. L'enveloppe est
  autodescriptive (sel, IV, tag d'authentification) et **ne contient jamais la clé**.
- **Import / restauration** : collage du contenu `.rfb` + phrase secrète → déchiffrement
  (échec authentifié si phrase incorrecte ou fichier altéré) → restauration **tout-ou-rien**
  (transaction). Sans picker de fichiers natif, l'import se fait par collage du blob (zéro
  dépendance native supplémentaire).
