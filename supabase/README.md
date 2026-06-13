# Supabase — backend de synchronisation REGISTRE.FORME

Backend **auth + stockage + transport** uniquement. Aucune logique métier ici (ADR-002,
cf. `docs/07`). Le moteur d'adaptation reste 100 % côté client.

## 1. Créer le projet

1. [supabase.com](https://supabase.com) → **New project**.
2. **Région : UE** (ex. `eu-central-1`) — données de santé = catégorie particulière RGPD (§7.4).
3. Mot de passe Postgres fort, conservé hors du dépôt.

## 2. Appliquer le schéma + RLS

SQL Editor → coller `schema.sql` → **Run**. Crée la table `enregistrements`, l'index de
pull incrémental, le trigger `maj_le` et les 4 policies RLS propriétaire.

## 3. Configurer l'authentification (§5.3)

- **Authentication → Providers → Email** : activé.
- **Authentication → Sign-ups** : *Disable new user signups* (compte créé à la main).
- **Authentication → Users → Add user** : e-mail + mot de passe fort (≥ 12 car.).
- **Authentication → MFA** : activer *TOTP* (recommandé).
- **Authentication → Policies (passwords)** : longueur min ≥ 12, *leaked password protection* activée.
- **URL Configuration** : ajouter `https://<user>.github.io/crohnos` au *Site URL* et aux
  *Redirect URLs* (sinon le flux de connexion web est rejeté + CORS).

## 4. Récupérer les clés (publiques par conception)

**Project Settings → API** :

- `Project URL`  → `EXPO_PUBLIC_SUPABASE_URL`
- `anon public`  → `EXPO_PUBLIC_SUPABASE_ANON_KEY`

Les copier dans un `.env` local (cf. `.env.example` à la racine) et dans les *Repository
secrets* GitHub (pour le build web). La clé `service_role` ne quitte **jamais** la machine
locale et n'est **jamais** committée.

## 5. Vérifier la sécurité RLS (non négociable, §10.3)

Avant tout déploiement :
- un JWT utilisateur ne lit **aucune** ligne dont `user_id ≠ auth.uid()` ;
- une requête sans JWT (clé `anon` seule) ne lit **rien** ;
- un `insert` avec `user_id` falsifié est **rejeté** par `with check`.
