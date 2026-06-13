-- REGISTRE.FORME — schéma Supabase (docs/07 §5).
-- À exécuter une fois dans le SQL Editor du projet Supabase (région UE).
-- Le serveur ne comprend jamais le contenu : aucune logique métier ici (ADR-002).
-- Toute la logique d'adaptation reste 100 % côté client.

-- Extension pour gen_random_uuid (présente par défaut sur Supabase).
create extension if not exists "pgcrypto";

-- ──────────────────────────────────────────────────────────────────────────────
-- Table unique, multi-tenant par user_id (ADR-003).
-- `contenu` est du jsonb au MVP (lisible/debuggable) ; il devient une enveloppe
-- chiffrée opaque en Phase 3 (E2EE) SANS changer ce schéma de transport.
-- ──────────────────────────────────────────────────────────────────────────────
create table if not exists public.enregistrements (
  user_id   uuid        not null references auth.users (id) on delete cascade,
  entite    text        not null,          -- 'journal_crohn' | 'seance_realisee' | ...
  cle       text        not null,          -- PK métier : date AAAA-MM-JJ, id UUID, ou '1' (profil)
  contenu   jsonb,                          -- données brutes ; null si supprimé
  supprime  boolean     not null default false,
  maj_le    timestamptz not null default now(),
  primary key (user_id, entite, cle)
);

-- Index de pull incrémental (deltas par fenêtre temporelle).
create index if not exists enregistrements_maj_idx
  on public.enregistrements (user_id, maj_le);

-- ──────────────────────────────────────────────────────────────────────────────
-- maj_le toujours posé côté serveur (garde-fou anti-horloge-client faussée).
-- ──────────────────────────────────────────────────────────────────────────────
create or replace function public.touch_maj_le() returns trigger
  language plpgsql as $$
begin
  new.maj_le := now();
  return new;
end $$;

drop trigger if exists trg_touch_maj_le on public.enregistrements;
create trigger trg_touch_maj_le
  before insert or update on public.enregistrements
  for each row execute function public.touch_maj_le();

-- ──────────────────────────────────────────────────────────────────────────────
-- Row Level Security — le pilier de sécurité (docs/07 §5.2).
-- La clé `anon` est publique (embarquée dans le bundle web) : TOUTE l'isolation
-- repose sur ces policies. Une policy ratée = données ouvertes. Tester (§10.3).
-- ──────────────────────────────────────────────────────────────────────────────
alter table public.enregistrements enable row level security;

drop policy if exists "proprietaire_select" on public.enregistrements;
create policy "proprietaire_select" on public.enregistrements
  for select using (user_id = auth.uid());

drop policy if exists "proprietaire_insert" on public.enregistrements;
create policy "proprietaire_insert" on public.enregistrements
  for insert with check (user_id = auth.uid());

drop policy if exists "proprietaire_update" on public.enregistrements;
create policy "proprietaire_update" on public.enregistrements
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "proprietaire_delete" on public.enregistrements;
create policy "proprietaire_delete" on public.enregistrements
  for delete using (user_id = auth.uid());
