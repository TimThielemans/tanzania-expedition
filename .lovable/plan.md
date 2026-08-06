# Arrival Screen — "BOW Airlines" landing before the adventure

Bij de eerste login van een team op een toestel komt er eerst een volledig scherm
vliegtuig-aankomst in plaats van de Home-pagina. Geen welkomsttoast, geen onboarding
die er bovenop springt.

## Wat de gebruiker ziet

1. Inloggen → **geen** welkomsttoast.
2. In plaats van Home: een fullscreen Arrival Screen (echte pagina-inhoud, geen modal
   of overlay) in een premium BOW Airlines-stijl: donkere cabine-achtergrond, gouden
   accenten, boardingpass-typografie.
3. Inhoud verschijnt gefaseerd (regel per regel, typewriter-tempo, comfortabel leesbaar):
   - BOW AIRLINES
   - BRU → JRO
   - de vijf aankondigingsregels van de cabinecrew (Brussels → Kilimanjaro, vluchttijd
     ~9 seconden, MTB-trails / Mount Meru / savanne / Zanzibar, blijf zitten tot de
     Touch Down-knop oplicht, captain Lotte, Hakuna Matata!)
4. Daarna één per één de statusregels:
   ✓ Boarding completed · ✓ Cruising altitude reached · ✓ Mount Kilimanjaro spotted ·
   ✓ Descent initiated
5. Ten slotte 🛬 Welcome to Tanzania en een grote knop **TOUCH DOWN** (pas dan actief/
   opgelicht).
6. Na TOUCH DOWN: arrival wordt afgevinkt in localStorage, Home verschijnt, en na
   1 seconde start de bestaande onboardingtour ongewijzigd.

Terugkerende gebruikers: geen Arrival Screen, wél de welkomsttoast, onboarding zoals nu
(alleen de eerste keer).

## Technische opzet

- **`src/lib/arrival.ts`** (nieuw): zelfde patroon als `src/lib/onboarding.ts` —
  localStorage-key `bow-arrival:<versie>:<teamId>` plus listener-set en
  `useArrival(teamId)` die `{ done, hydrated, complete() }` teruggeeft. Per team per
  toestel dus. Ook een geëxporteerde `ARRIVAL_SCRIPT` met alle regels als data:
  `lines` (aankondiging), `checkpoints` (✓-regels), `arrivalLabel`, `buttonLabel`,
  `flight` (BOW AIRLINES / BRU → JRO / BOWDA26) en de timings.
- **`src/components/ArrivalScreen.tsx`** (nieuw): rendert het script gefaseerd met een
  typewriter-hook, respecteert `prefers-reduced-motion` (dan direct volledige tekst),
  gebruikt bestaande semantische tokens uit `src/styles.css` (geen hardcoded kleuren),
  `env(safe-area-inset-*)` voor iPhone. `onDone` → `complete()`.
- **`src/routes/index.tsx`**:
  - toast bij `loginTeam` alleen wanneer arrival al `done` is voor dat team (dus
    terugkerende gebruiker).
  - in `IndexPage`: als er een sessie is en arrival niet `done` → `<ArrivalScreen />`
    tonen in plaats van `<HomeScreen />`.
- **`src/components/OnboardingTour.tsx`**: tour blijft verborgen zolang arrival niet
  `done` is, en start daarna met 1 seconde vertraging (timer op het moment dat arrival
  `done` wordt). Stappen en teksten van de onboarding blijven exact zoals ze zijn.
- **`README.md`**: nieuw stukje "Landingspagina (BOW Airlines) aanpassen" dat uitlegt
  dat alle tekst, checkpoints, knoplabel en tempo in `ARRIVAL_SCRIPT` in
  `src/lib/arrival.ts` staan, en dat het verhogen van de versie in de localStorage-key
  het scherm opnieuw voor iedereen toont.

Geen databasewijzigingen, geen wijziging aan spel-, score- of onboardinginhoud.
