import type { SupabaseClient } from '@supabase/supabase-js';
import type { CodecContenu, MetaE2EE } from './e2ee';

// Accès cloud aux métadonnées E2EE et migration des contenus déjà en clair (docs/07 §7.3, Phase 3).
// La meta vit dans la même table `enregistrements` (entité dédiée `e2ee`, hors périmètre de sync :
// le SyncManager mobile ignore les entités inconnues, cf. registreSync.ts). Stockée en clair :
// ni le sel ni le canari ne sont secrets. Aucune logique métier (ADR-002).

const TABLE = 'enregistrements';
/** Entité réservée aux métadonnées E2EE (jamais une donnée santé). */
export const ENTITE_META_E2EE = 'e2ee';
const CLE_META = 'meta';

/** Lit la MetaE2EE du compte, ou `null` si l'E2EE n'a jamais été activé. */
export async function lireMetaE2EE(
  client: SupabaseClient,
  _userId: string,
): Promise<MetaE2EE | null> {
  const { data, error } = await client
    .from(TABLE)
    .select('contenu')
    .eq('entite', ENTITE_META_E2EE)
    .eq('cle', CLE_META)
    .eq('supprime', false)
    .maybeSingle();
  if (error) throw error;
  return (data?.contenu as MetaE2EE | undefined) ?? null;
}

/** Écrit (ou remplace) la MetaE2EE du compte. */
export async function ecrireMetaE2EE(
  client: SupabaseClient,
  userId: string,
  meta: MetaE2EE,
): Promise<void> {
  const { error } = await client
    .from(TABLE)
    .upsert(
      { user_id: userId, entite: ENTITE_META_E2EE, cle: CLE_META, contenu: meta, supprime: false },
      { onConflict: 'user_id,entite,cle' },
    );
  if (error) throw error;
}

/**
 * Migration à l'activation : re-écrit tous les enregistrements existants à travers le codec
 * (clair → chiffré). Idempotent (codec.dechiffrer est un passe-plat sur du clair). La meta E2EE
 * elle-même est exclue. Renvoie le nombre de lignes ré-écrites.
 */
export async function rechiffrerTout(
  client: SupabaseClient,
  userId: string,
  codec: CodecContenu,
): Promise<number> {
  const { data, error } = await client
    .from(TABLE)
    .select('entite, cle, contenu')
    .eq('supprime', false)
    .neq('entite', ENTITE_META_E2EE);
  if (error) throw error;

  const lignes = (data ?? [])
    .filter((r) => r.contenu !== null)
    .map((r) => ({
      user_id: userId,
      entite: r.entite as string,
      cle: r.cle as string,
      contenu: codec.chiffrer(codec.dechiffrer(r.contenu)),
      supprime: false,
    }));
  if (lignes.length === 0) return 0;

  const { error: erreurUpsert } = await client
    .from(TABLE)
    .upsert(lignes, { onConflict: 'user_id,entite,cle' });
  if (erreurUpsert) throw erreurUpsert;
  return lignes.length;
}
