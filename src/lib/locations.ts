import { supabase } from "./supabase";
import { createNotification } from "./notifications";
import type { LocationEvent, LocationEventTrigger, TeamLocation } from "./types";

/* ------------------------------ afstand ------------------------------ */

/** Afstand tussen twee coördinaten in meter (haversine). */
export function distanceMeters(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(h));
}

/* ------------------------------ teamlocaties ------------------------------ */

export async function fetchTeamLocations(): Promise<TeamLocation[]> {
  const { data, error } = await supabase.from("team_locations").select("*");
  if (error) throw error;
  return (data ?? []) as TeamLocation[];
}

/** Bewaart enkel de laatste positie van een team (geen historiek). */
export async function saveTeamLocation(
  teamId: string,
  position: { latitude: number; longitude: number; accuracy?: number | null },
) {
  const { error } = await supabase.from("team_locations").upsert(
    {
      team_id: teamId,
      latitude: position.latitude,
      longitude: position.longitude,
      accuracy: position.accuracy ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "team_id" },
  );
  if (error) throw error;
}

/* ------------------------------ locatie-events ------------------------------ */

export async function fetchLocationEvents(): Promise<LocationEvent[]> {
  const { data, error } = await supabase
    .from("location_events")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as LocationEvent[];
}

export async function fetchLocationTriggers(): Promise<LocationEventTrigger[]> {
  const { data, error } = await supabase.from("location_event_triggers").select("*");
  if (error) throw error;
  return (data ?? []) as LocationEventTrigger[];
}

export type LocationEventInput = Omit<LocationEvent, "id" | "created_at">;

export async function createLocationEvent(input: LocationEventInput) {
  const { error } = await supabase.from("location_events").insert(input);
  if (error) throw error;
}

export async function updateLocationEvent(id: string, values: Partial<LocationEventInput>) {
  const { error } = await supabase.from("location_events").update(values).eq("id", id);
  if (error) throw error;
}

export async function deleteLocationEvent(id: string) {
  const { error } = await supabase.from("location_events").delete().eq("id", id);
  if (error) throw error;
}

/* ------------------------------ geofencing ------------------------------ */

/**
 * Controleert of een team binnen de straal van een actief event komt en voert
 * dan de bijhorende actie uit. Elk event vuurt maximaal één keer per team
 * ('every') of één keer in totaal ('first').
 */
export async function processGeofences(
  team: { id: string; name: string },
  position: { latitude: number; longitude: number },
  events: LocationEvent[],
): Promise<number> {
  let fired = 0;
  for (const event of events) {
    if (!event.active) continue;
    if (distanceMeters(position, event) > event.radius_meters) continue;

    // Uniciteit zit in de database: dubbele triggers worden geweigerd.
    const { error } = await supabase.from("location_event_triggers").insert({
      event_id: event.id,
      team_id: team.id,
      is_first: event.trigger_mode === "first",
    });
    if (error) continue;

    await runTriggerAction(team, event);
    fired += 1;
  }
  return fired;
}

async function runTriggerAction(team: { id: string; name: string }, event: LocationEvent) {
  const message = (event.notification_message ?? "").trim() || event.description || "";

  switch (event.trigger_type) {
    case "team_notification":
      await createNotification({
        title: `📍 ${event.name}`,
        body: message || null,
        audience: "team",
        teamId: team.id,
        kind: "location",
      });
      break;

    case "admin_notification":
      await createNotification({
        title: `📍 ${team.name} bereikte ${event.name}`,
        body: message || null,
        audience: "admin",
        teamId: team.id,
        kind: "location",
      });
      break;

    case "global_notification":
      await createNotification({
        title: `📍 ${event.name}`,
        body: message || null,
        audience: "all",
        kind: "location",
      });
      break;

    case "location_challenge": {
      const { error } = await supabase.from("challenges").insert({
        zone_id: null,
        title: event.challenge_title ?? event.name,
        description: event.challenge_description ?? event.description,
        challenge_type: event.challenge_type,
        options: [],
        points: event.points,
        creativity_bonus_points: 0,
        active: true,
        is_bonus: false,
        is_location: true,
        target_team_id: team.id,
        location_event_id: event.id,
      });
      if (error) throw error;
      await createNotification({
        title: `📍 Locatieopdracht: ${event.challenge_title ?? event.name}`,
        body: event.challenge_description ?? message || "Open de app — er staat een opdracht klaar.",
        audience: "team",
        teamId: team.id,
        kind: "location",
      });
      break;
    }
  }

  // Eerste team op de locatie: iedereen mag het weten.
  if (event.trigger_mode === "first") {
    await createNotification({
      title: `🏆 ${team.name} bereikte als eerste ${event.name}!`,
      body: "Wie volgt?",
      audience: "all",
      kind: "achievement",
    });
  }
}
