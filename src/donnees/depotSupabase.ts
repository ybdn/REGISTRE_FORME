import { genererProgramme } from '@/domaine/generateurSemaines';
import type {
  Adaptation,
  ConsommationJour,
  EntreeJournal,
  HydratationJour,
  SeanceRealisee,
  SourceSeance,
  StatutAlimentManuel,
} from '@/domaine/types';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Depot } from './depot';
import type { MesureCorporelle, SeancePlanifieeStockee } from './depots';
import { type CodecContenu, codecIdentite } from './e2ee';
import type { Profil } from './profil';

// Implémentation Supabase (web online) de l'interface `Depot` (docs/07 §4-5).
// Stockage générique : 1 table `enregistrements(user_id, entite, cle, contenu jsonb, supprime, maj_le)`.
// Le contenu est l'objet domaine brut (camelCase) — round-trip direct, aucune conversion.
// Aucune logique métier : le moteur recalcule tout l'état dérivé côté client (ADR-002).
//
// E2EE (Phase 3) : `codec` chiffre le `contenu` avant écriture et le déchiffre après lecture.
// Par défaut neutre (clair) ; chiffrant quand l'E2EE est déverrouillé (cf. coffreE2EE.ts).

const TABLE = 'enregistrements';

/** Adaptation telle que stockée (les colonnes annulee/dateCreation vivent dans le contenu). */
interface AdaptationStockee extends Adaptation {
  id: string;
  dateCreation: string;
  annulee: boolean;
}

