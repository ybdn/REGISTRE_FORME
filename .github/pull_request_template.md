## Résumé

<!-- Que change cette PR, et pourquoi ? -->

## Couche(s) touchée(s)

<!-- Cocher — respecter les dépendances unidirectionnelles (cf. CLAUDE.md). -->

- [ ] `src/domaine/` (logique métier pure + test miroir dans `tests/`)
- [ ] `src/etat/` (store Zustand — colle uniquement)
- [ ] `src/donnees/` (SQLite / services Expo)
- [ ] `src/design/` (thème / composants)
- [ ] `app/` (écrans Expo Router)

## Invariants (cf. CLAUDE.md)

- [ ] Local-first : aucune requête réseau au runtime, pas d'analytics, pas de compte
- [ ] Décisions du moteur déterministes et explicables (`raison` affichée, annulable)
- [ ] Sécurité MICI : les garde-fous absolus ne sont pas affaiblis
- [ ] Nouvelle migration SQLite ajoutée (jamais réécrite) si le schéma change

## Vérifications

- [ ] `npm run typecheck`
- [ ] `npm run lint`
- [ ] `npm test`

## Notes

<!-- Captures d'écran, points d'attention, suites à prévoir… -->
