# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Projet

REGISTRE.FORME — app mobile React Native/Expo (SDK 54) de remise en forme pilotée par le
biofeedback santé, pour une personne vivant avec une maladie de Crohn. Les signaux santé
(douleur, énergie, digestion) adaptent automatiquement le plan d'entraînement 16 semaines,
jamais l'inverse.

**Tout le code métier, les commentaires et l'UI sont en français** (avec accents). Répondre en français.

## Commandes

```bash
npm test                              # suite Vitest complète
npx vitest run tests/scoreForme.test.ts   # un seul fichier de test
npx vitest run -t "nom du test"       # un seul test par nom
npm run typecheck                     # tsc --noEmit
npm run lint                          # biome check .
npm run lint:fix                      # biome check --write .
npx expo start                        # lancer l'app (puis 'a' pour Android)
```

Toujours passer `typecheck` + `lint` + `test` avant de conclure une modification.

## Architecture (4 couches, dépendances unidirectionnelles)

```
app/            Écrans Expo Router — app/(onglets)/ = tab bar (Aujourd'hui, Journal, Tendances,
                Réglages), les écrans de détail restent des routes Stack dans app/_layout.tsx
src/etat/       magasin.ts — UNIQUE store Zustand : colle UI ↔ données (via l'interface Depot), état dérivé
src/donnees/    Persistance derrière l'interface `Depot` (depot.ts) : depotSqlite (mobile, expo-sqlite),
                depotSupabase (web online, cf. docs/07), depotMemoire (tests). Auth : auth.ts + supabaseClient.ts.
                sync/ = synchro mobile offline-first LWW (syncManager pur + registreSync + transportSupabase).
                Services Expo (notifications, PDF, sauvegarde chiffrée) avec shims `.web.ts`.
src/domaine/    Logique métier PURE — aucune dépendance Expo, 100 % testable Vitest
src/design/     theme.ts (couleurs/typo/espaces) + composants.tsx (Ecran, Carte, Bouton, Titre…)
```

**Règle clé : toute nouvelle logique métier vit dans `src/domaine/` (pur, sérialisable), couverte
par un test dans `tests/` (miroir 1:1 des modules du domaine).** Les écrans ne contiennent que de
l'UI ; le store ne contient que de la colle.

### Flux de données

1. Les écritures (journal, séance, mesure) passent par les actions du `magasin.ts`, qui persistent
   via l'interface `Depot` (depotSqlite → SQLite sur mobile, depotSupabase sur web) puis appellent
   `recharger()`. Le store ignore le backend concret (injecté par `fabriqueDepot`).
2. `recharger()` relit la base et **recalcule à la volée tout l'état dérivé** (adaptation du jour,
   score de forme, baseline) — l'état dérivé n'est jamais stocké, seules les données brutes le sont.
3. Le moteur d'adaptation (`src/domaine/moteurAdaptation.ts`) décide un niveau de séance
   (`normale` → `moderee` → `allegee` → `repos`) ; `seanceDuJour()` / `seanceLibre()` dans le
   store appliquent ce niveau (allégée bascule sur le modèle santé `MODELE_ALLEGE_ID`).
4. Le programme 16 semaines est généré (`generateurSemaines.ts`) et seedé une fois en base ;
   les modèles de séances vivent dans `modelesSeances.ts` (`MODELES`).

### SQLite

Migrations versionnées dans `src/donnees/schema.ts` via `PRAGMA user_version`.
**Ne jamais réécrire une migration publiée : en ajouter une nouvelle.**

## Invariants non négociables (cf. docs/)

1. **Local-first par défaut ; sync cloud opt-in** (assoupli en Phase 1, cf. `docs/07`).
   Déconnecté, l'app fonctionne 100 % hors-ligne (SQLite local, aucun réseau) — c'est le défaut et
   le repli, pas d'analytics. Se connecter à un compte **active** la synchronisation Supabase (web
   online aujourd'hui ; sync mobile offline-first = Phase 2). Le moteur (`src/domaine/`) reste
   **100 % côté client** : aucune logique métier serveur (ADR-002), Supabase ne fait qu'authentifier
   + stocker + transporter. Isolation par RLS `user_id = auth.uid()` + TLS + chiffrement at-rest.
   > ⚠️ **E2EE pas encore livré (Phase 3)** : au stade actuel le `contenu` est stocké en clair
   > (`jsonb`) côté Supabase. Le chiffrement de bout en bout du contenu (passphrase, contenu opaque)
   > est planifié et réutilisera `chiffrement.ts`.

   L'import de séances externes (Strava, Freeletics…) passe par Health Connect, la base santé locale
   d'Android (`src/donnees/santeConnect.ts`) — lecture opt-in, sur l'appareil ; absent sur web.
2. **Déterministe et explicable** : chaque décision du moteur est une règle lisible, affichée
   telle quelle à l'utilisateur (`raison`), et annulable d'un tap. Pas de ML opaque.
3. **Sécurité MICI d'abord** : les garde-fous absolus (douleur ≥ 7, pas d'apnée sous charge…)
   priment sur tout ; la personnalisation ne peut qu'abaisser les seuils de prudence.
4. **KISS** : Zustand + Expo Router, pas de sur-architecture.

## Économie de tokens — lire efficacement ce dépôt

- **Commencer par `src/domaine/index.ts`** : il liste toute l'API du domaine. Puis
  `src/domaine/types.ts` (vocabulaire métier) et `src/domaine/constantes.ts` (tous les seuils
  nommés). Cela évite d'ouvrir chaque module.
- **Chaque fichier commence par un bloc de commentaires expliquant son rôle** : lire les
  ~30 premières lignes suffit pour juger de sa pertinence avant un Read complet.
- Les gros fichiers à lire par tranches ciblées (offset/limit) : `app/seance.tsx` (~850 lignes,
  déroulé guidé), `src/etat/magasin.ts` (~300 lignes).
- Les tests `tests/<module>.test.ts` documentent le comportement attendu d'un module du domaine —
  souvent plus rapide à lire que le module lui-même.
- `docs/01-06` = spécifications produit : à consulter uniquement pour le contexte d'une nouvelle
  fonctionnalité (la feuille de route est dans `05`, les specs du moteur v2 dans `02`).
- `docs/07` = plan d'architecture du **portage web (GitHub Pages) + sync Supabase** (auth compte
  unique, RLS, chiffrement E2EE, plan en 5 phases). Lire avant toute tâche liée au web ou au cloud.
  **Phases 0, 1 et 2 livrées** : interface `Depot` (depot.ts) + depotSqlite/depotSupabase/depotMemoire,
  auth + écran connexion, schéma Supabase (`supabase/schema.sql`) + RLS, shims `.web.ts`, déploiement
  GitHub Pages, **sync mobile offline-first** (migration SQLite v6 `dirty`/`maj_le` + `sync_etat`/
  `sync_suppressions` ; `src/donnees/sync/` = SyncManager LWW pur + registre + transport Supabase ;
  déclencheurs démarrage/foreground/post-écriture ; carte sync dans Réglages). **Reste à faire** :
  Phase 3 (E2EE + persistance de session mobile), Phase 4 (offline web).
- Ne jamais explorer `node_modules/` ; `grep` ciblé plutôt que lecture de répertoires entiers.
