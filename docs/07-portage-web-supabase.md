# 07 — Portage Web + Synchronisation Supabase

> **Statut :** plan d'architecture validé · **Cible :** app web (GitHub Pages) + backend Supabase
> sécurisé + synchronisation web ⇄ mobile · **Auteur :** ybdn · **Dernière révision :** 2026-06-13

---

## 0. Résumé exécutif

On ajoute à REGISTRE.FORME une **présence web** (PWA hébergée sur GitHub Pages) et une
**synchronisation cloud** des données entre le mobile (Android) et le web, via **Supabase**
(Postgres managé + Auth). L'accès est protégé par une **authentification à compte unique** que tu
crées toi‑même ; les inscriptions publiques restent fermées.

Décision structurante : **le moteur métier reste 100 % côté client.** Supabase ne fait que trois
choses — authentifier, stocker les données brutes, synchroniser. Aucune logique d'adaptation, aucun
calcul de score, aucun seuil ne migre côté serveur. Le déterminisme et l'explicabilité (invariant
produit #2) sont donc intégralement préservés : `recharger()` continue de recalculer tout l'état
dérivé à la volée, peu importe que les données brutes viennent de SQLite, d'IndexedDB ou de Supabase.

**Ce que ce projet change explicitement** par rapport au `CLAUDE.md` actuel : l'invariant #1
*« local-first : aucune requête réseau au runtime, pas de compte »* est **assoupli en option
opt‑in** « cloud-sync ». Le mode 100 % local reste le défaut et le comportement de repli ; la
synchronisation est une fonctionnalité que l'utilisateur active en se connectant. Voir §3 (ADR‑001).

---

## 1. Objectifs et non-objectifs

### 1.1 Objectifs

1. **App web** consultable et utilisable depuis un navigateur, hébergée gratuitement sur GitHub
   Pages (`https://<user>.github.io/crohnos`).
2. **Backend Supabase sécurisé** : Postgres + Row Level Security + Auth, données chiffrées au repos
   et en transit.
3. **Authentification à compte unique** : un compte que tu définis manuellement ; pas d'inscription
   ouverte, pas d'annuaire d'utilisateurs.
4. **Synchronisation bidirectionnelle web ⇄ mobile** : une saisie faite sur un appareil réapparaît
   sur l'autre.
5. **Aucune régression mobile** : l'app Android continue de fonctionner hors‑ligne ; la sync est
   additive.

### 1.2 Non-objectifs (hors périmètre de ce lot)

- Application multi‑utilisateurs / partage social. (Le schéma est néanmoins multi‑tenant par
  `user_id` dès le départ, pour ne pas avoir à le refactorer plus tard.)
- Import de séances externes **sur web** : `react-native-health-connect` est Android‑only et n'a
  aucun équivalent web. Le web est un client de saisie/consultation, pas d'import automatique.
- Notifications push web (Web Push / service worker) : reportées (cf. §8.4).
- Édition collaborative temps réel / multi‑curseur. La sync vise un usager solo sur plusieurs
  appareils, pas l'édition concurrente intensive.

---

## 2. État des lieux technique (ce dont on part)

| Couche | Fichier(s) clés | Portabilité web | Action |
|---|---|---|---|
| **Domaine** | `src/domaine/*` (~20 modules), `index.ts` | ✅ TypeScript pur, zéro dépendance Expo | Aucune |
| **Chiffrement** | `src/donnees/chiffrement.ts` (AES‑256‑GCM + PBKDF2, `node-forge`) | ✅ Pur JS, marche en navigateur | Réutilisé pour l'E2EE (§7.3) |
| **Sauvegarde** | `src/donnees/sauvegarde.ts`, `src/domaine/sauvegarde.ts` | ⚠️ dépend de `expo-file-system`/`expo-sharing` | Shim web (download blob) |
| **Persistance** | `src/donnees/db.ts`, `schema.ts`, `depots.ts` (`expo-sqlite`) | ⚠️ SQLite web fragile | Abstraction `Depot` (§4.2) |
| **Store** | `src/etat/magasin.ts` | ⚠️ importe `db` en dur | Découplage via `Depot` |
| **Services Expo** | `notifications.ts`, `rapportPdf.ts`, `santeConnect.ts` | ❌ natifs | Shims `.web.ts` ou no‑op |
| **Routing/UI** | `app/`, `app/(onglets)/`, `src/design/*` | ✅ react-native-web | Config GitHub Pages |

