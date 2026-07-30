# BOW in Tanzania

Mobile-first teambuilding-webapp (Nederlands) rond een expeditie door Tanzania.
Alle inhoud — titel, welkomsttekst, zones, teams, wachtwoorden, opdrachten, punten en bonusknoppen —
komt uit de database. Er is **niets hardcoded**: de app is herbruikbaar voor toekomstige events.

**Stack:** React 19 + TypeScript + TanStack Start/Router + TanStack Query + Tailwind v4 + **jouw eigen Supabase-project**.

## Functionaliteit

- Teamlogin met wachtwoord uit de database, sessie in Local Storage, logout-knop
- Home met titel, welkomstboodschap, team, score, plaats en dynamische zonekaarten
- Zones met twee unlock-modi: `password` en `automatic_after_completion` (plus `open`)
- Opdrachttypes: `text_answer`, `numeric_answer`, `photo_upload`, `multiple_choice` (2–10 opties)
- Foto's naar Supabase Storage (camera of galerij) met preview
- Live scorebord (Realtime) met 🥇🥈🥉 en ex aequo op tijdstip
- Statistiekenpagina, fotogalerij (thumbnail + fullscreen)
- Admin op `/admin` met puntenknoppen, scorebeheer, exports en resetacties
- Offline-ondersteuning: antwoorden worden lokaal bewaard en automatisch gesynct
- Confetti bij zone-unlock, zone-voltooiing en eerste plaats

---

# SUPABASE SETUP GUIDE

Volg deze stappen één keer per event/project.

## Stap 1 — Maak een Supabase-project

1. Ga naar <https://supabase.com/dashboard> en klik **New project**.
2. Kies een naam, regio (bv. `eu-central`) en een sterk databasewachtwoord.
3. Wacht tot het project klaar is.

## Stap 2 — Voer de SQL uit in de SQL Editor

Open in Supabase: **SQL Editor → New query**.

1. Plak de **volledige inhoud** van `supabase/schema.sql` en klik **Run**.
   Dit maakt alle tabellen, triggers, de `add_points`-functie, GRANTs, RLS-policies,
   Realtime-publicatie en de Storage-policies aan.
   Tabellen: `teams`, `zones`, `challenges`, `answers`, `photos`, `scores`, `quiz_answers`,
   `team_progress`, `game_settings`, `admin_settings`, `point_actions`.
2. Nieuwe query → plak de inhoud van `supabase/upgrade.sql` en klik **Run**.
   Dit voegt het `active`-veld op opdrachten toe en maakt `notifications`,
   `notification_reads` en `zone_first_unlocks` (meldingencentrum, adminmeldingen
   en "eerste team"-prestaties), inclusief GRANTs, RLS en Realtime.
3. Nieuwe query → plak de inhoud van `supabase/upgrade2.sql` en klik **Run**.
   Dit voegt toe: `tagline` op zones, bonusopdrachten op `challenges`
   (`is_bonus`, `notification_message`, `duration_minutes`, `bonus_active`, `bonus_started_at`),
   het nieuwe opdrachttype `bonus_photo_upload`, een review-`status`
   (`pending` / `approved` / `rejected`) op antwoorden, quizantwoorden en foto's,
   en de tabel `zone_completion_notices` voor de automatische zonecode.
4. Nieuwe query → plak de inhoud van `supabase/seed.sql` en klik **Run**.
   Dit vult voorbeeldteams, de vier zones (🚵 MTB Adventure, ⛰️ Mt Meru, 🦁 Safari, 🌴 Zanzibar),
   voorbeeldopdrachten, instellingen, het adminwachtwoord en de puntenknoppen (+3, +5, −3, −5).

> **Nakijken en punten:** foto's en open (tekst/numerieke) antwoorden zonder `correct_answer`
> leveren pas punten op nadat de reisleider ze in Admin → Antwoorden goedkeurt. Opdrachten
> met een ingevuld `correct_answer` worden automatisch beoordeeld.

> **Automatische zonecode:** zodra alle opdrachten van een zone voor een team ingezonden én
> nagekeken zijn, krijgt dat team automatisch een melding met de behaalde punten en — als de
> volgende zone een wachtwoord heeft — de code. Dit gebeurt één keer per team per zone.

> **Bonusopdrachten:** maak in de Table Editor een rij in `challenges` met `is_bonus = true`,
> `zone_id = null`, `challenge_type = 'bonus_photo_upload'`, een `notification_message`,
> `duration_minutes` en `points`. Activeer ze in Admin → Opdrachten; alle teams krijgen dan
> meteen een melding en de opdracht verschijnt met aftelklok op het startscherm.

> **Zones ontgrendelen:** een zone met een ingevuld `unlock_password` blijft dicht tot de
> reisleider de code via Meldingen stuurt. Is het wachtwoord leeg, dan opent de zone
> automatisch zodra de vorige zone volledig is afgerond. De eerste zone staat altijd open.


