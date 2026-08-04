-- ============================================================
-- BOW in Tanzania — VOLLEDIG DATABASE SCHEMA (v2)
--
-- Dit is het enige schemabestand. Voer het uit in de Supabase SQL Editor
-- en daarna supabase/seed.sql voor voorbeelddata.
--
-- LET OP: dit bestand verwijdert de tabellen van de app en maakt ze opnieuw
-- aan. Alle bestaande spelgegevens verdwijnen. Dat is bewust: tijdens het
-- bouwen mag je dit bestand zo vaak opnieuw uitvoeren als je wil.
-- ============================================================

create extension if not exists "pgcrypto";

-- ============================================================
-- SCHONE START
-- ============================================================
drop function if exists public.full_game_reset() cascade;
drop function if exists public.delete_all_teams() cascade;
drop function if exists public.delete_all_notifications() cascade;
drop function if exists public.add_points(uuid, integer) cascade;
drop function if exists public.add_points(uuid, integer, text) cascade;

drop table if exists public.location_challenge_states cascade;
drop table if exists public.location_event_triggers cascade;
drop table if exists public.team_tracking_devices cascade;
drop table if exists public.team_locations cascade;
drop table if exists public.notification_reads cascade;
drop table if exists public.notifications cascade;
drop table if exists public.zone_completion_notices cascade;
drop table if exists public.zone_first_unlocks cascade;
drop table if exists public.team_progress cascade;
drop table if exists public.scores cascade;
drop table if exists public.photos cascade;
drop table if exists public.quiz_answers cascade;
drop table if exists public.answers cascade;
drop table if exists public.challenges cascade;
drop table if exists public.location_events cascade;
drop table if exists public.zones cascade;
drop table if exists public.teams cascade;
drop table if exists public.point_actions cascade;
drop table if exists public.admin_settings cascade;
drop table if exists public.game_settings cascade;

