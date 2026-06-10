# Documentation produit — REGISTRE.FORME v2 « Premium »

Réflexion produit consignée à la fin du développement des incréments 1-4 : comment passer d'une
app fonctionnelle à un **produit premium**, avec un suivi et des logiques d'entraînement
**très personnalisées** — sans jamais trahir l'ADN du projet (local-first, déterministe,
aucune boîte noire, KISS).

## Sommaire

| Document | Contenu |
|---|---|
| [01 — Vision premium](01-vision-premium.md) | Ce que « premium » veut dire ici, principes directeurs, expérience cible |
| [02 — Personnalisation de l'entraînement](02-personnalisation-entrainement.md) | ⭐ Moteur d'adaptation v2 : baseline personnelle, score de forme, gestion de charge (ACWR), progression par exercice, allures personnalisées, plan vivant |
| [03 — Suivi & insights](03-suivi-insights.md) | Corrélations symptômes ↔ déclencheurs, tendances, records, observance, rapport gastro enrichi |
| [04 — Expérience & finitions premium](04-experience-premium.md) | Séance guidée, saisie express, notifications contextuelles, widgets, micro-interactions |
| [05 — Feuille de route](05-feuille-de-route.md) | Priorisation en incréments (8 →), impacts schéma SQLite, critères d'acceptation |
| [06 — Prompts d'implémentation](06-prompts-implementation.md) | Prompts prêts à l'emploi, un par incrément, avec contraintes et critères de fin |

## Principe non négociable

Chaque évolution proposée respecte les invariants du projet :

1. **Local-first** — aucun calcul ne nécessite le réseau ; tout tourne sur l'appareil.
2. **Déterministe et explicable** — chaque décision du moteur reste une règle lisible,
   affichable telle quelle à l'utilisateur et défendable en consultation gastro.
   Pas de ML opaque : des statistiques simples (médianes, ratios, comptages).
3. **Sécurité d'abord** — les garde-fous absolus MICI (douleur ≥ 7, etc.) priment toujours
   sur la personnalisation. La baseline personnelle ne peut qu'**abaisser** les seuils de
   prudence, jamais les relever au-delà des plafonds de sécurité.
4. **Testable en couche domaine pure** — toute nouvelle logique vit dans `src/domaine/`,
   sans dépendance Expo, couverte par Vitest.
5. **Annulable** — l'utilisateur garde le dernier mot sur chaque adaptation, d'un tap.
