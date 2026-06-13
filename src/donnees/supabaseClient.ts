import { type SupabaseClient, createClient } from '@supabase/supabase-js';

// Client Supabase (auth + stockage + transport uniquement, ADR-002).
// Les clés EXPO_PUBLIC_* sont publiques par conception : l'isolation repose sur RLS.
// Sur web, la session est persistée dans localStorage ; ailleurs (rendu hors navigateur),
// on retombe sur un stockage mémoire pour que l'import reste sûr (jamais de crash).

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

/** Vrai si les variables d'environnement Supabase sont présentes (sinon : mode 100 % local). */
export const supabaseConfigure = Boolean(url && anonKey);

function stockageSession() {
  if (typeof window !== 'undefined' && window.localStorage) return window.localStorage;
  // Repli mémoire : implémente l'API Storage minimale attendue par supabase-js.
  const memoire = new Map<string, string>();
  return {
    getItem: (k: string) => memoire.get(k) ?? null,
    setItem: (k: string, v: string) => void memoire.set(k, v),
    removeItem: (k: string) => void memoire.delete(k),
  };
}

// Singleton paresseux : `null` si non configuré (l'app reste utilisable hors-ligne).
let client: SupabaseClient | null = null;

export function obtenirSupabase(): SupabaseClient {
  if (!supabaseConfigure) {
    throw new Error(
      'Supabase non configuré : renseigner EXPO_PUBLIC_SUPABASE_URL et EXPO_PUBLIC_SUPABASE_ANON_KEY (cf. .env.example).',
    );
  }
  if (!client) {
    client = createClient(url as string, anonKey as string, {
      auth: {
        storage: stockageSession(),
        persistSession: true,
        autoRefreshToken: true,
        // Pas de flux OAuth/magic-link : connexion e-mail + mot de passe (ADR-004).
        detectSessionInUrl: false,
      },
    });
  }
  return client;
}
