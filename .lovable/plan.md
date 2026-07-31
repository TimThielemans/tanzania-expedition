# Plan: Expeditieplatform v2 — admin herstructurering, unified challenges, locatieopdrachten, PWA

Scope is large, so it is split into 6 stages. Each stage is shippable on its own. One new SQL file (`supabase/upgrade4.sql`) covers all database work up front so you only run SQL once.

## Stage 0 — Database (`supabase/upgrade4.sql`)

Required changes:

1. **Unified challenge model.** `challenges` becomes the single source of truth.
   - Add `location_event_id uuid references location_events(id) on delete set null` as a real FK (currently it is a loose uuid column), with a unique index so the Event↔Challenge link is strictly one-to-one.
   - Drop the per-team duplication: `target_team_id` is no longer used to create per-team copies. A location challenge is one row; per-team availability comes from `location_event_triggers` plus a new dismissal/submission state.
   - Keep `is_bonus`, `is_location`, `creativity_bonus_points`, `duration_minutes`, `bonus_active`, `bonus_started_at`.
2. **Location events slim down.** Deprecate the challenge-definition columns on `location_events` (`challenge_title`, `challenge_description`, `challenge_type`, `points`) — kept in the DB but no longer written or read, so existing rows survive. Add:
   - `zone_id uuid null references zones(id) on delete set null` (NULL = active in all zones)
   - `notification_target text` with values `team | admin | all` (replaces the overloaded `trigger_type`; a legacy mapping is applied in the migration)
   - `challenge_id` is not needed on the event: the link lives on `challenges.location_event_id`.
3. **Per-team location-challenge state.** New table `location_challenge_states(team_id, challenge_id, state('open'|'submitted'|'dismissed'), unique(team_id, challenge_id))` + GRANTs + open RLS policy, matching the existing event-access pattern.
4. **Tracking device claim.** New table `team_tracking_devices(team_id unique, device_id text, claimed_at)` + GRANTs/RLS, so exactly one device per team writes `team_locations`.
5. **`full_game_reset()` rewritten as "Back to Start".** Wipes only history: `answers`, `quiz_answers`, `photos`, `notifications`, `notification_reads`, `team_progress`, `team_locations`, `zone_first_unlocks`, `zone_completion_notices`, `location_event_triggers`, `location_challenge_states`, `team_tracking_devices`; resets scores to 0; clears `teams.group_photo_url`; and per challenge sets `bonus_active=false, bonus_started_at=null, target_team_id=null`. It must **no longer delete** location events or location challenges (today it does `delete from challenges where is_location = true`, and it force-disables bonus challenges — both wrong under the new model).
6. **Realtime** publication for `team_locations` (already present) plus `location_challenge_states`.

### The "actie mislukt" reset bug

Diagnosis is not yet confirmed — the RPC lives in your own Supabase project, so the first implementation step is to run the reset and read the returned Postgres error. The two most likely causes, both fixed by the rewrite above: `zone_completion_notices` (referenced by the current function) does not exist in your project, or `upgrade3.sql` was never fully applied so `full_game_reset` is missing. The new function will be written defensively (`if to_regclass(...) is not null` per table) so a missing optional table can no longer abort the whole reset, and the admin UI will surface the real error message instead of a generic "actie mislukt".

## Stage 1 — Admin → Opdrachten herstructurering

New order on the tab: **1. Bonusopdrachten → 2. Opdrachtenbeheer → 3. Teamoverzicht**.

- **Bonusopdrachten (compact):** one row per bonus = title + active switch. Everything else (duur, punten, creativiteitsbonus, beschrijving) only inside the accordion, editable there.
- **Opdrachtenbeheer:** accordion grouped by zone (plus a "Bonus" and "Locatie" group). Collapsed row shows title, type label, and status chips: 🟢/🔴, ⭐ when `creativity_bonus_points > 0`, 📍 when `is_location`. Row actions: expand-to-edit, enable/disable, delete (with confirm).
- **➕ Opdracht toevoegen** opens the editor in a modal; no form is rendered until clicked.
- **Challenge editor** is type-driven: select type first, then only relevant fields render (options + correct answer only for multiple choice, correct answer for text/numeric, no answer field for photo types). Dropdowns for type / zone / linked location event; switches for active, bonus, location. No timestamps, no ids.
- **Teamoverzicht (compact):** one line per team = name + GPS dot (🟢 <2 min, 🟠 <7 min, 🔴 >7 min, ⚪ tracking off); red rows append "Laatste GPS: X min geleden". Clicking opens a modal with group photo, current/unlocked/completed zones and progress, last activity, last GPS + status, active location challenges, and regular/bonus/creativity points.

## Stage 2 — Location events + map

