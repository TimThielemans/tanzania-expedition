# Locatie-matrix + vaste volgorde voor locatie-events

## Wat je krijgt

1. **Nieuw overzicht in Admin → Kaart**, tussen de live kaart en de lijst met locatie-events: een compacte matrix met teams als rijen en locatie-events als kolommen.
2. **Vaste volgorde per locatie-event**, in te stellen door te slepen in het bestaande Locatie-events-overzicht. Nieuwe events komen automatisch onderaan.

## De matrix

- Rijen = teams (alfabetisch/huidige volgorde), eerste kolom blijft plakken bij horizontaal scrollen.
- Kolommen = locatie-events, header blijft plakken bij verticaal scrollen. Zowel horizontaal als verticaal scrollbaar.
- Kolomkop toont enkel een icoon: 📍 voor een event met gekoppelde opdracht, 🔔 voor een event dat enkel een melding stuurt. Naam en details verschijnen via tooltip (hover) en bij klik op de kop.
- Kolomvolgorde: eerst op zone (`zones.order_index`, via de zone van de gekoppelde opdracht), daarna op de nieuwe eventvolgorde. Events zonder zone komen als laatste groep ("zonevrij").
- Zones worden gescheiden door een dunne verticale lijn. Geen kleurvlakken, geen balken, geen percentages.
- Cel: ● donkergroen = getriggerd, ○ grijs = niet getriggerd. Klein en dicht op elkaar.

### Klik op een cel

- **Getriggerd**: dialog met teamnaam, zone, opdrachtnaam, eventnaam, tijdstip van triggeren, en actie **Trigger resetten** (met bevestiging). Reset verwijdert de trigger-rij en zet een eventueel geopende locatieopdracht voor dat team terug.
- **Niet getriggerd**: dialog met teamnaam, zone, opdrachtnaam, eventnaam, huidige afstand tot het event en leeftijd van de laatste GPS-update ("Afstand: 132 m", "Laatste GPS-update: 18 seconden geleden"; "Onbekend" als er geen GPS is), plus actie **Trigger forceren** (met bevestiging). Forceren voert dezelfde acties uit als een echte geofence-trigger (melding + eventuele opdracht vrijgeven).

## Volgorde van locatie-events

- Nieuw veld `order_index` op `location_events`. Bestaande events krijgen een volgorde op basis van hun aanmaakdatum.
- Het bestaande Locatie-events-overzicht sorteert op `order_index` en krijgt een sleepgreep per rij om de volgorde aan te passen (werkt met touch). Na het slepen worden de nieuwe indexen bewaard.
- Een nieuw event krijgt automatisch het hoogste nummer.

## Technische details

- SQL: nieuw bestand `supabase/upgrade4.sql` met `alter table public.location_events add column order_index integer not null default 0;`, een backfill via `row_number() over (order by created_at)`, en een index. `supabase/schema.sql` wordt gelijk getrokken zodat een verse installatie hetzelfde resultaat geeft. Je voert `upgrade4.sql` zelf uit in de Supabase SQL Editor.
- `src/lib/types.ts`: `order_index` toevoegen aan `LocationEvent`.
- `src/lib/locations.ts`: sorteren op `order_index, created_at`; `emptyLocationEvent` met `order_index: 0`; `createLocationEvent` zet het hoogste nummer; nieuwe helpers `reorderLocationEvents(ids)`, `resetLocationTrigger(eventId, teamId)` en `forceLocationTrigger(team, event)` die de bestaande `runTriggerAction` hergebruikt.
- Nieuw component `src/components/AdminLocationMatrix.tsx` met de matrix (sticky eerste kolom + sticky header via `position: sticky`), tooltips en de twee dialogs. Ingevoegd in `AdminMapPanel.tsx` tussen "Live kaart" en de rest.
- Slepen met `@dnd-kit/core` + `@dnd-kit/sortable` (touch-vriendelijk) in het events-overzicht van `AdminMapPanel.tsx`.
- Data komt uit bestaande hooks: `useTeams`, `useZones`, `useLocationEvents`, `useLocationTriggers`, `useAllChallenges`, `useTeamLocations`; realtime invalidatie zit er al.
