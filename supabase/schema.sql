-- ============================================================
-- BOW in Tanzania — volledig database schema
-- Voer dit uit in de Supabase SQL Editor (Nieuw project -> SQL Editor)
-- ============================================================

create extension if not exists "pgcrypto";

-- ---------- helper: updated_at trigger ----------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============================================================
-- TABELLEN
-- ============================================================

-- ---------- teams ----------
create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  password text not null,
  color text,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- zones ----------
create table if not exists public.zones (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  picture text,
  icon text not null default '📍',
  order_index integer not null default 0,
  unlock_type text not null default 'password'
    check (unlock_type in ('password', 'automatic_after_completion', 'open')),
  unlock_password text,
  automatic_unlock boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- challenges ----------
create table if not exists public.challenges (
  id uuid primary key default gen_random_uuid(),
  zone_id uuid not null references public.zones(id) on delete cascade,
  title text not null,
  description text,
  image_url text,
  challenge_type text not null default 'text_answer'
    check (challenge_type in ('text_answer', 'numeric_answer', 'photo_upload', 'multiple_choice')),
  options jsonb not null default '[]'::jsonb,   -- ["Optie A", "Optie B", ...] (2-10)
  correct_answer text,                          -- optioneel, voor multiple_choice / numeric
  points integer not null default 10,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists challenges_zone_idx on public.challenges(zone_id);

-- ---------- answers (tekst / numeriek) ----------
create table if not exists public.answers (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  zone_id uuid not null references public.zones(id) on delete cascade,
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  answer text not null,
  points_awarded integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (team_id, challenge_id)
);
create index if not exists answers_team_idx on public.answers(team_id);

-- ---------- quiz_answers (multiple choice) ----------
create table if not exists public.quiz_answers (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  zone_id uuid not null references public.zones(id) on delete cascade,
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  selected_option text not null,
  is_correct boolean,
  points_awarded integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (team_id, challenge_id)
);
create index if not exists quiz_answers_team_idx on public.quiz_answers(team_id);

-- ---------- photos ----------
create table if not exists public.photos (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  zone_id uuid not null references public.zones(id) on delete cascade,
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  photo_url text not null,
  storage_path text,
  points_awarded integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists photos_team_idx on public.photos(team_id);

-- ---------- scores ----------
create table if not exists public.scores (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null unique references public.teams(id) on delete cascade,
  points integer not null default 0,
  last_scored_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- team_progress (zone unlock status per team) ----------
create table if not exists public.team_progress (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  zone_id uuid not null references public.zones(id) on delete cascade,
  unlocked boolean not null default false,
  unlocked_at timestamptz,
  completed boolean not null default false,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (team_id, zone_id)
);

-- ---------- game_settings (key/value) ----------
create table if not exists public.game_settings (
  key text primary key,
  value text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- admin_settings (key/value, o.a. admin_password) ----------
create table if not exists public.admin_settings (
  key text primary key,
  value text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- point_actions (knoppen in admin) ----------
create table if not exists public.point_actions (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  points integer not null,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- TRIGGERS updated_at
-- ============================================================
do $$
declare t text;
begin
  foreach t in array array[
    'teams','zones','challenges','answers','quiz_answers','photos','scores',
    'team_progress','game_settings','admin_settings','point_actions'
  ] loop
    execute format('drop trigger if exists set_updated_at on public.%I;', t);
    execute format(
      'create trigger set_updated_at before update on public.%I
       for each row execute function public.set_updated_at();', t);
  end loop;
end $$;

-- ============================================================
-- RPC: punten toekennen / aftrekken (atomair)
-- ============================================================
create or replace function public.add_points(p_team_id uuid, p_points integer)
returns public.scores
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.scores;
begin
  insert into public.scores (team_id, points, last_scored_at)
  values (p_team_id, p_points, now())
  on conflict (team_id) do update
    set points = public.scores.points + p_points,
        last_scored_at = case when p_points > 0 then now() else public.scores.last_scored_at end,
        updated_at = now()
  returning * into result;
  return result;
end;
$$;

-- ============================================================
-- GRANTS (verplicht voor de Data API)
-- ============================================================
grant usage on schema public to anon, authenticated;

grant select, insert, update, delete on
  public.teams, public.zones, public.challenges, public.answers, public.quiz_answers,
  public.photos, public.scores, public.team_progress, public.game_settings,
  public.admin_settings, public.point_actions
to anon, authenticated;

grant all on
  public.teams, public.zones, public.challenges, public.answers, public.quiz_answers,
  public.photos, public.scores, public.team_progress, public.game_settings,
  public.admin_settings, public.point_actions
to service_role;

grant execute on function public.add_points(uuid, integer) to anon, authenticated, service_role;

-- ============================================================
-- ROW LEVEL SECURITY
-- Dit is een gesloten teambuilding-event zonder Supabase Auth:
-- de app werkt volledig met de anon key. Daarom open policies.
-- ============================================================
do $$
declare t text;
begin
  foreach t in array array[
    'teams','zones','challenges','answers','quiz_answers','photos','scores',
    'team_progress','game_settings','admin_settings','point_actions'
  ] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists "event access" on public.%I;', t);
    execute format(
      'create policy "event access" on public.%I for all to anon, authenticated
       using (true) with check (true);', t);
  end loop;
end $$;

-- ============================================================
-- REALTIME (live scorebord)
-- ============================================================
do $$
begin
  begin
    alter publication supabase_realtime add table public.scores;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.team_progress;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.photos;
  exception when duplicate_object then null;
  end;
end $$;

-- ============================================================
-- STORAGE POLICIES voor bucket 'photos'
-- (Maak de bucket eerst aan via Storage -> New bucket -> naam: photos, Public)
-- ============================================================
do $$
begin
  begin
    create policy "photos public read" on storage.objects
      for select to anon, authenticated using (bucket_id = 'photos');
  exception when duplicate_object then null;
  end;
  begin
    create policy "photos upload" on storage.objects
      for insert to anon, authenticated with check (bucket_id = 'photos');
  exception when duplicate_object then null;
  end;
  begin
    create policy "photos delete" on storage.objects
      for delete to anon, authenticated using (bucket_id = 'photos');
  exception when duplicate_object then null;
  end;
end $$;
