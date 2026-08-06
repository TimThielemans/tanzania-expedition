import { useCallback, useEffect, useState } from "react";

/**
 * ARRIVAL — eenmalig "BOW Airlines"-landingsscherm per team + toestel.
 *
 * AANPASSEN: alle tekst, checkpoints, knoplabel en het tempo staan in
 * ARRIVAL_SCRIPT hieronder. Verhoog ARRIVAL_VERSION om het scherm opnieuw
 * te tonen aan iedereen (ook aan teams die het al zagen).
 */
export const ARRIVAL_SCRIPT = {
  /** Kop van het boardingpass. */
  airline: "BOW AIRLINES",
  /** Route-regel onder de kop. */
  route: "BRU → JRO",
  /** Aankondiging van de cabinecrew — elke regel verschijnt na de vorige. */
  lines: [
    "Good afternoon and welcome aboard BOW Airlines flight BOWDA26 from Brussels to Kilimanjaro International Airport.",
    "Our expected flight time today is approximately 9 seconds, with favourable conditions all the way to Tanzania.",
    "During this journey you will be travelling through mountain bike trails, the slopes of Mount Meru, the wildlife of the African savannah and finally the tropical beaches of Zanzibar.",
    "Please remain seated until the aircraft has come to a complete stop and the Touch Down button has illuminated.",
    "On behalf of captain Lotte and the entire cabin crew, we wish you a pleasant flight and an excellent adventure in Tanzania.",
    "Hakuna Matata!",
  ],
  /** Statusregels die één per één afgevinkt verschijnen. */
  checkpoints: [
    "Boarding completed",
    "Cruising altitude reached",
    "Mount Kilimanjaro spotted",
    "Descent initiated",
  ],
  /** Slotregel boven de knop. */
  arrivalLabel: "🛬 Welcome to Tanzania",
  /** Label van de knop die naar Home gaat. */
  buttonLabel: "TOUCH DOWN",
  /** Tempo (ms). */
  timing: {
    /** Tijd per teken van de typewriter. */
    charDelay: 18,
    /** Pauze tussen twee aankondigingsregels. */
    linePause: 700,
    /** Pauze tussen twee checkpoints. */
    checkpointPause: 900,
  },
} as const;

const ARRIVAL_VERSION = "v1";
const DONE = "done";

const key = (teamId: string) => `bow-arrival:${ARRIVAL_VERSION}:${teamId}`;

const listeners = new Set<() => void>();

/** Heeft dit team op dit toestel het landingsscherm al gezien? */
export function arrivalDone(teamId: string): boolean {
  if (typeof window === "undefined") return true;
  return window.localStorage.getItem(key(teamId)) === DONE;
}

export function completeArrival(teamId: string) {
  window.localStorage.setItem(key(teamId), DONE);
  listeners.forEach((l) => l());
}

/** Status van het landingsscherm voor dit team op dit toestel. */
export function useArrival(teamId: string | null) {
  const [done, setDone] = useState(true);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (!teamId) {
      setDone(true);
      setHydrated(true);
      return;
    }
    const sync = () => setDone(arrivalDone(teamId));
    sync();
    setHydrated(true);
    listeners.add(sync);
    const onStorage = () => sync();
    window.addEventListener("storage", onStorage);
    return () => {
      listeners.delete(sync);
      window.removeEventListener("storage", onStorage);
    };
  }, [teamId]);

  const complete = useCallback(() => {
    if (teamId) completeArrival(teamId);
  }, [teamId]);

  return { done, hydrated, complete };
}