> Later zones, teams of opdrachten toevoegen/hernoemen/verwijderen? Dat doe je volledig in de
> Supabase **Table Editor** — er is geen codewijziging nodig.

## Stap 3 — Maak de Storage bucket

**Storage → New bucket**

| Instelling | Waarde |
| --- | --- |
| Name | `photos` |
| Public bucket | **aan** (nodig voor de galerij) |

De policies voor deze bucket zijn al aangemaakt door `schema.sql`.

## Stap 4 — Omgevingsvariabelen

Je hebt twee waarden nodig uit **Project Settings → API**:

- **Project URL** → `SUPABASE_URL`
- **anon public key** → `SUPABASE_ANON_KEY`

### Waar plak je ze?

**A. Lokaal** — maak een bestand `.env` in de projectroot (zie `.env.example`):

```bash
VITE_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
```

Herstart daarna de dev server (`bun dev` of `npm run dev`).

**B. Lovable** — Project → **Settings → Environment variables**: voeg exact dezelfde twee
variabelen toe (`VITE_SUPABASE_URL` en `VITE_SUPABASE_ANON_KEY`) en publiceer opnieuw.

**C. Vercel** — Project → **Settings → Environment Variables** → voor *Production*, *Preview*
en *Development*:

| Name | Value |
| --- | --- |
| `VITE_SUPABASE_URL` | `https://xxxxxxxxxxxx.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | `eyJhbGciOi...` |

> De prefix `VITE_` is verplicht: alleen zo komen de waarden in de browserbundel terecht.
> De anon key is een publieke sleutel — die mag in de frontend. Gebruik **nooit** de
> `service_role`-sleutel in deze app.

## Stap 5 — Instellingen aanpassen

In de tabel `game_settings` (key/value):

| key | voorbeeldwaarde | betekenis |
| --- | --- | --- |
| `app_title` | `BOW in Tanzania` | Titel in de app |
| `welcome_message` | `Welkom bij Expeditie Tanzania` | Welkomsttekst |
| `zone_unlock_mode` | `password` | Standaardmodus (`password` of `automatic_after_completion`) |
| `show_scoreboard` | `true` | Scorebord tonen |
| `show_statistics` | `true` | Statistieken tonen |

In `admin_settings` staat `admin_password` — **wijzig deze waarde vóór het event.**

## Stap 6 — Testen

1. Open de app → kies een team → log in met het wachtwoord uit `teams.password`.
2. Los een opdracht op en controleer het scorebord.
3. Ga naar `/admin` en log in met `admin_settings.admin_password`.

---

## Deployment

### Lovable

Klik op **Publish** rechtsboven. Zorg dat de twee omgevingsvariabelen uit stap 4 zijn ingesteld.

### Vercel

1. Push de repo naar GitHub en importeer die in Vercel.
2. Build command: `npm run build` · Output: standaard (framework preset detecteert Vite/TanStack Start).
3. Voeg `VITE_SUPABASE_URL` en `VITE_SUPABASE_ANON_KEY` toe bij Environment Variables.
4. Deploy.

## Lokaal draaien

```bash
bun install      # of: npm install
cp .env.example .env   # vul je Supabase-waarden in
bun dev          # of: npm run dev
```

## Projectstructuur

```
src/
  components/     herbruikbare UI (AppShell, ZoneCard, ChallengeCard, ...)
  hooks/useGame   TanStack Query hooks + Realtime
  lib/            supabase client, api, admin acties, offline queue, sessie
  routes/         /, /zone/$zoneId, /scorebord, /statistieken, /galerij, /admin
supabase/
  schema.sql      volledig databaseschema (uitvoeren in SQL Editor)
  seed.sql        voorbeelddata
```


## Spelinfo-pagina aanpassen

De pagina **Info** (🎲 in de onderste navigatie) bevat een algemene uitleg: het spel, de
spelregels, het puntensysteem, zones ontgrendelen, bonusopdrachten en hulp.

Die teksten staan in **`src/routes/info.tsx`** in de constante `SECTIONS`. Elke sectie heeft:

```ts
{
  id: "regels",          // unieke id (voor het openklappen)
  icon: "📜",            // emoji voor de titel
  title: "Spelregels",   // titel van de sectie
  body: ["Regel 1", "Regel 2"],  // elke regel wordt een bullet
}
```

Pas de teksten aan, voeg secties toe of verwijder ze — er is geen databasewijziging nodig.

## Zone-taglines

Elke zone heeft een korte slogan (`tagline`) die op het startscherm en boven de zone
verschijnt. Aanpassen doe je in de Supabase **Table Editor → zones → tagline**, bijvoorbeeld:

| Zone | Tagline |
| --- | --- |
| MTB Adventure | Niet iedereen die dwaalt is verdwaald. |
| Mt Meru | Samen naar de top. |
| Safari | Ogen open voor avontuur. |
| Zanzibar | De finish is een paradijs. |
