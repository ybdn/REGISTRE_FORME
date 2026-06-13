import { sessionActuelle } from './auth';
import type { Depot } from './depot';
import { creerDepotSupabase } from './depotSupabase';
import { obtenirSupabase } from './supabaseClient';

// Sélection web (docs/07 §4.3) : dépôt Supabase online. Résolu par Metro à la place de
// fabriqueDepot.ts sur la plateforme web. Requiert une session active (la garde de
// connexion du _layout n'initialise le store qu'une fois authentifié).

export async function creerDepotParDefaut(): Promise<Depot> {
  const session = await sessionActuelle();
  if (!session) throw new Error('Connexion requise avant d’initialiser le dépôt.');
  return creerDepotSupabase(obtenirSupabase(), session.user.id);
}
