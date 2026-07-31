# Plan: Expeditieplatform v2 — admin herstructurering, unified challenges, locatieopdrachten, PWA

Scope is large, so it is split into 6 stages. Each stage is shippable on its own. Because the project is still in debug phase, the database is rebuilt from scratch instead of patched.

## Stage 0 — Clean database rebuild

Replace the pile of `schema.sql` + `upgrade.sql` + `upgrade2.sql` + `upgrade3.sql` with **two files only**:

- `supabase/schema.sql` — one complete, final schema (drops and recreates the app's own tables, so it can be re-run at will during debugging).
- `supabase/seed.sql` — teams, zones, challenges, location events, settings.

The old `upgrade*.sql` files are deleted. No backwards-compatibility shims, no legacy column mapping. You run `schema.sql` once, then `seed.sql`, and the database matches the code exactly.

Final structure (changes versus today):

1. **Unified challenge model** — `challenges` is the single source of truth for every challenge (normal, bonus, location):
   `title, description, image_url, challenge_type, options, correct_answer, points, creativity_bonus_points, zone_id, sort_order, active, is_bonus, duration_minutes, bonus_active, bonus_started_at, is_location, location_event_id`.
   `location_event_id` is a real FK to `location_events` with a unique index → strict one-to-one. `target_team_id` and per-team challenge copies are gone.
2. **`location_events` is trigger-only**: `name, description, latitude, longitude, radius_meters, trigger_mode ('every' | 'first'), notification_target ('team' | 'admin' | 'all'), notification_message, zone_id (nullable = all zones), active`. No challenge fields at all.
3. **`location_challenge_states`** `(team_id, challenge_id, state 'open' | 'submitted' | 'dismissed', unique(team_id, challenge_id))` — per-team availability of a location challenge.
4. **`team_tracking_devices`** `(team_id unique, device_id, claimed_at)` — exactly one device per team writes `team_locations`.
5. **`full_game_reset()` = "Back to Start"** — wipes only history: `answers`, `quiz_answers`, `photos`, `notifications`, `notification_reads`, `team_progress`, `team_locations`, `zone_first_unlocks`, `zone_completion_notices`, `location_event_triggers`, `location_challenge_states`, `team_tracking_devices`; scores back to 0; `teams.group_photo_url` cleared; every challenge set to `bonus_active = false, bonus_started_at = null`. It keeps all configured challenges (including location challenges), zones, teams and location events. **Bonus challenges are disabled (`active = false`), not deleted.**
6. Every table keeps the existing open-event access model: GRANTs to `anon`/`authenticated`, RLS enabled with a single permissive "event access" policy. Realtime on `scores`, `team_progress`, `photos`, `team_locations`, `location_challenge_states`.

### The "actie mislukt" reset bug

The rebuild removes the likely cause (a function referencing tables that were never created by a half-applied upgrade file). The reset RPC is recreated cleanly, and the admin UI will show the real Postgres error message instead of a generic "actie mislukt".

## Stage 1 — Admin → Opdrachten herstructurering

New order on the tab: **1. Bonusopdrachten → 2. Opdrachtenbeheer → 3. Teamoverzicht**.

- **Bonusopdrachten (compact):** one row per bonus = title + active switch. Duur, punten, creativiteitsbonus and description only inside the accordion, editable there.
- **Opdrachtenbeheer:** accordion grouped by zone. A location challenge whose event has a zone restriction is listed **inside that zone's group** even though its own `zone_id` is null; unrestricted location challenges get a separate "Locatie" group, bonuses a "Bonus" group. Collapsed row shows title, type label and status chips: 🟢/🔴, ⭐ when `creativity_bonus_points > 0`, 📍 when `is_location`. Row actions: expand-to-edit, enable/disable, delete (with confirm).
- **➕ Opdracht toevoegen** opens the editor in a modal; no form is rendered until clicked.
- **Challenge editor** is type-driven: pick the type first, then only relevant fields render (options + correct answer only for multiple choice, correct answer for text/numeric, none for photo types). Dropdowns for type / zone / linked location event; switches for active, bonus, location. No timestamps, no ids.
- **Teamoverzicht (compact):** one line per team = name + GPS dot (🟢 <2 min, 🟠 <7 min, 🔴 >7 min, ⚪ tracking off); red rows append "Laatste GPS: X min geleden". Click opens a modal with group photo, current/unlocked/completed zones and progress, last activity, last GPS + status, active location challenges, and regular/bonus/creativity points.

## Stage 2 — Location events + map

- **Event editor** (create/edit/delete/enable) with: naam, coördinaten, radius, notification target dropdown (Team / Reisleider / Iedereen), trigger mode dropdown (Eén keer per team / Enkel eerste team), notificatiebericht; optional zone restriction and optional reference to an **existing** challenge. No challenge fields inside the event.
- **Map location picker:** modal Leaflet map opened at the configured finale location; click sets latitude/longitude. Coordinates shown read-only alongside.
- **Trigger logic** (`src/lib/locations.ts`): on entering a geofence, insert the trigger row, send the notification to the configured target, and — when the event references a challenge — insert `location_challenge_states(team, challenge, 'open')`. Zone restriction is checked before firing.
- **Admin map:** center on the finale coordinates from `game_settings` instead of hardcoded coordinates; subscribe to Supabase Realtime on `team_locations` (15 s polling fallback) so all team markers stay live; keep event circles and the finale marker.

## Stage 3 — Locatieopdrachten in de app

- A location challenge whose event is zone-restricted renders **above** the regular challenges of that zone and **counts in that zone's X/Y progress**. An unrestricted one renders on the home screen above the zones and stays outside zone progress.
- Styled like a bonus challenge, with a distinct border and a 📍 "Locatieopdracht" badge.
- Visible only while the team's state is `open`; after submit → `submitted`, after **"Niet deelnemen"** → `dismissed`. Either way it hides for that team only and remains available for every other team.
- Review flow unchanged: the team gets a notification with awarded points or rejection.
- Zone/challenge cards show a small ⭐ next to the point value when a creativity bonus is possible (no amount shown).

## Stage 4 — Scores/review, Beheer, home screen

- **Scores tab order:** Snelle review → Filters → Fotobeoordelingen → Antwoordbeoordelingen. Quick review stays pinned at the top for both answers and photos. The gallery route stays a separate browsing surface.
- **Beheer:** remove the team-progress overview (now in Opdrachten). Team management becomes a compact list with edit (inline accordion) and delete per row, plus **➕ Team toevoegen** in a modal. Danger zone keeps "Back to Start" and "Alle teams verwijderen", now with real error messages.
- **Home screen:** location-sharing indicator (🟢/⚪) next to the team name in the team summary bar.
- **Photo gallery:** responsive grid, newest first, team + zone filters, lazy-loaded thumbnails with paging ("meer laden"), fullscreen view with previous/next and team name.

## Stage 5 — Multi-device + PWA

- **Multi-device:** each browser stores a stable `device_id` in localStorage. On login a device claims `team_tracking_devices` for its team if no claim exists; the holder tracks GPS, other devices skip tracking but keep full photo/answer/notification functionality.
- **Manual takeover:** tapping the ⚪ indicator asks "Wil je dit toestel de locatiedeler van je team maken?" — confirming overwrites the claim (`device_id`, `claimed_at`) so this device becomes the only tracker; the previous device sees ⚪ on its next poll and stops sending. Back to Start clears all claims, so the next device to log in becomes the tracker.
- **PWA:** manifest with `display: standalone`, theme/background colours, app icons, apple-touch-icon and Apple mobile-web-app meta tags, `viewport-fit=cover`, safe-area padding, and `100dvh` instead of `100vh`. No offline service worker (not requested), so nothing can serve stale builds.
- **Install hint** on the welcome/login screen ("📱 Ga voor de beste ervaring") with separate iPhone/Android steps and the benefit list; shown only on mobile and only outside standalone mode, dismissible, dismissal stored in localStorage.

## Possible conflicts / risks

- **Rebuild wipes existing data.** Running the new `schema.sql` drops the app tables, so current test teams/zones/challenges disappear and come back from `seed.sql`. Acceptable in this debug phase, but it must happen before any real event.
- **Storage bucket.** The `photos` bucket and its policies are recreated in the same schema file; existing test files can be removed manually.
- **Zone progress with location challenges.** Since zone-restricted location challenges count toward X/Y, a team that dismisses one must not be blocked from completing the zone — dismissed counts as handled in the progress calculation.
- **Realtime volume.** Up to ~20 teams at 20 s intervals is well within limits; the map coalesces updates into a single re-render pass.
- **Multi-device answer collisions.** `answers`/`quiz_answers` stay unique per (team, challenge), so a second device submitting the same challenge gets a clear "al ingediend door je team" message instead of a raw error.

## Order of work

Stage 0 (clean SQL) → 1 → 2 → 3 → 4 → 5.