export function creerDepotSupabase(
  client: SupabaseClient,
  userId: string,
  codec: CodecContenu = codecIdentite,
): Depot {
  /** Lit tous les contenus non supprimés d'une entité (filtre serveur optionnel sur la clé). */
  async function lireContenus<T>(entite: string, cleDepuis?: string): Promise<T[]> {
    let q = client.from(TABLE).select('cle, contenu').eq('entite', entite).eq('supprime', false);
    if (cleDepuis !== undefined) q = q.gte('cle', cleDepuis);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []).map((r) => codec.dechiffrer(r.contenu) as T);
  }

  async function ecrire(entite: string, cle: string, contenu: unknown): Promise<void> {
    const { error } = await client
      .from(TABLE)
      .upsert(
        { user_id: userId, entite, cle, contenu: codec.chiffrer(contenu), supprime: false },
        { onConflict: 'user_id,entite,cle' },
      );
    if (error) throw error;
  }

  /** Suppression logique (tombstone) : la sync redescend l'effacement sur les autres appareils. */
  async function supprimer(entite: string, cle: string): Promise<void> {
    const { error } = await client
      .from(TABLE)
      .upsert(
        { user_id: userId, entite, cle, contenu: null, supprime: true },
        { onConflict: 'user_id,entite,cle' },
      );
    if (error) throw error;
  }

  return {
    async programmeDejaSeede() {
      const { count, error } = await client
        .from(TABLE)
        .select('*', { count: 'exact', head: true })
        .eq('entite', 'seance_planifiee')
        .eq('supprime', false);
      if (error) throw error;
      return (count ?? 0) > 0;
    },
    async seederProgramme() {
      const { count } = await client
        .from(TABLE)
        .select('*', { count: 'exact', head: true })
        .eq('entite', 'seance_planifiee')
        .eq('supprime', false);
      if ((count ?? 0) > 0) return;
      const lignes = genererProgramme().flatMap((semaine) =>
        semaine.seances.map((s, index) => {
          const planifiee: SeancePlanifieeStockee = {
            id: `S${semaine.numero}-${index}`,
            semaine: semaine.numero,
            phase: semaine.phase,
            jour: s.jour,
            type: s.type,
            modele: s.modele,
            titre: s.titre,
            estDecharge: semaine.estDecharge,
            estTestChrono: semaine.estTestChrono,
          };
          return {
            user_id: userId,
            entite: 'seance_planifiee',
            cle: planifiee.id,
            contenu: codec.chiffrer(planifiee),
            supprime: false,
          };
        }),
      );
      const { error } = await client
        .from(TABLE)
        .upsert(lignes, { onConflict: 'user_id,entite,cle' });
      if (error) throw error;
    },

    async lireProfil() {
      const { data, error } = await client
        .from(TABLE)
        .select('contenu')
        .eq('entite', 'profil')
        .eq('cle', '1')
        .eq('supprime', false)
        .maybeSingle();
      if (error) throw error;
      return data?.contenu == null ? null : (codec.dechiffrer(data.contenu) as Profil);
    },
    enregistrerProfil: (p) => ecrire('profil', '1', p),

    lireJournal: (depuis) => lireContenus<EntreeJournal>('journal_crohn', depuis),
    enregistrerJournal: (e) => ecrire('journal_crohn', e.date, e),

    async lireSeances(depuis) {
      // cle = id (pas la date) → filtrage par date côté client sur le contenu.
      const seances = await lireContenus<SeanceRealisee>('seance_realisee');
      const filtrees = depuis ? seances.filter((s) => s.date >= depuis) : seances;
      return filtrees.sort((a, b) => a.date.localeCompare(b.date));
    },
    enregistrerSeance: (s) => ecrire('seance_realisee', s.id, s),
    async lireIdsExternes(source: SourceSeance) {
      const seances = await lireContenus<SeanceRealisee>('seance_realisee');
      return seances
        .filter((s) => s.source === source && s.idExterne)
        .map((s) => s.idExterne as string);
    },

    lireMesures: (depuis) => lireContenus<MesureCorporelle>('mesure_corporelle', depuis),
    enregistrerMesure: (m) => ecrire('mesure_corporelle', m.date, m),

    lireConsommations: (depuis) => lireContenus<ConsommationJour>('consommation_jour', depuis),
    enregistrerConsommation: (c) => ecrire('consommation_jour', c.date, c),
    async lireStatutsAliments() {
      const statuts = await lireContenus<StatutAlimentManuel>('aliment_statut');
      return statuts.sort((a, b) => a.aliment.localeCompare(b.aliment));
    },
    definirStatutAliment: (s) => ecrire('aliment_statut', s.aliment, s),
    supprimerStatutAliment: (aliment) => supprimer('aliment_statut', aliment),

    lireHydratations: (depuis) => lireContenus<HydratationJour>('hydratation_jour', depuis),
    enregistrerHydratation: (h) => ecrire('hydratation_jour', h.date, h),

    async lireSeancesPlanifieesSemaine(semaine) {
      const planifiees = await lireContenus<SeancePlanifieeStockee>('seance_planifiee');
      return planifiees.filter((p) => p.semaine === semaine).sort((a, b) => a.jour - b.jour);
    },

    async enregistrerAdaptation(a, id, dateCreation) {
      const stockee: AdaptationStockee = { ...a, id, dateCreation, annulee: false };
      await ecrire('adaptation', id, stockee);
    },
    async annulerAdaptation(id) {
      const { data, error } = await client
        .from(TABLE)
        .select('contenu')
        .eq('entite', 'adaptation')
        .eq('cle', id)
        .maybeSingle();
      if (error) throw error;
      if (!data?.contenu) return;
      const courante = codec.dechiffrer(data.contenu) as AdaptationStockee;
      await ecrire('adaptation', id, { ...courante, annulee: true });
    },
    async lireAdaptationsAppliquees(depuis) {
      const adaptations = await lireContenus<AdaptationStockee>('adaptation');
      return adaptations
        .filter((a) => !a.annulee && a.type !== 'aucune' && a.date >= depuis)
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((a) => ({ date: a.date, raison: a.raison }));
    },

    async instantanerToutesLesTables() {
      // La sauvegarde fichier chiffrée est un chemin mobile (SQLite). Sur web, la donnée
      // est déjà protégée par la sync cloud → cf. sauvegarde.web.ts.
      throw new Error(
        'Sauvegarde fichier indisponible sur web (la sync cloud protège déjà les données).',
      );
    },
    async remplacerToutesLesTables() {
      throw new Error('Restauration fichier indisponible sur web.');
    },
  };
}
