# Zonevoltooiing met locatieopdrachten + goedkeuringsberichten per opdracht

## 1. Zone pas voltooid als ook de locatieopdrachten klaar zijn

Vandaag negeert de zonecheck locatieopdrachten volledig (`review.ts` filtert `!c.is_location`), en bij het goedkeuren van een locatieopdracht stopt de logica vroegtijdig zodat de zonecode nooit getriggerd wordt.

Nieuw gedrag:
- De set opdrachten van een zone = actieve zoneopdrachten (geen bonus) **plus** actieve locatieopdrachten die via hun locatie-event aan diezelfde zone hangen.
- Weggeklikte (dismissed) locatieopdrachten van dat team tellen niet mee.
- Niet-geactiveerde locatieopdrachten blokkeren de zone wel: de zone is niet voltooid zolang die niet ingezonden en nagekeken zijn.
- Bonusopdrachten, opdrachten van andere zones en locatieopdrachten buiten de zone tellen nooit mee.
- Pas als alle meetellende opdrachten een beoordeling hebben (niet meer `pending`), gaat het "Goed gedaan"-bericht met de code/ontgrendeling van de volgende zone eenmalig naar het team.
- Na goedkeuring van een locatieopdracht wordt de zonecheck nu ook uitgevoerd (zone bepaald via het locatie-event van die opdracht).

## 2. Beoordelingsbericht per opdracht

- Nieuw veld op opdrachten: `approval_message` (optioneel) — een bericht dat verstuurd wordt zodra de inzending nagekeken is.
- Bij het nakijken van een inzending (goedkeuring, ⭐ Uitstekend **en** afkeuring): als `approval_message` gevuld is, wordt dat bericht naar het team gestuurd in plaats van de standaard bonus-/locatiemelding. De ⭐-creativiteitsmelding blijft daarnaast bestaan.
- Is het veld leeg, dan blijft alles precies zoals nu.
- De zonecode-melding blijft los hiervan werken, zodat een verhaalbericht en een zonecode elkaar niet uitsluiten.

## 3. Admin

In de opdracht-editor (nieuw en bestaand, alle soorten opdrachten) komt een tekstveld "Bericht na nakijken" met uitleg dat dit de standaardmelding vervangt en leeg gelaten kan worden.

## 4. Zonepagina: melding over openstaande locatieopdrachten

Onderaan de zonepagina, boven "Terug naar Home", komt een discrete mededeling zodra de zone nog locatieopdrachten heeft die de voltooiing tegenhouden (actieve locatieopdrachten van de zone die niet weggeklikt en niet ingezonden/nagekeken zijn), bv. "Deze zone heeft nog openstaande locatieopdrachten." De mededeling verdwijnt als er geen blokkerende locatieopdrachten meer zijn.


## Technische details

- `supabase/upgrade5.sql` (nieuw) + `supabase/schema.sql`: `alter table public.challenges add column approval_message text default null;`
- `src/lib/types.ts`: `approval_message: string | null` op `Challenge`.
- `src/lib/admin.ts`: `approval_message` toevoegen aan `ChallengeInput`.
- `src/components/ChallengeEditor.tsx`: `Textarea` voor `approval_message`, opgenomen in `emptyChallenge()` en `toInput()`.
- `src/lib/api.ts`: helper die de volledige zoneset teruggeeft (zoneopdrachten + locatieopdrachten van de zone via `locationChallengesOfZone`), zodat `review.ts` en de voortgangsweergave dezelfde bron gebruiken.
- `src/lib/review.ts`:
  - `maybeDeliverZoneCode` haalt ook `fetchLocationEvents()` en `fetchLocationChallengeStates(teamId)` op; locatieopdrachten met state `dismissed` worden uit de set gehaald.
  - `afterReview`: bij `approval_message` dat bericht sturen (zowel bij `approved` als `rejected`) i.p.v. de standaard bonus-/locatiemelding; voor locatieopdrachten daarna de zone van het gekoppelde event bepalen en `maybeDeliverZoneCode` aanroepen.
- `src/routes/zone.$zoneId.tsx`: afleiden welke locatieopdrachten van de zone nog blokkeren (via `locationChallengesOfZone`, de states en `submittedValue`) en die mededeling boven de "Terug naar Home"-knop tonen.
- Na het toepassen van de migratie moet `upgrade5.sql` in de Supabase SQL Editor gerund worden.