**Point d'attention majeur dans le code actuel :** `magasin.ts` reçoit l'instance
`SQLite.SQLiteDatabase` et la passe explicitement à chaque fonction de dépôt
(`enregistrerJournal(db, e)`, `lireSeances(base, depuis)`, …). C'est le couplage à casser en
premier (§4.2). Tant qu'il existe, aucun backend alternatif n'est branchable proprement.

**Schéma de données existant** (`src/donnees/schema.ts`, `user_version = 5`) — 9 tables, **sans
clés étrangères entre elles** (confirmé par `sauvegarde.ts`) :
`profil` (singleton id=1), `journal_crohn` (PK `date`), `seance_planifiee` (PK `id`),
`seance_realisee` (PK `id`), `mesure_corporelle` (PK `date`), `photo_suivi` (PK `id`),
`adaptation` (PK `id`), `consommation_jour` (PK `date`), `aliment_statut` (PK `aliment`).

L'absence de FK inter‑tables est une chance : chaque table se synchronise indépendamment.

---

## 3. Décisions d'architecture (ADR)

### ADR‑001 — La synchronisation cloud est une option opt‑in, pas le défaut
**Décision.** L'app reste local‑first par défaut. Se connecter à un compte **active** la sync.
Déconnecté, l'app fonctionne exactement comme aujourd'hui (SQLite local, zéro réseau).
**Conséquence.** Le `CLAUDE.md` doit être amendé : l'invariant #1 devient « local‑first par défaut ;
sync cloud chiffrée opt‑in ». Le mode hors‑ligne reste un chemin de premier ordre, testé.

### ADR‑002 — Le moteur reste intégralement côté client
**Décision.** Aucune logique de `src/domaine/` ne migre vers Supabase (pas d'Edge Function métier,
pas de trigger de calcul). Supabase = auth + stockage + transport.
**Justification.** Préserve l'invariant #2 (déterministe & explicable) et permet au mode hors‑ligne
de produire exactement les mêmes décisions que le mode connecté.

### ADR‑003 — Stockage générique par enregistrement, contenu en `jsonb` (chiffrable)
**Décision.** Une **table unique `enregistrements`** stocke toutes les entités sous forme
`(user_id, entite, cle, contenu jsonb, supprime, maj_le)` plutôt que 9 tables miroir typées.
**Justification.**
- Le serveur n'a jamais besoin de *comprendre* le contenu (le moteur recalcule client‑side) → une
  seule policy RLS à auditer, surface d'attaque minimale.
- Le schéma Supabase devient **stable et découplé des migrations métier** : ajouter un champ au
  domaine ne nécessite aucune migration Postgres.
- `contenu jsonb` est lisible/debuggable au MVP, et **devient un blob chiffré (`bytea`) sans changer
  le schéma de sync** quand on active l'E2EE (§7.3). Chemin d'évolution non‑bloquant.

**Alternative écartée.** Tables miroir typées (`journal_crohn`, etc.) côté Postgres : meilleure pour
des requêtes serveur analytiques, mais on n'en fait aucune, et chaque migration `schema.ts` devrait
être rejouée en SQL Supabase. Couplage coûteux pour un bénéfice nul ici.

### ADR‑004 — Authentification e‑mail/mot de passe, compte unique, inscriptions fermées
**Décision.** Supabase Auth (GoTrue), provider e‑mail+mot de passe. **Inscriptions publiques
désactivées** ; le compte est créé manuellement via le dashboard Supabase. MFA TOTP activable.
**Justification.** Tu veux *un* compte que tu définis. Pas de flux d'inscription = pas de surface
d'abus, pas de CAPTCHA, pas d'e‑mails transactionnels à gérer.

