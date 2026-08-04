import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  claimTrackingDevice,
  distanceMeters,
  fetchTrackingDevice,
  processGeofences,
  saveTeamLocation,
} from "@/lib/locations";
import { getDeviceId } from "@/lib/device";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import type { LocationEvent } from "@/lib/types";

const MIN_INTERVAL_MS = 10_000;
const MIN_DISTANCE_M = 10;
const MAX_INTERVAL_MS = 30_000;

export type LocationPermission = "unknown" | "granted" | "denied" | "unsupported";

interface Options {
  team: { id: string; name: string } | null;
  /** Reisleider zet tracking globaal aan of uit. */
  trackingEnabled: boolean;
  /** Team gaf toestemming op dit toestel. */
  consented: boolean;
  events: LocationEvent[];
  /** Zones waarmee het team nu bezig is — bepaalt welke events kunnen vuren. */
  activeZoneIds?: string[];
  onTriggered?: () => void;
}

/**
 * Deelt de locatie van het team enkel wanneer:
 * ingelogd + toestemming gegeven + tabblad actief + tracking aan door de reisleider.
 * Schrijft maximaal één update per 20 seconden en enkel na 20 meter verplaatsing.
 */
export function useLocationTracking({ team, trackingEnabled, consented, events, activeZoneIds, onTriggered }: Options) {
  const [permission, setPermission] = useState<LocationPermission>("unknown");
  const [isTracker, setIsTracker] = useState<boolean | null>(null);
  /** Was dit toestel de locatiedeler? Bepaalt of we een overnamemelding tonen. */
  const wasTrackerRef = useRef(false);
  if (isTracker === true) wasTrackerRef.current = true;
  const deviceId = typeof window === "undefined" ? "server" : getDeviceId();

  const zonesRef = useRef(activeZoneIds ?? []);
  zonesRef.current = activeZoneIds ?? [];
  const last = useRef<{ latitude: number; longitude: number; at: number } | null>(null);
  const eventsRef = useRef(events);
  eventsRef.current = events;
  const triggeredRef = useRef(onTriggered);
  triggeredRef.current = onTriggered;

  // Het eerste toestel dat meedoet wordt automatisch de locatiedeler.
  useEffect(() => {
    if (!team || !trackingEnabled || !consented) return;
    let cancelled = false;
    void (async () => {
      try {
        await claimTrackingDevice(team.id, deviceId, false);
        const current = await fetchTrackingDevice(team.id);
        if (!cancelled) setIsTracker(current?.device_id === deviceId);
      } catch {
        if (!cancelled) setIsTracker(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [team?.id, trackingEnabled, consented, deviceId]);

  // Neemt een ander toestel het over? Dan meldt dit toestel dat het stopt.
  useEffect(() => {
    if (!team || !isSupabaseConfigured || !consented) return;
    const teamId = team.id;

    const apply = (owner: string | null | undefined) => {
      const mine = owner === deviceId;
      setIsTracker(mine);
      if (!mine && wasTrackerRef.current) {
        toast("📍 Een ander toestel deelt nu de locatie voor jouw team.", { duration: 8000 });
      }
      wasTrackerRef.current = mine;
    };

    const channel = supabase
      .channel(`tracking-owner-${teamId}-${deviceId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "team_tracking_devices",
          filter: `team_id=eq.${teamId}`,
        },
        (payload) => {
          const row = (payload.new ?? payload.old) as { device_id?: string } | null;
          apply(row?.device_id);
        },
      )
      .subscribe();

    // Vangnet als realtime even niet doorkomt.
    const interval = window.setInterval(() => {
      void fetchTrackingDevice(teamId)
        .then((current) => apply(current?.device_id))
        .catch(() => undefined);
    }, 30_000);

    return () => {
      window.clearInterval(interval);
      void supabase.removeChannel(channel);
    };
  }, [team?.id, consented, deviceId]);

  useEffect(() => {
    if (!team || !trackingEnabled || !consented || isTracker !== true) return;
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setPermission("unsupported");
      return;
    }

    let watchId: number | null = null;
    let stopped = false;

    const handle = (pos: GeolocationPosition) => {
      setPermission("granted");
      //if (document.visibilityState !== "visible") return;
      if (pos.coords.accuracy > 60) return; //Don't use inaccurate data
      const now = Date.now();
      const next = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
      const prev = last.current;

      const elapsed = prev ? now - prev.at : Infinity;
      const distance = prev ? distanceMeters(prev, next) : Infinity;
      const forceUpdate = elapsed >= MAX_INTERVAL_MS;

      if (prev && !forceUpdate && elapsed < MIN_INTERVAL_MS && distance < MIN_DISTANCE_M) {
        return;
      }

      if (prev && now - prev.at < MIN_INTERVAL_MS && distanceMeters(prev, next) < MIN_DISTANCE_M) {
        return;
      }
      last.current = { ...next, at: now };
      void (async () => {
        try {
          await saveTeamLocation(team.id, { ...next, accuracy: pos.coords.accuracy });
          const fired = await processGeofences({ ...team, activeZoneIds: zonesRef.current }, next, eventsRef.current);
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
  }, [team?.id, team?.name, trackingEnabled, consented, isTracker]);

  /** Dit toestel de rol van locatiedeler laten overnemen. */
  const takeOver = async () => {
    if (!team) return false;
    await claimTrackingDevice(team.id, deviceId, true);
    setIsTracker(true);
    return true;
  };

  return { permission, isTracker, deviceId, takeOver };
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
