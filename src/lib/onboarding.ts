import { useCallback, useEffect, useState } from "react";

/**
 * ONBOARDING — eenmalige coach-mark tour per team + toestel.
 *
 * UITBREIDEN: voeg een object toe aan ONBOARDING_STEPS (of verplaats het) —
 * de volgorde van de array is de volgorde van de tour.
 *
 *  id        unieke sleutel (wordt in localStorage bewaard)
 *  route     op welke pagina de stap zichtbaar is ("/", "/meldingen", "/info")
 *  target    data-tour attribuut van het element dat oplicht, of null
 *  optional  true = stap overslaan als het target niet op het scherm staat
 *  placement "top" | "bottom" — waar het kaartje ten opzichte van het target komt
 *  title     kop (mag {team} bevatten)
 *  body      tekst (mag {team} bevatten)
 *  action    { label, goTo? } — knop die doorgaat (en eventueel navigeert)
 *  advanceOn naam van een event waarop de stap automatisch doorgaat,
 *            uitgestuurd met emitTourEvent("naam") op de plek van de actie
 */
export interface OnboardingStep {
  id: string;
  route: string;
  target: string | null;
  optional?: boolean;
  placement: "top" | "bottom";
  title: string;
  body: string;
  action?: { label: string; goTo?: string };
  advanceOn?: string;
}

export const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    id: "karibu",
    route: "/",
    target: null,
    placement: "top",
    title: "👋 Karibu {team}!",
    body: "Welkom in Tanzania, een prachtig land waar zoveel unieke dingen te zien en toffe activiteiten te beleven zijn! Deze namiddag herbeleven we samen mijn 3-weekse trip daar.",
    action: { label: "Ik ben benieuwd" },
  },

  {
    id: "spelopzet",
    route: "/",
    target: "zones",
    placement: "top",
    title: "Het reisschema",
    body: "Onze reis laat zich in 4 etappes verdelen: eerst gaan we mountainbiken, daarna beklimmen we Mount Meru (de toffe versie van Kilimanjaro), een safari kan nadien niet ontbreken in Tanzania, en afsluiten doen we op Zanzibar. In elke zone zullen jullie enkele opdrachten moeten voltooien voordat jullie de volgende etappe kunnen ontdekken.",
    action: { label: "Tof, hoe win ik?" },
  },

  {
    id: "home-team",
    route: "/",
    target: "team-bar",
    placement: "bottom",
    title: "Puntentelling",
    body: "Elke opdracht kan puntjes opleveren en hier zie je steeds een overzicht van je aantal behaalde punten. Als je op de banner klikt, ontdek je ook de live tussenstand en zie je hoeveel leuker jouw vakantie momenteel is dan die van de andere groepen.",
    action: { label: "Volgende" },
  },
  {
    id: "home-location",
    route: "/",
    target: "location-share",
    optional: true,
    placement: "bottom",
    title: "Locatie delen",
    body: "Deel hier de locatie van je team. Zo kunnen locatie-opdrachten automatisch verschijnen wanneer jullie belangrijke plaatsen bereiken. Slechts één toestel per team deelt de locatie, maar je kan hier altijd wisselen van toestel.",
    action: { label: "Naar de Map", goTo: "/statistieken" },
  },
  {
    id: "home-navigatie",
    route: "/statistieken",
    target: "nav-map",
    optional: true,
    placement: "top",
    title: "Controleer GPS status",
    body: "Op deze Map-pagina kan je controleren of jullie locatie correct wordt doorgestuurd. GPS is nooit perfect nauwkeurig en wordt bewust niet elke seconde vernieuwd om batterij en dataverbruik te beperken.",
    action: { label: "Vertel eens over dat rode bolletje", goTo: "/meldingen" },
  },

  {
    id: "meldingen",
    route: "/meldingen",
    target: "nav-meldingen",
    placement: "bottom",
    title: "Meldingen",
    body: "Ah eindelijk heb ik je aandacht! Hier lees je berichten van je reisleider. Nieuwe berichten vallen extra op en verdwijnen uit de aandacht zodra iemand van je team ze heeft gelezen.",
    action: { label: "Ik wil beginnen aan de reis!", goTo: "/info" },
  },

  {
    id: "info",
    route: "/info",
    target: "nav-info",
    placement: "top",
    title: "Pole Pole",
    body: "Voor ik jullie loslaat in Tanzania moet ik toch nog even de saaie verantwoordelijke uithangen. Hier vind je alle info over het spel. Hopelijk wijst alles zichzelf wel uit maar even diagonaal doorlezen kan geen kwaad. Herken je trouwens al de woordjes Swahili? Dat wordt misschien nog wel belangrijk...",
    action: { label: "Alsof uw uitleg ons interesseert, let's go.", goTo: "/" },
  },

  {
    id: "start",
    route: "/",
    target: "first-zone",
    placement: "top",
    title: "Hakuna Matata",
    body: "Daar ben ik me van bewust... Gooi de beentjes maar los in de MTB zone, voltooi de opdrachten en ontdek stap voor stap het verhaal. Keer af en toe terug naar Home om te kijken of er nieuwe bonusopdrachten of zones zijn ontgrendeld. Veel succes, vooral veel plezier en tot in Zanzibar! 🇹🇿",
    action: { label: "Twende! (Let's go)" },
  },
];

const DONE = "done";
const ONBOARDING_VERSION = "0v3";

const key = (teamId: string) => `bow-onboarding:${ONBOARDING_VERSION}:${teamId}`;

const listeners = new Set<() => void>();
const tourEvents = new Set<(name: string) => void>();

function read(teamId: string): string {
  if (typeof window === "undefined") return DONE;
  return window.localStorage.getItem(key(teamId)) ?? ONBOARDING_STEPS[0].id;
}

function write(teamId: string, value: string) {
  window.localStorage.setItem(key(teamId), value);
  listeners.forEach((l) => l());
}

/** Signaal dat een stap met `advanceOn` mag doorgaan. */
export function emitTourEvent(name: string) {
  tourEvents.forEach((l) => l(name));
}

/** Actieve onboardingstap voor dit team op dit toestel. */
export function useOnboarding(teamId: string | null) {
  const [stepId, setStepId] = useState<string>(DONE);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (!teamId) {
      setStepId(DONE);
      setHydrated(true);
      return;
    }
    const sync = () => setStepId(read(teamId));
    sync();
    setHydrated(true);
    listeners.add(sync);
    return () => {
      listeners.delete(sync);
    };
  }, [teamId]);

  const index = ONBOARDING_STEPS.findIndex((s) => s.id === stepId);
  const step = index >= 0 ? ONBOARDING_STEPS[index] : null;

  const next = useCallback(() => {
    if (!teamId) return;
    const i = ONBOARDING_STEPS.findIndex((s) => s.id === read(teamId));
    const following = i >= 0 ? ONBOARDING_STEPS[i + 1] : undefined;
    write(teamId, following ? following.id : DONE);
  }, [teamId]);

  const skip = useCallback(() => {
    if (teamId) write(teamId, DONE);
  }, [teamId]);

  useEffect(() => {
    if (!step?.advanceOn) return;
    const listener = (name: string) => {
      if (name === step.advanceOn) next();
    };
    tourEvents.add(listener);
    return () => {
      tourEvents.delete(listener);
    };
  }, [step?.advanceOn, step, next]);

  return { step, hydrated, next, skip };
}
