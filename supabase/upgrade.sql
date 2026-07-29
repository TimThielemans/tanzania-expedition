-- ============================================================
-- BOW in Tanzania — UPGRADE (meldingen, first-unlocks, challenge-activatie)
-- Voer dit uit in de Supabase SQL Editor van je eigen project.
-- Veilig om meerdere keren uit te voeren.
-- ============================================================

-- ---------- challenges: active-veld (indien nog niet aanwezig) ----------
alter table public.challenges
  add column if not exists active boolean not null default true;

-- ---------- notifications ----------
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text,
  -- 'all'  = alle teams, 'team' = één team, 'admin' = enkel spelleiding
  audience text not null default 'all' check (audience in ('all', 'team', 'admin')),
  team_id uuid references public.teams(id) on delete cascade,
  kind text not null default 'info',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists notifications_created_idx on public.notifications(created_at desc);

-- ---------- notification_reads (reader = team-id of 'admin') ----------
create table if not exists public.notification_reads (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.notifications(id) on delete cascade,
  reader text not null,
  read_at timestamptz not null default now(),
  unique (notification_id, reader)
);

-- ---------- zone_first_unlocks (eerste team per zone) ----------
create table if not exists public.zone_first_unlocks (
  id uuid primary key default gen_random_uuid(),
  zone_id uuid not null unique references public.zones(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- ---------- updated_at trigger ----------
drop trigger if exists set_updated_at on public.notifications;
create trigger set_updated_at before update on public.notifications
  for each row execute function public.set_updated_at();

-- ---------- grants ----------
grant select, insert, update, delete on
  public.notifications, public.notification_reads, public.zone_first_unlocks
to anon, authenticated;

grant all on
  public.notifications, public.notification_reads, public.zone_first_unlocks
to service_role;

-- ---------- RLS (gesloten event, werkt met anon key) ----------
do $$
declare t text;
begin
  foreach t in array array['notifications', 'notification_reads', 'zone_first_unlocks'] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists "event access" on public.%I;', t);
    execute format(
      'create policy "event access" on public.%I for all to anon, authenticated
       using (true) with check (true);', t);
  end loop;
end $$;

-- ---------- realtime ----------
do $$
begin
  begin alter publication supabase_realtime add table public.notifications;
  exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.notification_reads;
  exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.zone_first_unlocks;
  exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.challenges;
  exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.answers;
  exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.quiz_answers;
  exception when duplicate_object then null; end;
end $$;
