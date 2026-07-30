-- ============================================================
-- BOW in Tanzania — UPGRADE 3
-- Puntenopsplitsing (gewoon / bonus / creativiteit), creativiteitsbonus,
-- teamfoto, locatietracking, locatie-events & locatieopdrachten,
-- en een volledige spelreset.
-- Voer dit uit in de Supabase SQL Editor van je eigen project.
-- Veilig om meerdere keren uit te voeren.
-- ============================================================

-- ============================================================
-- 1. PUNTENOPSPLITSING
-- ============================================================
alter table public.scores
  add column if not exists regular_points    integer not null default 0,
  add column if not exists bonus_points      integer not null default 0,
  add column if not exists creativity_points integer not null default 0;

-- Bestaande totalen tellen als gewone punten
update public.scores
  set regular_points = points
  where regular_points = 0 and bonus_points = 0 and creativity_points = 0 and points <> 0;

-- Oude 2-argument-versie weg: we vervangen ze door een versie met soort.
drop function if exists public.add_points(uuid, integer);

/**
 * Kent punten toe aan een team in één van de drie categorieën.
 * p_kind: 'regular' | 'bonus' | 'creativity'
 * points blijft altijd het totaal van de drie categorieën.
 */
create or replace function public.add_points(
  p_team_id uuid,
  p_points integer,
  p_kind text default 'regular'
)
returns public.scores
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.scores;
  d_reg integer := case when p_kind = 'regular'    then p_points else 0 end;
  d_bon integer := case when p_kind = 'bonus'      then p_points else 0 end;
  d_cre integer := case when p_kind = 'creativity' then p_points else 0 end;
begin
  insert into public.scores (team_id, points, regular_points, bonus_points, creativity_points, last_scored_at)
  values (p_team_id, p_points, d_reg, d_bon, d_cre, now())
  on conflict (team_id) do update
    set regular_points    = public.scores.regular_points + d_reg,
        bonus_points      = public.scores.bonus_points + d_bon,
        creativity_points = public.scores.creativity_points + d_cre,
        points            = public.scores.regular_points + d_reg
                          + public.scores.bonus_points + d_bon
                          + public.scores.creativity_points + d_cre,
        last_scored_at    = case when p_points > 0 then now() else public.scores.last_scored_at end,
        updated_at        = now()
  returning * into result;
  return result;
end;
$$;

grant execute on function public.add_points(uuid, integer, text) to anon, authenticated, service_role;

-- ============================================================
-- 2. CREATIVITEITSBONUS OP OPDRACHTEN
-- ============================================================
alter table public.challenges
  add column if not exists creativity_bonus_points integer not null default 0;

alter table public.answers
  add column if not exists creativity_points integer not null default 0;
alter table public.quiz_answers
  add column if not exists creativity_points integer not null default 0;
alter table public.photos
  add column if not exists creativity_points integer not null default 0;

-- ============================================================
-- 3. TEAMFOTO
-- ============================================================
alter table public.teams
  add column if not exists group_photo_url text;

alter table public.photos
  add column if not exists is_group_photo boolean not null default false;

-- ============================================================
-- 4. LOCATIEOPDRACHTEN OP challenges
-- ============================================================
alter table public.challenges
  add column if not exists is_location boolean not null default false,
  add column if not exists target_team_id uuid references public.teams(id) on delete cascade,
  add column if not exists location_event_id uuid;

create index if not exists challenges_target_team_idx on public.challenges(target_team_id);

-- ============================================================
-- 5. TEAMLOCATIES (enkel de laatste positie, geen historiek)
-- ============================================================
create table if not exists public.team_locations (
  team_id    uuid primary key references public.teams(id) on delete cascade,
  latitude   double precision not null,
  longitude  double precision not null,
  accuracy   double precision,
  updated_at timestamptz not null default now()
);

