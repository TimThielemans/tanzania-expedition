import { useEffect, useRef, useState } from "react";
import { distanceMeters, processGeofences, saveTeamLocation } from "@/lib/locations";
import type { LocationEvent } from "@/lib/types";

const MIN_INTERVAL_MS = 20_000;
const MIN_DISTANCE_M = 20;

export type LocationPermission = "unknown" | "granted" | "denied" | "unsupported";

interface Options {
  team: { id: string; name: string } | null;
  /** Reisleider zet tracking globaal aan of uit. */
  trackingEnabled: boolean;
  /** Team gaf toestemming op dit toestel. */
  consented: boolean;
  events: LocationEvent[];
  onTriggered?: () => void;
}

/**
 * Deelt de locatie van het team enkel wanneer:
 * ingelogd + toestemming gegeven + tabblad actief + tracking aan door de reisleider.
 * Schrijft maximaal één update per 20 seconden en enkel na 20 meter verplaatsing.
 */
export function useLocationTracking({
  team,
  trackingEnabled,
  consented,
  events,
  onTriggered,
}: Options) {
  const [permission, setPermission] = useState<LocationPermission>("unknown");
  const last = useRef<{ latitude: number; longitude: number; at: number } | null>(null);
  const eventsRef = useRef(events);
  eventsRef.current = events;
  const triggeredRef = useRef(onTriggered);
  triggeredRef.current = onTriggered;

  useEffect(() => {
    if (!team || !trackingEnabled || !consented) return;
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setPermission("unsupported");
      return;
    }

    let watchId: number | null = null;
    let stopped = false;

    const handle = (pos: GeolocationPosition) => {
      setPermission("granted");
      if (document.visibilityState !== "visible") return;
      const now = Date.now();
      const next = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
      const prev = last.current;
      if (prev && now - prev.at < MIN_INTERVAL_MS) return;
      if (prev && distanceMeters(prev, next) < MIN_DISTANCE_M) return;
      last.current = { ...next, at: now };
      void (async () => {
        try {
          await saveTeamLocation(team.id, { ...next, accuracy: pos.coords.accuracy });
          const fired = await processGeofences(team, next, eventsRef.current);
          if (fired > 0) triggeredRef.current?.();
        } catch {
          /* offline of geweigerd: stil negeren */
        }
      })();
    };

    const start = () => {
      if (stopped || watchId !== null) return;
      watchId = navigator.geolocation.watchPosition(
        handle,
        (err) => setPermission(err.code === err.PERMISSION_DENIED ? "denied" : "unknown"),
        { enableHighAccuracy: true, maximumAge: 10_000, timeout: 30_000 },
      );
    };

    const stop = () => {
      if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
        watchId = null;
      }
    };

    const onVisibility = () => (document.visibilityState === "visible" ? start() : stop());

    start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stopped = true;
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [team?.id, team?.name, trackingEnabled, consented]);

  return { permission };
}

/** Vraagt eenmalig toestemming; het antwoord onthouden we in localStorage. */
export function requestLocationPermission(): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return resolve(false);
    navigator.geolocation.getCurrentPosition(
      () => resolve(true),
      () => resolve(false),
      { enableHighAccuracy: true, timeout: 15_000 },
    );
  });
}
