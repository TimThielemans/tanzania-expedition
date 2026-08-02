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
    id: "welcome",
    route: "/",
    target: "nav-meldingen",
    placement: "top",
    title: "👋 Welkom {team} in Tanzania!",
    body: "Je hebt net een belangrijke melding ontvangen. Ga eerst naar het tabblad Meldingen.",
    action: { label: "Naar Meldingen", goTo: "/meldingen" },
  },
  {
    id: "read-notifications",
    route: "/meldingen",
    target: "mark-all-read",
    placement: "bottom",
    title: "Je eerste bericht",
    body: "Open je nieuwe bericht en markeer daarna alle meldingen als gelezen.",
    advanceOn: "notifications-all-read",
  },
  {
    id: "to-rules",
    route: "/meldingen",
    target: null,
    placement: "bottom",
    title: "Goed bezig! 🎉",
    body: "Ga nu naar Speluitleg om te ontdekken hoe het spel werkt.",
    action: { label: "Naar Speluitleg", goTo: "/info" },
  },
  {
    id: "rules",
    route: "/info",
    target: "rules",
    placement: "top",
    title: "Speluitleg",
    body: "Lees rustig de speluitleg door. Wanneer je klaar bent, gaan we naar het startscherm.",
    action: { label: "Naar Home", goTo: "/" },
  },
  {
    id: "home-team",
    route: "/",
    target: "team-bar",
    placement: "bottom",
    title: "Jouw team",
    body: "Hier zie je jouw teaminformatie en voortgang tijdens het avontuur.",
    action: { label: "Volgende" },
  },
  {
    id: "home-location",
    route: "/",
    target: "location-share",
    optional: true,
    placement: "bottom",
    title: "Locatie delen",
    body: "Deel hier de locatie van je team. Zo kunnen locatie-opdrachten automatisch verschijnen wanneer jullie belangrijke plaatsen bereiken. Gebruik je later een ander toestel? Dan kan dat toestel de locatie-overdracht overnemen.",
    action: { label: "Volgende" },
  },
  {
    id: "home-zones",
    route: "/",
    target: "zones",
    placement: "top",
    title: "Hier begint jullie avontuur",
    body: "Open een zone, voltooi opdrachten en ontdek stap voor stap het verhaal. Je kan steeds terug naar home als er nieuwe zones zijn ontgrendeld. Veel succes en vooral veel plezier! 🇹🇿",
    action: { label: "Start het avontuur" },
  },
];

const DONE = "done";
const key = (teamId: string) => `bow-onboarding:${teamId}`;

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
