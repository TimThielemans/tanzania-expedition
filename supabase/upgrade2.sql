-- ============================================================
-- BOW in Tanzania — UPGRADE 2
-- Bonusopdrachten, review-workflow (goedkeuren/afkeuren), zone-taglines
-- en automatische zonecode-levering.
-- Voer dit uit in de Supabase SQL Editor van je eigen project.
-- Veilig om meerdere keren uit te voeren.
-- ============================================================

-- ---------- zones: tagline ----------
alter table public.zones
  add column if not exists tagline text;

-- Voorbeeldteksten (alleen invullen wanneer nog leeg)
update public.zones set tagline = 'Niet iedereen die dwaalt is verdwaald.'
  where tagline is null and name ilike '%mtb%';
update public.zones set tagline = 'Samen naar de top.'
  where tagline is null and name ilike '%meru%';
update public.zones set tagline = 'Ogen open voor avontuur.'
  where tagline is null and name ilike '%safari%';
update public.zones set tagline = 'De finish is een paradijs.'
  where tagline is null and name ilike '%zanzibar%';

-- ---------- challenges: bonusopdrachten ----------
alter table public.challenges
  add column if not exists is_bonus boolean not null default false,
  add column if not exists notification_message text,
  add column if not exists duration_minutes integer not null default 15,
  add column if not exists bonus_active boolean not null default false,
  add column if not exists bonus_started_at timestamptz;

-- bonusopdrachten hangen niet aan een zone
alter table public.challenges
  alter column zone_id drop not null;

-- nieuw type: bonus_photo_upload
alter table public.challenges
  drop constraint if exists challenges_challenge_type_check;
alter table public.challenges
  add constraint challenges_challenge_type_check
  check (challenge_type in (
    'text_answer', 'numeric_answer', 'photo_upload', 'multiple_choice', 'bonus_photo_upload'
  ));

-- ---------- review-status op inzendingen ----------
alter table public.answers
  add column if not exists status text not null default 'pending';
alter table public.quiz_answers
  add column if not exists status text not null default 'pending';
alter table public.photos
  add column if not exists status text not null default 'pending';

do $$
declare t text;
begin
  foreach t in array array['answers', 'quiz_answers', 'photos'] loop
    execute format('alter table public.%I drop constraint if exists %I;', t, t || '_status_check');
    execute format(
      'alter table public.%I add constraint %I
       check (status in (''pending'', ''approved'', ''rejected''));', t, t || '_status_check');
  end loop;
end $$;

-- bestaande inzendingen die al punten kregen, gelden als goedgekeurd
update public.answers set status = 'approved' where points_awarded > 0 and status = 'pending';
update public.quiz_answers set status = 'approved' where points_awarded > 0 and status = 'pending';
update public.photos set status = 'approved' where points_awarded > 0 and status = 'pending';

-- foto's zonder zone (bonus) moeten kunnen
alter table public.photos alter column zone_id drop not null;
alter table public.answers alter column zone_id drop not null;
alter table public.quiz_answers alter column zone_id drop not null;

-- ---------- zone_completion_notices (code maar één keer sturen) ----------
create table if not exists public.zone_completion_notices (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  zone_id uuid not null references public.zones(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (team_id, zone_id)
);

-- ---------- grants ----------
grant select, insert, update, delete on public.zone_completion_notices to anon, authenticated;
grant all on public.zone_completion_notices to service_role;

-- ---------- RLS ----------
do $$
begin
  execute 'alter table public.zone_completion_notices enable row level security';
  execute 'drop policy if exists "event access" on public.zone_completion_notices';
  execute 'create policy "event access" on public.zone_completion_notices for all to anon, authenticated
           using (true) with check (true)';
end $$;

-- ---------- updated_at trigger niet nodig (geen updated_at kolom) ----------

-- ---------- realtime ----------
do $$
begin
  begin alter publication supabase_realtime add table public.zone_completion_notices;
  exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.zones;
  exception when duplicate_object then null; end;
end $$;

-- ============================================================
-- VOORBEELD BONUSOPDRACHTEN (optioneel)
-- ============================================================
insert into public.challenges
  (zone_id, title, description, challenge_type, is_bonus, notification_message,
   duration_minutes, points, active, bonus_active, sort_order)
select null,
       'Giraf-gespot',
       'Maak een foto van iets dat op een giraf lijkt.',
       'bonus_photo_upload',
       true,
       E'📢 BONUSOPDRACHT\n\nZoek iets dat op een giraf lijkt.\n\nJullie hebben 15 minuten.',
       15, 20, true, false, 1
where not exists (select 1 from public.challenges where is_bonus = true);