- **Event editor** (create/edit/delete/enable) with fields: naam, coördinaten, radius, notification target dropdown (Team / Reisleider / Iedereen), trigger mode dropdown (Eén keer per team / Enkel eerste team), notificatiebericht; optional zone restriction and optional **existing** challenge reference. No challenge fields inside the event.
- **Map location picker:** modal Leaflet map opened at the configured finale location; click sets lat/lon. Manual entry stays available as a read-only display/fallback.
- **Trigger logic** (`src/lib/locations.ts`): stop inserting per-team challenge copies. On entering a geofence, insert the trigger row, send the notification to the configured target, and — when the event references a challenge — insert `location_challenge_states(team, challenge, 'open')`. Zone restriction is enforced before firing.
- **Admin map:** center on the finale coordinates from `game_settings` instead of the hardcoded Belgian coordinates; subscribe to Supabase Realtime on `team_locations` (with a 15 s polling fallback) so all team markers stay live; keep event circles and the finale marker.

## Stage 3 — Locatieopdrachten in de app

- Zone-restricted location challenge renders **above** the regular challenges of that zone; unrestricted ones render on the home screen above the zones, styled like a bonus challenge with a 📍 "Locatieopdracht" badge and distinct border.
- Visible only when the team has an `open` state; after submit → `submitted`, after **"Niet deelnemen"** → `dismissed`. Either way it hides for that team only and stays available for every other team.
- Review flow unchanged: the team gets a notification with awarded points or rejection.
- Zone/challenge cards show a small ⭐ next to the point value when a creativity bonus is possible (no amount shown).

## Stage 4 — Scores/review, Beheer, home screen

- **Scores tab order:** Snelle review → Filters → Fotobeoordelingen → Antwoordbeoordelingen. Quick review stays pinned at the top for both answers and photos. The gallery route stays a separate browsing surface.
- **Beheer:** remove the team-progress overview (now in Opdrachten). Team management becomes a compact list with edit (inline accordion) and delete per row, plus **➕ Team toevoegen** in a modal. Danger zone keeps "Back to Start" and "Alle teams verwijderen", now with real error messages.
- **Home screen:** location-sharing indicator (🟢/⚪) next to the team name in the team summary bar.
- **Photo gallery:** responsive grid, newest first, team + zone filters, lazy-loaded thumbnails with paging ("meer laden"), fullscreen view with previous/next and team name.

## Stage 5 — Multi-device + PWA

- **Multi-device:** each browser gets a stable `device_id` in localStorage. On login the device tries to claim `team_tracking_devices` for its team; the winner tracks GPS, others skip tracking but keep full photo/answer/notification functionality and show ⚪ with a "andere telefoon deelt de locatie" hint. Back to Start clears the claims, so the next device to log in becomes the tracker.
- **PWA:** manifest with `display: standalone`, theme/background colours, app icons, apple-touch-icon and Apple mobile-web-app meta tags, `viewport-fit=cover`, safe-area padding, and `100dvh` instead of `100vh`. No offline service worker (not requested), so nothing can serve stale builds.
- **Install hint** on the welcome/login screen ("📱 Ga voor de beste ervaring") with separate iPhone/Android steps and the benefit list; shown only on mobile and only outside standalone mode, dismissible, dismissal stored in localStorage.

## Possible conflicts / risks

- **Migration of existing location events.** Events created with the old model carry their challenge text inside the event. The migration creates one real challenge row per such event and links it via `challenges.location_event_id`, so nothing is lost. Existing per-team location-challenge copies (`is_location = true` with `target_team_id`) are deleted by the migration — they are throwaway game state.
- **`trigger_type` vs `notification_target`.** `location_challenge` currently doubles as both an action and a notification target. Mapping: `location_challenge` → target `team` + a linked challenge; the other three map straight onto team/admin/all. The old column stays for one release to avoid breaking anything mid-event.
- **Reset semantics.** The current reset deletes location challenges and disables bonus challenges; the new one must not. If you run a reset with the old function still installed you lose your configured location challenges — apply `upgrade4.sql` before the next test round.
- **Zone-progress counting.** Location and bonus challenges must stay excluded from a zone's X/Y progress; the unified model makes it easy to accidentally include them, so the counting helpers get an explicit filter.
- **Realtime volume.** Up to ~20 teams at 20 s intervals is well within limits; the map coalesces updates into a single re-render pass.
- **Multi-device answer collisions.** `answers`/`quiz_answers` are unique per (team, challenge), so a second device submitting the same challenge gets a conflict; the UI will show a clear "al ingediend door je team" message instead of a raw error.

## Order of work

Stage 0 (SQL) → 1 → 2 → 3 → 4 → 5. Stages 1 and 4 are UI-only and can be pulled forward if you want visible progress first.