### ADR‑005 — Stratégie de sync : last‑write‑wins horodatée, offline‑first sur mobile
**Décision.** Réconciliation par **horloge `maj_le` (timestamptz)**, résolution **dernier‑écrit‑gagne**
au grain de l'enregistrement. Mobile = offline‑first (SQLite reste la source de lecture, push/pull
en tâche de fond). Web = online‑first au MVP (lecture/écriture directe Supabase), offline‑web
(IndexedDB) en incrément ultérieur.
**Justification.** Usager solo multi‑appareils → conflits réels rares (rarement deux éditions du
*même* jour sur deux appareils dans la même fenêtre). LWW est suffisant, simple, déterministe et
explicable. On évite les CRDT (surdimensionnés ici, invariant KISS #4).

### ADR‑006 — Chiffrement de bout en bout (E2EE) des données santé : recommandé, livré en Phase 3
**Décision.** Cible : le contenu santé est chiffré **côté client** (réutilise `chiffrement.ts`)
avant envoi ; Supabase ne stocke que de l'opaque. Livré après que la sync « en clair + RLS »
fonctionne, sans changer le schéma de transport.
**Justification.** Données MICI = données de santé sensibles. RLS + TLS + chiffrement‑at‑rest
Supabase est un socle correct, mais l'E2EE est ce qui reste fidèle à l'esprit de l'app. Le coût
(gestion de clé, passphrase) justifie de le traiter en phase dédiée plutôt que de bloquer le MVP.

---

## 4. Architecture cible

### 4.1 Vue en couches (inchangée dans son principe)

```
app/              UI Expo Router — + écran Auth (connexion) + indicateur d'état de sync
src/etat/         magasin.ts — ne connaît plus SQLite, parle à l'interface Depot + au SyncManager
src/donnees/      depot.ts (INTERFACE) ─┬─ depotSqlite.ts   (mobile, = l'actuel refactoré)
                                        ├─ depotSupabase.ts (web online + cible de sync)
                                        └─ sync/            (SyncManager, file d'attente, deltas)
                  auth.ts (Supabase Auth), supabaseClient.ts
src/domaine/      INCHANGÉ — pur, testable
src/design/       INCHANGÉ
```

### 4.2 L'abstraction `Depot` (prérequis n°1)

On extrait une interface neutre, sans type Expo dans sa signature :

```ts
// src/donnees/depot.ts
export interface Depot {
  lireJournal(depuis: string): Promise<EntreeJournal[]>;
  enregistrerJournal(e: EntreeJournal): Promise<void>;
  lireSeances(depuis: string): Promise<SeanceRealisee[]>;
  enregistrerSeance(s: SeanceRealisee): Promise<void>;
  // … une méthode par opération actuellement dans depots.ts/profil.ts
  // mais SANS le paramètre `db` (capturé à la construction de l'implémentation)
}
```

- `depotSqlite.ts` = le `depots.ts` actuel, avec `db` capturé en clôture au lieu d'être passé à
  chaque appel. Refactor mécanique, couvert par les tests existants.
- `magasin.ts` reçoit un `Depot` (injecté selon la plateforme) au lieu d'un `SQLiteDatabase`. Toute
  la logique de `recharger()` est inchangée : elle lit via le `Depot` et recalcule l'état dérivé.

> **Ce refactor a de la valeur même sans Supabase** : il isole le store de la persistance et rend
> testable la couche données sans émulateur. C'est le socle de tout le reste.

### 4.3 Sélection de l'implémentation par plateforme

| Plateforme | Lecture/écriture | Source de vérité | Hors‑ligne |
|---|---|---|---|
| **Android (connecté)** | `depotSqlite` (rapide, local) | SQLite + push vers Supabase | ✅ natif |
| **Android (déconnecté)** | `depotSqlite` | SQLite seul | ✅ |
| **Web (connecté)** | `depotSupabase` (online) | Supabase | ⚠️ Phase 4 (IndexedDB) |

Le mobile ne lit **jamais** Supabase en synchrone pour l'UI : il lit SQLite et la sync rapatrie les
deltas en arrière‑plan. C'est ce qui garde l'app instantanée et utilisable dans le métro.

### 4.4 Le `SyncManager` (mobile)

Pseudo‑flux, déclenché à la connexion, au démarrage, après chaque écriture (debounce), et sur retour
au premier plan :

```
push():  SELECT * FROM <tables> WHERE dirty = 1
         → upsert vers enregistrements (Supabase)
         → marquer dirty = 0
pull():  SELECT * FROM enregistrements WHERE maj_le > :derniereSync (Supabase)
         → pour chaque ligne : si maj_le distant > maj_le local → appliquer (LWW)
         → stocker la nouvelle borne derniereSync
```

Implémentation : on ajoute deux colonnes locales **`dirty INTEGER`** et **`maj_le TEXT`** à chaque
table synchronisée (migration SQLite `version: 6`, cf. §6.1), plus une table `sync_etat(cle, valeur)`
pour mémoriser `derniereSync` par entité. Le `maj_le` est posé à l'écriture par le store.

---

## 5. Modèle de données Supabase

### 5.1 Schéma SQL (à exécuter dans le SQL Editor Supabase / via migration)

```sql
-- Extension pour gen_random_uuid (présente par défaut sur Supabase).
create extension if not exists "pgcrypto";

-- Table unique, multi-tenant par user_id (ADR-003).
create table public.enregistrements (
  user_id   uuid        not null references auth.users (id) on delete cascade,
  entite    text        not null,         -- 'journal_crohn' | 'seance_realisee' | ...
  cle       text        not null,         -- PK métier : date AAAA-MM-JJ, id UUID, ou '1' (profil)
  contenu   jsonb,                         -- données brutes ; null si supprimé. Devient opaque en E2EE.
  supprime  boolean     not null default false,
  maj_le    timestamptz not null default now(),
  primary key (user_id, entite, cle)
);

-- Index de pull incrémental (deltas par fenêtre temporelle).
create index enregistrements_maj_idx on public.enregistrements (user_id, maj_le);

-- maj_le toujours à jour côté serveur (garde-fou anti-horloge-client faussée).
create or replace function public.touch_maj_le() returns trigger
  language plpgsql as $$
begin
  new.maj_le := now();
  return new;
end $$;

create trigger trg_touch_maj_le
  before insert or update on public.enregistrements
  for each row execute function public.touch_maj_le();
```

> **Entités synchronisées.** Les 8 tables de données utilisateur (toutes sauf `seance_planifiee`,
> qui est dérivée du générateur et peut être re‑seedée — mais on la synchronise aussi car les jours
> sont **déplaçables** par l'utilisateur, donc l'état est significatif). `photo_suivi` ne synchronise
> que la métadonnée ; les fichiers image chiffrés sont hors périmètre MVP (Supabase Storage en option
> ultérieure).

### 5.2 Row Level Security (le pilier de sécurité)

```sql
alter table public.enregistrements enable row level security;

-- Un utilisateur ne voit et n'écrit QUE ses propres lignes. auth.uid() vient du JWT.
create policy "proprietaire_select" on public.enregistrements
  for select using (user_id = auth.uid());

create policy "proprietaire_insert" on public.enregistrements
  for insert with check (user_id = auth.uid());

create policy "proprietaire_update" on public.enregistrements
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "proprietaire_delete" on public.enregistrements
  for delete using (user_id = auth.uid());
```

**Règle d'or :** la clé `anon` est publique (embarquée dans le bundle web sur GitHub Pages — c'est
*normal et prévu*). **Toute** la sécurité d'isolation repose donc sur RLS. Une policy ratée = données
ouvertes. Ces 4 policies doivent être testées explicitement (§10.3).