-- ============================================================
-- 6. LOCATIE-EVENTS
-- ============================================================
create table if not exists public.location_events (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  latitude  double precision not null,
  longitude double precision not null,
  radius_meters integer not null default 50,
  -- 'every' = elk team één keer, 'first' = enkel het eerste team
  trigger_mode text not null default 'every' check (trigger_mode in ('every', 'first')),
  -- wat er gebeurt bij binnenkomst
  trigger_type text not null default 'team_notification'
    check (trigger_type in ('team_notification', 'admin_notification', 'global_notification', 'location_challenge')),
  notification_message text,
  challenge_title text,
  challenge_description text,
  challenge_type text not null default 'text_answer'
    check (challenge_type in ('text_answer', 'photo_upload')),
  points integer not null default 10,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- afgevuurde events ----------
create table if not exists public.location_event_triggers (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.location_events(id) on delete cascade,
  team_id  uuid not null references public.teams(id) on delete cascade,
  is_first boolean not null default false,
  created_at timestamptz not null default now(),
  unique (event_id, team_id)
);

-- Bij trigger_mode 'first' kan er maar één rij per event bestaan.
create unique index if not exists location_event_first_idx
  on public.location_event_triggers(event_id) where is_first;

drop trigger if exists set_updated_at on public.location_events;
create trigger set_updated_at before update on public.location_events
  for each row execute function public.set_updated_at();

-- ============================================================
-- 7. GRANTS + RLS
-- ============================================================
grant select, insert, update, delete on
  public.team_locations, public.location_events, public.location_event_triggers
to anon, authenticated;

grant all on
  public.team_locations, public.location_events, public.location_event_triggers
to service_role;

do $$
declare t text;
begin
  foreach t in array array['team_locations', 'location_events', 'location_event_triggers'] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists "event access" on public.%I;', t);
    execute format(
      'create policy "event access" on public.%I for all to anon, authenticated
       using (true) with check (true);', t);
  end loop;
end $$;

-- ============================================================
-- 8. REALTIME
-- ============================================================
do $$
begin
  begin alter publication supabase_realtime add table public.team_locations;
  exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.location_events;
  exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.location_event_triggers;
  exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.teams;
  exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.game_settings;
  exception when duplicate_object then null; end;
end $$;

-- ============================================================
-- 9. INSTELLINGEN (locatietracking + finalelocatie)
-- ============================================================
insert into public.game_settings (key, value) values
  ('location_tracking_enabled', 'false'),
  ('finale_latitude',  '-3.386925'),
  ('finale_longitude', '36.682995'),
  ('finale_label',     'Finale')
on conflict (key) do nothing;

-- ============================================================
-- 10. VOLLEDIGE SPELRESET
-- ============================================================
create or replace function public.full_game_reset()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.answers            where true;
  delete from public.quiz_answers       where true;
  delete from public.photos             where true;
  delete from public.notification_reads where true;
  delete from public.notifications      where true;
  delete from public.team_progress      where true;
  delete from public.zone_completion_notices where true;
  delete from public.zone_first_unlocks where true;
  delete from public.team_locations     where true;
  delete from public.location_event_triggers where true;

  -- door events aangemaakte locatieopdrachten verdwijnen mee
  delete from public.challenges where is_location = true;

  -- teamfoto's loskoppelen
  update public.teams set group_photo_url = null;

  -- bonusopdrachten terug in ruststand
  update public.challenges
    set bonus_active = false,
        bonus_started_at = null,
        active = false
    where is_bonus = true;

  -- scores op nul
  delete from public.scores where true;
  insert into public.scores (team_id, points, regular_points, bonus_points, creativity_points)
    select id, 0, 0, 0, 0 from public.teams;
end;
$$;

grant execute on function public.full_game_reset() to anon, authenticated, service_role;

-- ============================================================
-- 11. ALLE TEAMS VERWIJDEREN (cascade ruimt de rest op)
-- ============================================================
create or replace function public.delete_all_teams()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.notification_reads where true;
  delete from public.teams where true;
end;
$$;

grant execute on function public.delete_all_teams() to anon, authenticated, service_role;

-- ============================================================
-- 12. ALLE MELDINGEN VERWIJDEREN
-- ============================================================
create or replace function public.delete_all_notifications()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.notification_reads where true;
  delete from public.notifications where true;
end;
$$;

grant execute on function public.delete_all_notifications() to anon, authenticated, service_role;
