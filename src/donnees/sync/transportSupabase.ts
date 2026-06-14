import type { SupabaseClient } from '@supabase/supabase-js';
import { type CodecContenu, codecIdentite } from '../e2ee';
import type { EnregistrementSync, TransportSync } from './types';

// Côté distant de la sync : transport générique vers/depuis la table `enregistrements` (ADR-003).
// Même format de stockage que depotSupabase (web) → web et mobile écrivent/lisent les mêmes lignes.
// Aucune logique métier (ADR-002) ; l'isolation repose sur RLS `user_id = auth.uid()`.
//
// E2EE (Phase 3) : `codec` chiffre le `contenu` au push et le déchiffre au pull. Le SQLite local
// reste en clair (coffre de l'appareil) ; seul ce qui part au cloud est chiffré.

const TABLE = 'enregistrements';

export function creerTransportSupabase(
  client: SupabaseClient,
  userId: string,
  codec: CodecContenu = codecIdentite,
): TransportSync {
  return {
    async pousser(enrs) {
      if (enrs.length === 0) return [];
      const lignes = enrs.map((e) => ({
        user_id: userId,
        entite: e.entite,
        cle: e.cle,
        contenu: e.supprime ? null : codec.chiffrer(e.contenu),
        supprime: e.supprime,
      }));
      // Le serveur réhorodate `maj_le` (trigger) : on relit la valeur autoritaire pour aligner
      // l'horloge locale dessus.
      const { data, error } = await client
        .from(TABLE)
        .upsert(lignes, { onConflict: 'user_id,entite,cle' })
        .select('entite, cle, supprime, maj_le');
      if (error) throw error;
      return (data ?? []).map(
        (r): EnregistrementSync => ({
          entite: r.entite,
          cle: r.cle,
          contenu: null,
          supprime: r.supprime,
          majLe: r.maj_le,
        }),
      );
    },

    async recupererDepuis(borne) {
      const { data, error } = await client
        .from(TABLE)
        .select('entite, cle, contenu, supprime, maj_le')
        .gt('maj_le', borne)
        .order('maj_le', { ascending: true });
      if (error) throw error;
      return (data ?? []).map(
        (r): EnregistrementSync => ({
          entite: r.entite,
          cle: r.cle,
          contenu: codec.dechiffrer(r.contenu),
          supprime: r.supprime,
          majLe: r.maj_le,
        }),
      );
    },
  };
}