### 5.3 Configuration Auth (dashboard Supabase)

- **Authentication → Providers → Email** : activé.
- **Authentication → Sign‑ups** : *Disable new user signups* (compte créé à la main).
- **Création du compte** : `Authentication → Users → Add user` (e‑mail + mot de passe fort), ou
  via le CLI / API admin avec la `service_role` key.
- **MFA (recommandé)** : activer *TOTP* dans `Authentication → MFA`.
- **URL Configuration** : ajouter `https://<user>.github.io/crohnos` aux *Redirect URLs* et au
  *Site URL* (sinon le flux de connexion web est rejeté).
- **Mot de passe** : longueur minimale ≥ 12, vérification *leaked password* (HaveIBeenPwned) activée.

---

## 6. Migrations & compatibilité

### 6.1 Migration SQLite locale `version: 6` (mobile)

Ajoute la quincaillerie de sync **sans toucher aux migrations 1‑5 publiées** (invariant SQLite) :

```sql
-- src/donnees/schema.ts — nouvelle entrée MIGRATIONS, version 6, nom 'sync_supabase'
ALTER TABLE journal_crohn      ADD COLUMN dirty INTEGER NOT NULL DEFAULT 1;
ALTER TABLE journal_crohn      ADD COLUMN maj_le TEXT;
-- … idem pour seance_realisee, mesure_corporelle, adaptation,
--    consommation_jour, aliment_statut, seance_planifiee, profil
CREATE TABLE IF NOT EXISTS sync_etat (
  cle    TEXT PRIMARY KEY,   -- ex: 'derniereSync'
  valeur TEXT NOT NULL
);
```

