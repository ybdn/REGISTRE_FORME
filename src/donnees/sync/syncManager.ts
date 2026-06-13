import {
  BORNE_INITIALE,
  type DepotLocalSync,
  type EtatSync,
  type ResultatSync,
  type TransportSync,
} from './types';

// SyncManager : orchestration LWW offline-first (docs/07 §4.4, ADR-005). Pur, sans I/O directe.
//
// Cycle : (1) on récupère le delta distant AVANT de pousser — pour détecter le premier
// rapprochement (§6.2) et pour ne jamais ré-appliquer nos propres écritures ; (2) on pousse les
// modifications locales (`dirty`) et on aligne l'horloge locale sur le serveur ; (3) on applique
// les enregistrements distants strictement plus récents (dernier-écrit-gagne, au grain `(entite,cle)`).

interface OptionsSync {
  /** Force la fusion au premier rapprochement malgré des données des deux côtés (§6.2). */
  forcer?: boolean;
}

export async function synchroniser(
  local: DepotLocalSync,
  transport: TransportSync,
  etat: EtatSync,
  options: OptionsSync = {},
): Promise<ResultatSync> {
  const borne = await etat.lireDerniereSync();
  const sales = await local.lireSales();

  // Delta distant figé avant le push : sert à la détection ET à l'application (nos propres
  // pushes, postérieurs à ce snapshot, n'y figurent pas → aucune ré-application de soi-même).
  const distants = await transport.recupererDepuis(borne);

  // Premier rapprochement avec données des deux côtés : risque d'écrasement → on demande
  // confirmation avant tout push destructif (§6.2). `forcer` lève le garde-fou.
  const premierRapprochement = borne === BORNE_INITIALE;
  if (premierRapprochement && !options.forcer && sales.length > 0 && distants.length > 0) {
    return { statut: 'confirmationRequise', pousses: 0, appliques: 0 };
  }

  let maxBorne = borne;

  // ── Push : upsert des locaux sales, puis alignement de l'horloge locale sur le serveur ──
  if (sales.length > 0) {
    const horodates = await transport.pousser(sales);
    await local.marquerSynchronises(horodates);
    for (const r of horodates) if (r.majLe > maxBorne) maxBorne = r.majLe;
  }

  // ── Pull : application LWW des enregistrements distants strictement plus récents ──
  let appliques = 0;
  for (const d of distants) {
    const majLocal = await local.majLeLocal(d.entite, d.cle);
    if (majLocal === null || d.majLe > majLocal) {
      await local.appliquerDistant(d);
      appliques++;
    }
    if (d.majLe > maxBorne) maxBorne = d.majLe;
  }

  if (maxBorne !== borne) await etat.ecrireDerniereSync(maxBorne);

  return { statut: 'ok', pousses: sales.length, appliques };
}
