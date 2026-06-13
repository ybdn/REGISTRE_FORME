import type { Session } from '@supabase/supabase-js';
import { obtenirSupabase } from './supabaseClient';

// Authentification e-mail + mot de passe, compte unique (ADR-004). Inscriptions fermées :
// le compte est créé à la main dans le dashboard Supabase. Aucune logique métier ici.

export interface Identifiants {
  email: string;
  motDePasse: string;
}

/** Connexion. Lève une erreur (message GoTrue) en cas d'échec. */
export async function seConnecter({ email, motDePasse }: Identifiants): Promise<Session> {
  const { data, error } = await obtenirSupabase().auth.signInWithPassword({
    email,
    password: motDePasse,
  });
  if (error) throw error;
  if (!data.session) throw new Error('Connexion sans session active.');
  return data.session;
}

export async function seDeconnecter(): Promise<void> {
  const { error } = await obtenirSupabase().auth.signOut();
  if (error) throw error;
}

/** Session courante (restaurée du stockage), ou `null` si déconnecté. */
export async function sessionActuelle(): Promise<Session | null> {
  const { data } = await obtenirSupabase().auth.getSession();
  return data.session;
}

/** S'abonne aux changements d'état d'auth (connexion/déconnexion/refresh). */
export function surChangementAuth(callback: (session: Session | null) => void): () => void {
  const { data } = obtenirSupabase().auth.onAuthStateChange((_event, session) => {
    callback(session);
  });
  return () => data.subscription.unsubscribe();
}