`dirty DEFAULT 1` garantit que **toutes les données pré‑existantes** d'un utilisateur déjà installé
sont poussées au cloud lors de la première connexion (rien n'est oublié).

### 6.2 Premier rapprochement (bootstrap d'un appareil)

- **Appareil A déjà rempli, se connecte en premier** : push de tout (tout est `dirty`).
- **Appareil B vierge, se connecte ensuite** : pull complet (`maj_le > epoch`).
- **Deux appareils déjà remplis indépendamment** (cas migration) : fusion LWW par `(entite, cle)`.
  Risque de perte si même `cle` éditée des deux côtés → on prévient l'utilisateur au 1er rapprochement
  (modale « fusionner les données de cet appareil avec le cloud ? ») avant tout `push` destructif.

---

## 7. Sécurité

### 7.1 Modèle de menace (résumé)

| Menace | Mitigation |
|---|---|
| Lecture des données d'autrui | RLS `user_id = auth.uid()` (§5.2) + un seul compte de toute façon |
| Interception réseau | TLS (HTTPS forcé par Supabase et GitHub Pages) |
| Fuite de la base Supabase | Chiffrement at‑rest Supabase + **E2EE** (§7.3) → contenu opaque |
| Vol de la clé `anon` | Sans valeur sans JWT valide ; RLS bloque tout accès non authentifié |
| Vol de la `service_role` | **Jamais** dans le client ni le repo ; uniquement en secret CI si besoin admin |
| Brute‑force mot de passe | Rate‑limiting GoTrue + politique mot de passe forte + MFA TOTP |
| XSS exfiltrant le JWT | CSP stricte sur la page web, dépendances minimales, pas d'eval |

### 7.2 Gestion des secrets

- **Client (web + mobile)** : `EXPO_PUBLIC_SUPABASE_URL` et `EXPO_PUBLIC_SUPABASE_ANON_KEY`
  uniquement. Publics par conception. Injectés via `app.config.ts` (`extra`) + `expo-constants`,
  ou `process.env.EXPO_PUBLIC_*`.
- **CI GitHub Actions** : les mêmes via *Repository secrets* (pour le build web). La `service_role`
  key n'est utilisée que pour d'éventuels scripts d'admin **locaux**, jamais committée.
- `.env*` ajoutés au `.gitignore` ; un `.env.example` documente les clés attendues.

### 7.3 Chiffrement de bout en bout (Phase 3)

Réutilise `src/donnees/chiffrement.ts` (AES‑256‑GCM + PBKDF2‑SHA256, déjà éprouvé par les tests de
sauvegarde) :

1. À la première activation, l'utilisateur définit une **passphrase de chiffrement** *distincte* du
   mot de passe de connexion (séparation : Supabase ne doit jamais pouvoir dériver la clé).
2. La clé est dérivée localement ; le `contenu` de chaque enregistrement est chiffré en enveloppe
   avant `upsert`. Supabase ne voit que `{format, iv, tag, donnees}` opaques.
3. Stockage de la passphrase : `expo-secure-store` (mobile) ; sur web, gardée en mémoire de session
   (re‑saisie à l'ouverture) — **non persistée** dans le navigateur par défaut.
4. **Conséquence assumée** : passphrase perdue = données cloud illisibles (aucune récupération
   serveur possible — c'est le prix de l'E2EE). À afficher clairement à l'activation.

Le schéma de transport (§5.1) est inchangé : seul le *contenu* de `contenu` passe de JSON clair à
enveloppe chiffrée. D'où l'intérêt d'avoir choisi `jsonb` générique dès le MVP (ADR‑003).

### 7.4 RGPD / conformité

Données de santé = catégorie particulière (art. 9 RGPD). Choisir une **région Supabase UE**
(ex. `eu‑central‑1`) au moment de créer le projet. Avec l'E2EE (§7.3), Supabase n'est qu'un
hébergeur de données chiffrées indéchiffrables côté serveur, ce qui réduit fortement l'exposition.
Conserver un export local chiffré (`sauvegarde.ts`) comme filet de récupération hors‑ligne.

---

## 8. Portage web

### 8.1 Dépendances

```bash
npx expo install react-native-web react-dom @expo/metro-runtime
npm i @supabase/supabase-js
# react-dom reste épinglé à 19.1.0 (cf. mémoire projet : EAS npm ci casse sinon)
```

### 8.2 Shims de plateforme (résolution `.web.ts` par Metro)

| Module natif | Stratégie web |
|---|---|
| `expo-sqlite` (`db.ts`, `depotSqlite.ts`) | Non importé sur web : `depotSupabase.ts` est sélectionné à la place |
| `expo-notifications` (`notifications.ts`) | `notifications.web.ts` = no‑op (Web Push en §8.4) |
| `expo-print` / `rapportPdf.ts` | `rapportPdf.web.ts` = `window.print()` ou génération PDF client |
| `expo-sharing` / `expo-file-system` (`sauvegarde.ts`) | `sauvegarde.web.ts` = download blob (`<a download>`) + `<input type=file>` |
| `react-native-health-connect` (`santeConnect.ts`) | `santeConnect.web.ts` = `santeConnectDisponible() → false` |
| `expo-haptics`, `expo-keep-awake` | no‑op silencieux (déjà tolérant) |
| `expo-secure-store` (passphrase E2EE) | `sessionStorage` / mémoire, non persistée |

Le `magasin.ts` doit cesser d'importer `notifications`, `rapportPdf`, `santeConnect` **en dur** au
top‑level pour les chemins web : soit via résolution `.web.ts`, soit via injection au même titre que
le `Depot`.

### 8.3 Routing & déploiement GitHub Pages

- **Sous‑chemin** : le site vit sous `/crohnos`. Configurer `expo.experiments.baseUrl` (ou
  `expo export -p web --base-url /crohnos`) pour que les assets se résolvent.
- **SPA sur Pages** : GitHub Pages ne gère pas les rewrites ; un rechargement sur `/tendances`
  renverrait 404. Parade standard : copier `dist/index.html` en `dist/404.html` à l'export.
- **Build** : `npx expo export -p web` → produit `dist/`.
- **CI/CD** (`.github/workflows/deploy-web.yml`) :
  ```yaml
  on: { push: { branches: [main] } }
  jobs:
    deploy:
      runs-on: ubuntu-latest
      permissions: { pages: write, id-token: write }
      steps:
        - uses: actions/checkout@v4
        - uses: actions/setup-node@v4 { node-version: 20, cache: npm }
        - run: npm ci
        - run: npx expo export -p web --base-url /crohnos
        - run: cp dist/index.html dist/404.html
        - uses: actions/upload-pages-artifact@v3 { with: { path: dist } }
        - uses: actions/deploy-pages@v4
  ```
  Secrets `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` injectés en `env:` du job.
- **CORS** : l'API PostgREST/Auth de Supabase accepte l'origine `https://<user>.github.io` une fois
  ajoutée aux Redirect URLs (§5.3).

### 8.4 Notifications web (reporté)

Web Push nécessite un service worker + serveur d'envoi (clé VAPID) → incompatible avec un hébergement
purement statique sans backend d'envoi. Reporté ; sur web, `notifications.web.ts` est un no‑op.

---

## 9. Plan de travail par phases

Chaque phase est livrable et laisse l'app dans un état cohérent. `typecheck` + `lint` + `test`
doivent passer à la sortie de chaque phase (rappel `CLAUDE.md`).

### Phase 0 — Découplage de la persistance *(prérequis, sans réseau)* ✅ LIVRÉE
- [x] Extraire l'interface `Depot` (`src/donnees/depot.ts`) couvrant toutes les opérations du store.
- [x] Refactorer `depots.ts` + `profil.ts` en `depotSqlite.ts` (clôture sur `db`, plus de paramètre).
- [x] Injecter le `Depot` dans `magasin.ts` (suppression des imports SQLite en dur).
- [x] Adapter les tests existants ; ajouter un `depotMemoire.ts` (fake en RAM) pour tester le store.
- **Sortie :** mobile fonctionne identiquement, store testable sans émulateur. *Aucune dépendance
  Supabase encore.*

### Phase 1 — Web online + Auth + Supabase ✅ LIVRÉE
- [x] Créer le projet Supabase (région UE), exécuter le schéma §5.1 + RLS §5.2.
- [x] Configurer Auth §5.3, créer le compte, désactiver les inscriptions.
- [x] `supabaseClient.ts` + `auth.ts` (connexion / déconnexion / session persistée).
- [x] `depotSupabase.ts` implémentant l'interface `Depot` (lit/écrit `enregistrements`).
- [x] Écran de connexion (`app/connexion.tsx`) + garde de session dans `_layout.tsx`.
- [x] Shims web §8.2 ; build `expo export -p web` ; pipeline GitHub Pages §8.3.
- **Sortie :** app web déployée, connexion fonctionnelle, données lues/écrites dans Supabase.
- **Validation :** smoke test RLS OK (lecture/écriture anonymes bloquées) + flux connecté testé en local.

### Phase 2 — Synchronisation mobile (offline‑first) ✅ LIVRÉE
- [x] Migration SQLite `version: 6` (§6.1 : colonnes `dirty`/`maj_le`, tables `sync_etat` +
  `sync_suppressions` pour les tombstones).
- [x] `SyncManager` (push/pull LWW, §4.4) — orchestration **pure** (`src/donnees/sync/syncManager.ts`),
  testée sans émulateur (`tests/syncManager.test.ts`). Côté local SQLite : `syncLocalSqlite.ts` +
  `registreSync.ts` ; côté distant : `transportSupabase.ts` (interface `TransportSync`).
- [x] Déclencheurs : au démarrage (`demarrerSync`), au retour au premier plan (`AppState` dans
  `_layout.tsx`), après chaque écriture (debounce `planifierSync` dans `recharger`).
- [x] Premier rapprochement (§6.2) : le SyncManager renvoie `confirmationRequise` quand les deux
  côtés ont des données ; carte de confirmation + indicateur d'état de sync dans l'écran Réglages.
- [x] Le mobile lit/écrit toujours SQLite ; `transportSupabase` est la **cible de sync** (push/pull
  en tâche de fond), jamais le dépôt de lecture de l'UI.
- **Sortie :** une saisie mobile remonte au cloud et redescend sur le web, et inversement.
- **Périmètre de sync :** uniquement les données brutes divergentes (`profil`, `journal_crohn`,
  `seance_realisee`, `mesure_corporelle`, `consommation_jour`, `aliment_statut`). `adaptation` et
  `seance_planifiee` en sont **exclues** car déterministes (recalculées / regénérées à l'identique
  sur chaque appareil, ADR‑002).
- **Limite connue (suivi) :** la session Supabase mobile est gardée **en mémoire** (ni AsyncStorage
  ni `expo-secure-store` installés) → reconnexion nécessaire à chaque lancement. Persistance de
  session = petit incrément additif (réutilisera `expo-secure-store`, déjà prévu en Phase 3).

### Phase 3 — Chiffrement de bout en bout *(recommandé)*
- [ ] Activation E2EE : définition de passphrase, dérivation de clé, stockage `secure-store`/mémoire.
- [ ] Chiffrer/déchiffrer `contenu` dans `depotSupabase.ts` (réutiliser `chiffrement.ts`).
- [ ] Migration des données déjà en clair (re‑chiffrement au prochain push).
- [ ] Avertissement « passphrase perdue = données illisibles ».
- **Sortie :** Supabase ne stocke plus que de l'opaque ; fidélité à l'esprit local‑first.

### Phase 4 — Offline web (optionnel)
- [ ] `depotIndexedDb.ts` ou `wa-sqlite` comme cache local web + sync identique au mobile.
- [ ] PWA (manifest + service worker de cache d'app shell).
- **Sortie :** le web fonctionne hors connexion.

---

## 10. Tests & validation

### 10.1 Domaine (inchangé)
La suite Vitest (`tests/`) reste verte : aucun module domaine n'est modifié. C'est le filet de
sécurité qui prouve que le moteur n'a pas bougé.

### 10.2 Couche données
- Tests du `SyncManager` sur `depotMemoire` : push marque `dirty=0`, pull applique LWW, conflit
  `(entite, cle)` résolu par `maj_le` le plus récent.
- Round‑trip `depotSupabase` clair ⇄ chiffré (Phase 3) via `chiffrement.ts`.

### 10.3 Sécurité RLS *(non négociable)*
Tests d'intégration contre une instance Supabase de test :
- Un JWT utilisateur **ne lit aucune** ligne dont `user_id ≠ auth.uid()`.
- Une requête **sans** JWT (clé `anon` seule) ne lit **rien**.
- `insert` avec un `user_id` falsifié est **rejeté** par `with check`.

### 10.4 Bout en bout
- Saisir un journal sur web → vérifier l'apparition sur mobile après sync (et inverse).
- Mode avion mobile : saisie hors‑ligne, puis reconnexion → push automatique.

---

## 11. Risques & mitigations

| Risque | Impact | Mitigation |
|---|---|---|
| Policy RLS mal écrite | Fuite totale de données | Tests RLS §10.3 obligatoires avant tout déploiement |
| Perte de données au 1er rapprochement multi‑appareils | Élevé | Modale de confirmation §6.2 + export local préalable |
| Passphrase E2EE perdue | Données cloud illisibles | Avertissement explicite ; export local chiffré conservé |
| `npm ci` EAS casse (react‑dom) | Build mobile rouge | Garder `react-dom@19.1.0` épinglé (mémoire projet) |
| SQLite web instable | Web cassé | MVP web = online‑only (pas de SQLite web), offline en Phase 4 |
| Couplage `db` résiduel dans le store | Refactor qui fuit | Phase 0 bloquante, revue dédiée avant Phase 1 |
| Health Connect indisponible sur web | Fonction absente | Assumé : web = saisie/consultation, pas d'import auto |

---

## 12. Annexes

### 12.1 Variables d'environnement (`.env.example`)
```bash
EXPO_PUBLIC_SUPABASE_URL=https://xxxxxxxx.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi...        # publique, OK dans le bundle
# SUPABASE_SERVICE_ROLE_KEY=...   # JAMAIS dans le client ni committé ; admin local uniquement
```

### 12.2 Commandes utiles
```bash
npx expo start --web                 # dev web local
npx expo export -p web --base-url /crohnos   # build statique → dist/
npm run typecheck && npm run lint && npm test # garde-fous avant chaque phase
```

### 12.3 Impact sur `CLAUDE.md`
À amender en fin de Phase 1 : invariant #1 « local‑first » → « **local‑first par défaut ; sync cloud
chiffrée opt‑in** (cf. docs/07) ». Ajouter `src/donnees/depot.ts`, `depotSupabase.ts`, `sync/` et la
règle « aucune logique domaine côté serveur » (ADR‑002) à la description d'architecture.
```
```
