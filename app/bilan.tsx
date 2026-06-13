import { Carte, Corps, Ecran, LigneInfo, SousTitre } from '@/design/composants';
import { couleurs } from '@/design/theme';
import { type Tendance, type ZoneACWR, genererBilanHebdo } from '@/domaine';
import { useMagasin } from '@/etat/magasin';

// Bilan hebdomadaire (cf. doc 03 §3.2) : le rendez-vous du dimanche. Une synthèse
// sourcée de la semaine + un seul insight + une décision lisible.

const LIBELLE_ZONE: Record<ZoneACWR, string> = {
  sous_charge: 'sous-charge',
  optimale: 'optimale',
  vigilance: 'vigilance',
  risque: 'risque',
};

const FLECHE_TENDANCE: Record<Tendance, string> = {
  hausse: '↗ en hausse',
  stable: '→ stable',
  baisse: '↘ en baisse',
};

export default function EcranBilan() {
  const { journal, seances, aujourdhui } = useMagasin();
  const b = genererBilanHebdo(journal, seances, aujourdhui);

  return (
    <Ecran>
      <Carte>
        <SousTitre>Charge</SousTitre>
        <LigneInfo libelle="Charge sRPE" valeur={`${b.charge.srpe}`} />
        <LigneInfo
          libelle="ACWR"
          valeur={
            b.charge.acwr === null
              ? 'historique trop court'
              : `${arrondi(b.charge.acwr)} · ${b.charge.zone ? LIBELLE_ZONE[b.charge.zone] : ''}`
          }
        />
        {b.charge.vsMoyenne4Semaines !== null ? (
          <LigneInfo
            libelle="vs 4 semaines"
            valeur={`${Math.round(b.charge.vsMoyenne4Semaines * 100)} %`}
          />
        ) : null}
      </Carte>

      <Carte>
        <SousTitre>Santé</SousTitre>
        <LigneInfo
          libelle="Score de forme moyen"
          valeur={b.sante.scoreMoyen === null ? '—' : `${b.sante.scoreMoyen}/100`}
        />
        <LigneInfo libelle="Jours dégradés" valeur={`${b.sante.joursDegrades}`} />
        <LigneInfo
          libelle="Tendance douleur"
          valeur={b.sante.tendanceDouleur ? FLECHE_TENDANCE[b.sante.tendanceDouleur] : '—'}
        />
      </Carte>

      <Carte>
        <SousTitre>Progression</SousTitre>
        {b.progression.recordsBattus.length === 0 ? (
          <Corps>Aucun record cette semaine — la régularité prime.</Corps>
        ) : (
          b.progression.recordsBattus.map((r) => (
            <Corps key={r} style={{ color: couleurs.freeletics }}>
              🏅 {r}
            </Corps>
          ))
        )}
      </Carte>

      {b.insight ? (
        <Carte style={{ borderColor: couleurs.course }}>
          <SousTitre>À retenir</SousTitre>
          <Corps style={{ color: couleurs.texte }}>{b.insight}</Corps>
        </Carte>
      ) : null}

      <Carte
        style={{
          borderColor: b.decision === 'ajustement_propose' ? couleurs.sante : couleurs.freeletics,
        }}
      >
        <SousTitre>Décision</SousTitre>
        <Corps style={{ color: couleurs.texte }}>{b.libelleDecision}</Corps>
      </Carte>
    </Ecran>
  );
}

function arrondi(n: number): string {
  return (Math.round(n * 100) / 100).toString().replace('.', ',');
}
