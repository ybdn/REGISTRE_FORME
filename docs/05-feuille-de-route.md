# 05 — Feuille de route

Reprend la numérotation des incréments du README (1-7). Les incréments 4-suite à 7 restent
prioritaires : ils ferment le périmètre v1. Les incréments 8+ ci-dessous construisent la v2
« premium » dans l'ordre du meilleur ratio valeur/effort, chaque incrément étant **livrable
et utile seul**.

## Vue d'ensemble

```
v1 (en cours)     4s. Physiologie + photos   5. Notifications   6. Rapport PDF + export   7. Santé opt-in
                  ────────────────────────────────────────────────────────────────────────────────────
v2 « premium »    8. Fondations personnalisation   (baseline + score de forme + ACWR)
                  9. Coaching de séance            (double progression + séance guidée + allures)
                 10. Insights                      (corrélations + bilan hebdo + records + heatmap)
                 11. Plan vivant                   (glissement + mode poussée + reprise)
                 12. Finitions premium             (widget, quick actions, AMOLED, a11y)
```

Recommandation d'entrelacement : **8 avant 5** serait une erreur — finir la v1 d'abord
(5, 6) car le rapport gastro et les notifications portent immédiatement leurs fruits, puis
attaquer 8. L'incrément 7 (Health Connect) peut glisser après 8-10 sans dommage.

---

## Incrément 8 — Fondations de la personnalisation ⭐

Le socle de tout le reste. Réfs : doc 02 §2.1, 2.2, 2.3.

**Contenu**
- `src/domaine/baseline.ts` — baseline douleur 28 j (médiane + MAD), démarrage à froid.
- `src/domaine/scoreForme.ts` — score 0-100 décomposé, 4 niveaux de séance.
- `src/domaine/chargeEntrainement.ts` — ACWR, monotonie, contrainte.
- `evaluerAdaptation()` v2 : règle `lisser_charge`, feu vert enrichi, niveaux gradués.
- UI : carte score de forme sur le tableau de bord (avec décomposition), écran « Mes seuils ».

**Schéma** : migration 2 — élargir le CHECK de `seance_realisee.variante`
(`'normale','moderee','allegee','repos'`).

**Acceptation**
- [ ] À seuils équivalents et < 14 j de journal, le moteur v2 rend exactement les décisions v1
      (suite de tests de non-régression sur les 43 tests existants).
- [ ] La baseline ne désactive jamais les garde-fous absolus (tests aux limites : douleur 7
      avec baseline 6 ⇒ dégradé).
- [ ] Chaque `raison` cite les chiffres personnels (baseline, ACWR) en français.
- [ ] ACWR nul (< 21 j de données) ⇒ composante charge neutre dans le score (pas de pénalité).

## Incrément 9 — Coaching de séance

Réfs : doc 02 §2.4, 2.5 ; doc 04 §4.1, 4.2.

**Contenu**
- `src/domaine/progressionExercice.ts` — double progression, plateaux, reprise après absence.
- `src/domaine/allures.ts` — VMA estimée (3000 m / demi-Cooper), allures cibles min/km.
- Mode séance guidée : déroulé par exercice, cibles affichées, timers (repos, 30/30, gainage),
  haptique, récap 3 taps. Ajouter `expo-keep-awake`.
- Journal < 10 s : pré-positionnement, « identique à hier », tags récents.
- `ExerciceModele` : + `repsMin`, `repsMax`, `groupeMusculaire`.

**Schéma** : aucun (l'historique par exercice se lit dans `seance_realisee.charges`).

**Acceptation**
- [ ] La cible affichée pour chaque exercice découle des 10 dernières séances du même modèle
      (cas testés : progression rep, passage de palier charge, plateau ×3, absence 14 j).
- [ ] `ralentir_progression` actif ⇒ aucune proposition d'incrément de charge.
- [ ] Sans test chrono, les écrans course sont identiques à la v1 (pas d'allure inventée).

## Incrément 10 — Insights

Réfs : doc 03 entier.

**Contenu**
- `src/domaine/correlations.ts`, `records.ts`, `tendances.ts` (purs, testés).
- Bilan hebdo (carte du dimanche + notification locale).
- Records personnels (1RM Epley, course, constance) + historique.
- Heatmap 16 semaines, graphe santé ↔ charge, poids lissé 7 j.
- Observance bienveillante (grâce hebdo, exclusion des semaines de poussée — anticipée ici,
  activée à l'incrément 11).
- Enrichissement du rapport gastro (si l'incrément 6 est déjà livré : sections 3.1 → 3.5).

**Acceptation**
- [ ] Aucune corrélation affichée sous 5 occurrences ou 30 j de journal.
- [ ] Chaque insight est cliquable vers les données brutes qui le fondent.
- [ ] Le bilan hebdo se génère sans réseau, en < 1 s sur device.

## Incrément 11 — Plan vivant

Réfs : doc 02 §2.6.

**Contenu**
- `src/domaine/replanification.ts` — glissement du programme, protocole de reprise post-poussée.
- Mode poussée : bouton + suggestion auto (5 j dégradés), programme de maintien, sortie
  validée par paliers.
- UI : bannière de proposition de glissement (jamais d'application silencieuse).

**Schéma** : migration 3 — `profil.mode_pousse`, `profil.date_debut_pousse` ; lever le CHECK
`semaine BETWEEN 1 AND 16` sur `seance_planifiee`.

**Acceptation**
- [ ] Un glissement préserve l'intégrité du programme (16 semaines de contenu, phases
      contiguës, tests chrono en fin de Performance).
- [ ] Le mode poussée gèle toute progression et exclut la période des stats d'observance.
- [ ] La reprise impose −30 % puis −15 % avec validation par score de forme moyen ≥ 60.

## Incrément 12 — Finitions premium

Réfs : doc 04 §4.3 ++, 4.4, 4.5, 4.6.

Widget Android (dev build EAS), quick actions, AMOLED, heure de rappel apprise, états vides
soignés, accessibilité AA, écran « Mes données » et « Comment ça marche ». À traiter comme
un budget de polissage continu plutôt qu'un bloc.

---

## Synthèse des migrations SQLite

| Migration | Incrément | Contenu |
|---|---|---|
| 2 | 8 | CHECK `variante` élargi (4 niveaux) |
| 3 | 11 | `profil.mode_pousse`, `profil.date_debut_pousse` ; CHECK semaine levé |

Volontairement minimal : baseline, ACWR, corrélations, records, cibles d'exercice sont
**recalculés à la volée** depuis les tables existantes (volumes négligeables sur 16+ semaines).
C'est le prolongement direct du choix KISS : l'état dérivé ne se stocke pas.

## Risques & garde-fous

- **Sur-personnalisation = perte de lisibilité.** Chaque écran qui affiche une décision doit
  pouvoir répondre à « pourquoi ? » en un tap. Si une règle ne s'explique pas en une phrase,
  elle ne rentre pas.
- **Validation médicale.** Les nouveaux seuils (baseline, niveaux gradués, protocole de
  reprise) doivent être montrés au gastro comme les règles v1 l'ont été. L'écran « Comment
  ça marche » sert aussi à ça.
- **Dérive de périmètre.** Pas de GPS, pas de nutrition détaillée, pas de social, pas de
  cloud. Si une idée future requiert l'un des quatre : c'est non par défaut.