-- ---------- helper: updated_at ----------
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
-- INSTELLINGEN
-- ============================================================
create table public.game_settings (
  key text primary key,
  value text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.admin_settings (
  key text primary key,
  value text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.point_actions (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  points integer not null,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- TEAMS & ZONES
-- ============================================================
create table public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  password text not null,
  color text,
  sort_order integer not null default 0,
  active boolean not null default true,
  group_photo_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.zones (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  tagline text,
  picture text,
  icon text not null default '📍',
  order_index integer not null default 0,
  unlock_type text not null default 'password'
    check (unlock_type in ('password', 'automatic_after_completion', 'open')),
  -- Leeg wachtwoord = zone opent automatisch zodra de vorige zone klaar is.
  unlock_password text,
  automatic_unlock boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- LOCATIE-EVENTS (enkel trigger + melding; nooit opdrachtvelden)
-- ============================================================
create table public.location_events (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  latitude double precision not null,
  longitude double precision not null,
  radius_meters integer not null default 75,
  -- 'every' = één keer per team, 'first' = enkel het eerste team
  trigger_mode text not null default 'every' check (trigger_mode in ('every', 'first')),
  -- wie krijgt de melding
  notification_target text not null default 'team'
    check (notification_target in ('team', 'admin', 'all')),
  notification_message text,
  -- null = geldt in alle zones; anders enkel voor teams in deze zone
  zone_id uuid references public.zones(id) on delete set null,
  active boolean not null default true,
  -- vaste volgorde binnen de zone (kolomvolgorde in de admin-matrix)
  order_index integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index location_events_order_idx on public.location_events(order_index);

-- ============================================================
-- OPDRACHTEN — één tabel voor gewone, bonus- en locatieopdrachten
-- ============================================================
create table public.challenges (
  id uuid primary key default gen_random_uuid(),
  -- null bij bonus- en locatieopdrachten
  zone_id uuid references public.zones(id) on delete cascade,
  title text not null,
  description text,
  image_url text,
  challenge_type text not null default 'text_answer'
    check (challenge_type in (
      'text_answer', 'numeric_answer', 'photo_upload',
      'multiple_choice', 'bonus_photo_upload')),
  options jsonb not null default '[]'::jsonb,
  correct_answer text,
  points integer not null default 10,
  -- > 0 → de reisleider kan ⭐ Uitstekend geven met deze extra punten
  creativity_bonus_points integer not null default 0,
  sort_order integer not null default 0,
  active boolean not null default true,

  -- bonusopdracht
  is_bonus boolean not null default false,
  notification_message text,
  duration_minutes integer not null default 15,
  bonus_active boolean not null default false,
  bonus_started_at timestamptz,

  -- locatieopdracht: strikt één-op-één met een locatie-event
  is_location boolean not null default false,
  location_event_id uuid unique references public.location_events(id) on delete set null,

  -- eigen bericht dat na het nakijken naar het team gaat i.p.v. de standaardmelding
  approval_message text default null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index challenges_zone_idx on public.challenges(zone_id);
create index challenges_bonus_idx on public.challenges(is_bonus);
create index challenges_location_idx on public.challenges(is_location);

-- ============================================================
-- INZENDINGEN
-- ============================================================
create table public.answers (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  zone_id uuid references public.zones(id) on delete cascade,
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  answer text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  points_awarded integer not null default 0,
  creativity_points integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (team_id, challenge_id)
);
create index answers_team_idx on public.answers(team_id);

create table public.quiz_answers (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  zone_id uuid references public.zones(id) on delete cascade,
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  selected_option text not null,
  is_correct boolean,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  points_awarded integer not null default 0,
  creativity_points integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (team_id, challenge_id)
);
create index quiz_answers_team_idx on public.quiz_answers(team_id);

create table public.photos (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  zone_id uuid references public.zones(id) on delete cascade,
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  photo_url text not null,
  storage_path text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  points_awarded integer not null default 0,
  creativity_points integer not null default 0,
  is_group_photo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index photos_team_idx on public.photos(team_id);

-- ============================================================
-- SCORES & VOORTGANG
-- ============================================================
create table public.scores (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null unique references public.teams(id) on delete cascade,
  points integer not null default 0,            -- totaal = som van de drie
  regular_points integer not null default 0,
  bonus_points integer not null default 0,
  creativity_points integer not null default 0,
  last_scored_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.team_progress (
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

-- eerste team dat een zone bereikt (voor de prestatiemelding)
create table public.zone_first_unlocks (
  id uuid primary key default gen_random_uuid(),
  zone_id uuid not null unique references public.zones(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- "zone afgerond"-bericht met de code van de volgende zone: één per team/zone
create table public.zone_completion_notices (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  zone_id uuid not null references public.zones(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (team_id, zone_id)
);

-- ============================================================
-- MELDINGEN
-- ============================================================
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text,
  audience text not null default 'all' check (audience in ('all', 'team', 'admin')),
  team_id uuid references public.teams(id) on delete cascade,
  kind text not null default 'info',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index notifications_created_idx on public.notifications(created_at desc);

-- reader = team-id of 'admin'
create table public.notification_reads (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.notifications(id) on delete cascade,
  reader text not null,
  read_at timestamptz not null default now(),
  unique (notification_id, reader)
);

-- ============================================================
-- LOCATIE: posities, triggers, opdrachtstatus, trackingtoestel
-- ============================================================
create table public.team_locations (
  team_id uuid primary key references public.teams(id) on delete cascade,
  latitude double precision not null,
  longitude double precision not null,
  accuracy double precision,
  updated_at timestamptz not null default now()
);

create table public.location_event_triggers (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.location_events(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  is_first boolean not null default false,
  created_at timestamptz not null default now(),
  unique (event_id, team_id)
);
-- 'first'-events vuren maximaal één keer in totaal
create unique index location_event_triggers_first_idx
  on public.location_event_triggers(event_id) where is_first;

-- per team: staat de locatieopdracht open, is ze ingezonden of afgewezen?
create table public.location_challenge_states (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  state text not null default 'open' check (state in ('open', 'submitted', 'dismissed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (team_id, challenge_id)
);
create index location_challenge_states_team_idx on public.location_challenge_states(team_id);

-- exact één toestel per team stuurt gps-updates
create table public.team_tracking_devices (
  team_id uuid primary key references public.teams(id) on delete cascade,
  device_id text not null,
  claimed_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- TRIGGERS updated_at
-- ============================================================
do $$
declare t text;
begin
  foreach t in array array[
    'game_settings','admin_settings','point_actions','teams','zones','location_events',
    'challenges','answers','quiz_answers','photos','scores','team_progress',
    'notifications','location_challenge_states','team_tracking_devices'
  ] loop
    execute format('drop trigger if exists set_updated_at on public.%I;', t);
    execute format(
      'create trigger set_updated_at before update on public.%I
       for each row execute function public.set_updated_at();', t);
  end loop;
end $$;

-- ============================================================
-- RPC: punten toekennen per categorie (atomair)
-- ============================================================
create or replace function public.add_points(p_team_id uuid, p_points integer, p_kind text default 'regular')
returns public.scores
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.scores;
  d_regular integer := case when p_kind = 'regular' then p_points else 0 end;
  d_bonus integer := case when p_kind = 'bonus' then p_points else 0 end;
  d_creativity integer := case when p_kind = 'creativity' then p_points else 0 end;
begin
  insert into public.scores (team_id, points, regular_points, bonus_points, creativity_points, last_scored_at)
  values (p_team_id, p_points, d_regular, d_bonus, d_creativity, now())
  on conflict (team_id) do update
    set points = public.scores.points + p_points,
        regular_points = public.scores.regular_points + d_regular,
        bonus_points = public.scores.bonus_points + d_bonus,
        creativity_points = public.scores.creativity_points + d_creativity,
        last_scored_at = case when p_points > 0 then now() else public.scores.last_scored_at end,
        updated_at = now()
  returning * into result;
  return result;
end;
$$;

-- ============================================================
-- RPC: alle meldingen wissen
-- ============================================================
    create or replace function public.delete_all_notifications()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.notification_reads
  where id is not null;

  delete from public.notifications
  where id is not null;
end;
$$;

-- ============================================================
-- RPC: "Terug naar de start"
--
-- Wist enkel de geschiedenis. Behoudt teams, zones, alle opdrachten
-- (ook locatieopdrachten), locatie-events en instellingen.
-- Bonusopdrachten worden uitgezet (active = false), niet verwijderd.
-- Bestanden in Storage ruimt de app zelf op vóór deze call.
-- ============================================================
create or replace function public.full_game_reset()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.notification_reads
  where id is not null;
  delete from public.notifications
  where id is not null;
  delete from public.answers
  where id is not null;
  delete from public.quiz_answers
  where id is not null;
  delete from public.photos
  where id is not null;
  delete from public.location_challenge_states
  where id is not null;
  delete from public.location_event_triggers
  where id is not null;
  delete from public.team_tracking_devices
  where team_id is not null;
  delete from public.team_locations
  where team_id is not null;
  delete from public.zone_completion_notices
  where id is not null;
  delete from public.zone_first_unlocks
  where id is not null;
  delete from public.team_progress
  where id is not null;

  update public.scores
     set points = 0, regular_points = 0, bonus_points = 0, creativity_points = 0,
         last_scored_at = now(), updated_at = now()
    where team_id is not null;;

  update public.teams set group_photo_url = null where group_photo_url is not null;

  -- bonusopdrachten uit (niet verwijderd), timers gewist
  update public.challenges
     set bonus_active = false, bonus_started_at = null,
         active = case when is_bonus then false else active end
   where is_bonus or bonus_active or bonus_started_at is not null;

  -- eerste zone weer open voor elk team
  insert into public.team_progress (team_id, zone_id, unlocked, unlocked_at)
  select t.id, z.id, true, now()
  from public.teams t
  cross join (
    select id from public.zones where active order by order_index limit 1
  ) z
  on conflict (team_id, zone_id) do update
    set unlocked = true, unlocked_at = now();

  insert into public.notifications (
    title,
    body,
    audience,
    kind
  )
  values (
    'Mambo -> Poa',
    '👋🏾 Zo gaat een begroeting er hier aan toe in Tanzania. Veel plezier op reis, hier zal je regelmatig updates krijgen van mij. Bij problemen stuur je maar iets op Whatsapp!' , 'all',
    'info'
  );
end;
$$;

-- ============================================================
-- RPC: alle teams verwijderen (inclusief alles wat eraan hangt)
-- ============================================================
create or replace function public.delete_all_teams()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.notification_reads
  where id is not null;
  delete from public.notifications
  where id is not null;
  delete from public.teams  -- cascade ruimt de rest op
  where id is not null;
end;
$$;

-- ============================================================
-- GRANTS (verplicht voor de Data API)
-- ============================================================
grant usage on schema public to anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array[
    'game_settings','admin_settings','point_actions','teams','zones','location_events',
    'challenges','answers','quiz_answers','photos','scores','team_progress',
    'zone_first_unlocks','zone_completion_notices','notifications','notification_reads',
    'team_locations','location_event_triggers','location_challenge_states','team_tracking_devices'
  ] loop
    execute format('grant select, insert, update, delete on public.%I to anon, authenticated;', t);
    execute format('grant all on public.%I to service_role;', t);
  end loop;
end $$;

grant execute on function public.add_points(uuid, integer, text) to anon, authenticated, service_role;
grant execute on function public.delete_all_notifications() to anon, authenticated, service_role;
grant execute on function public.full_game_reset() to anon, authenticated, service_role;
grant execute on function public.delete_all_teams() to anon, authenticated, service_role;

-- ============================================================
-- ROW LEVEL SECURITY
-- Gesloten teambuilding-event zonder Supabase Auth: de app werkt volledig
-- met de anon key. Daarom één open "event access"-policy per tabel.
-- ============================================================
do $$
declare t text;
begin
  foreach t in array array[
    'game_settings','admin_settings','point_actions','teams','zones','location_events',
    'challenges','answers','quiz_answers','photos','scores','team_progress',
    'zone_first_unlocks','zone_completion_notices','notifications','notification_reads',
    'team_locations','location_event_triggers','location_challenge_states','team_tracking_devices'
  ] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists "event access" on public.%I;', t);
    execute format(
      'create policy "event access" on public.%I for all to anon, authenticated
       using (true) with check (true);', t);
  end loop;
end $$;

-- ============================================================
-- REALTIME (live scorebord, kaart en locatieopdrachten)
-- ============================================================
do $$
declare t text;
begin
  foreach t in array array[
    'scores','team_progress','photos','answers','quiz_answers',
    'notifications','challenges','team_locations','location_challenge_states'
  ] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I;', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;

-- ============================================================
-- STORAGE: bucket 'photos'
-- Maak de bucket eerst aan via Storage -> New bucket -> naam: photos, Public.
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
