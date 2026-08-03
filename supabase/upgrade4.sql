-- ============================================================
-- BOW in Tanzania — upgrade 4
-- Vaste volgorde voor locatie-events (kolomvolgorde in de matrix).
-- Voer dit uit in de Supabase SQL Editor.
-- ============================================================

alter table public.location_events
  add column if not exists order_index integer not null default 0;

-- Bestaande events krijgen een volgorde op basis van hun aanmaakdatum.
with ordered as (
  select id, row_number() over (order by created_at) as rn
  from public.location_events
)
update public.location_events e
set order_index = ordered.rn
from ordered
where ordered.id = e.id
  and e.order_index = 0;

create index if not exists location_events_order_idx
  on public.location_events(order_index);
