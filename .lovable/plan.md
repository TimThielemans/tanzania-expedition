# Onboarding voor teams (eenmalig, per team + toestel)

Een korte, speelse coach-mark tour van max. een minuut die nieuwe teams langs Meldingen en Speluitleg leidt.

## Hoe het werkt voor de gebruiker

1. **Eerste login op dit toestel** — donkere overlay met kaartje:
   "👋 Welkom {Teamnaam} in Tanzania! Je hebt net een belangrijke melding ontvangen. Ga eerst naar het tabblad Meldingen." De Meldingen-tab in de bottom nav licht op (glow + pulse). Eén knop: **Naar Meldingen**. Rechtsboven een kleine "Overslaan".
2. **Meldingen** — de knop "Alles gelezen" licht op. Kaartje onderaan: "Open je nieuwe bericht en markeer daarna alle meldingen als gelezen." Geen knop; de stap gaat verder zodra de gebruiker echt op "Alles gelezen" tikt.
3. **Na "Alles gelezen"** — kaartje: "Goed bezig! 🎉 Ga nu naar Speluitleg om te ontdekken hoe het spel werkt." Eén knop: **Naar Speluitleg** (navigeert naar Info).
4. **Speluitleg** — de uitleg-lijst licht op. Kaartje: "Lees rustig de uitleg en keer daarna terug naar het spel via home. Veel succes! 🇹🇿" Knop: **Aan de slag** → gaat naar home en sluit de tour definitief.

Afgerond of overgeslagen = nooit meer tonen voor dat team op dat toestel. Ander team op hetzelfde toestel krijgt de tour opnieuw.

## Technische opzet

**Stappen als data (het uitbreidingspunt).** Nieuw bestand `src/lib/onboarding.ts` met één array `ONBOARDING_STEPS`, in volgorde. Elke stap:

```text
id            unieke sleutel
route         op welke pagina de stap zichtbaar is ("/", "/meldingen", "/info")
target        welk element oplicht: data-tour attribuut, bv. "nav-meldingen"
              of null (geen highlight)
placement     "top" | "bottom"  — waar het kaartje staat
title         kop, mag {team} bevatten
body          tekst, mag {team} bevatten
action        { label, goTo } → knop die navigeert en doorgaat, of null
advanceOn     event-naam waarop de stap automatisch doorgaat
              (stap 2: "notifications-all-read"), of null
```

Een stap toevoegen/herordenen = een object in die array toevoegen of verplaatsen. Een nieuw element highlightbaar maken = `data-tour="…"` op dat element zetten. Een nieuwe automatische trigger = `advanceOn: "mijn-event"` + `emitTourEvent("mijn-event")` op de plek van de actie.

**State.** `src/hooks/useOnboarding.ts`: leest/schrijft `localStorage` key `bow-onboarding:{teamId}` met `{ stepId | "done" }`, plus een kleine listener-set (zelfde patroon als `src/lib/session.ts`) zodat alle schermen synchroon lopen. Helpers: `next()`, `skip()`, `emitTourEvent(name)`.

**Overlay.** `src/components/OnboardingTour.tsx`, één keer gerenderd in `src/routes/__root.tsx` (na de nav, boven alles). Het meet het element met `data-tour={target}` via `getBoundingClientRect`, zet daar een "spotlight" ring omheen (fixed div, pointer-events: none) en plaatst het kaartje erboven of eronder. Respecteert `env(safe-area-inset-top/bottom)`. Toont alleen iets als de huidige route overeenkomt met `step.route` en er een actief team-sessie is.

**Aanpassingen in bestaande bestanden (klein):**
- `src/components/BottomNav.tsx`: `data-tour="nav-meldingen"` op het Meldingen-item.
- `src/routes/meldingen.tsx`: `data-tour="mark-all-read"` op de knop; `emitTourEvent("notifications-all-read")` na een geslaagde `markAllRead()`.
- `src/routes/info.tsx`: `data-tour="rules"` op de accordeon-container.
- `src/routes/__root.tsx`: `<OnboardingTour />` mounten.

Geen databasewijzigingen, geen wijziging aan spel- of scorelogica.
