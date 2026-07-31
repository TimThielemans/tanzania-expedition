import { supabase } from "./supabase";
import { createNotification } from "./notifications";
import type {
  LocationChallengeState,
  LocationChallengeStateValue,
  LocationEvent,
  LocationEventTrigger,
  TeamLocation,
  TeamTrackingDevice,
} from "./types";

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

/* --------------------------- trackingtoestel --------------------------- */

export async function fetchTrackingDevices(): Promise<TeamTrackingDevice[]> {
  const { data, error } = await supabase.from("team_tracking_devices").select("*");
  if (error) throw error;
  return (data ?? []) as TeamTrackingDevice[];
}

export async function fetchTrackingDevice(teamId: string): Promise<TeamTrackingDevice | null> {
  const { data, error } = await supabase
    .from("team_tracking_devices")
    .select("*")
    .eq("team_id", teamId)
    .maybeSingle();
  if (error) throw error;
  return (data as TeamTrackingDevice) ?? null;
}

/**
 * Claimt de rol van locatiedeler voor dit toestel.
 * `force = false` claimt enkel als nog geen ander toestel de rol heeft
 * (automatisch bij de eerste login). `force = true` neemt de rol over.
 */
export async function claimTrackingDevice(teamId: string, deviceId: string, force = false) {
  const existing = await fetchTrackingDevice(teamId);
  if (existing && existing.device_id === deviceId) return true;
  if (existing && !force) return false;

  const { error } = await supabase.from("team_tracking_devices").upsert(
    { team_id: teamId, device_id: deviceId, claimed_at: new Date().toISOString() },
    { onConflict: "team_id" },
  );
  if (error) throw error;
  return true;
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

export const emptyLocationEvent: LocationEventInput = {
  name: "",
  description: null,
  latitude: 0,
  longitude: 0,
  radius_meters: 75,
  trigger_mode: "every",
  notification_target: "team",
  notification_message: null,
  zone_id: null,
  active: true,
};

export async function createLocationEvent(input: LocationEventInput) {
  const { data, error } = await supabase.from("location_events").insert(input).select("id").single();
  if (error) throw error;
  return data.id as string;
}

export async function updateLocationEvent(id: string, values: Partial<LocationEventInput>) {
  const { error } = await supabase.from("location_events").update(values).eq("id", id);
  if (error) throw error;
}

export async function deleteLocationEvent(id: string) {
  const { error } = await supabase.from("location_events").delete().eq("id", id);
  if (error) throw error;
}

/* --------------------------- locatieopdrachtstatus --------------------------- */

export async function fetchLocationChallengeStates(
  teamId?: string,
): Promise<LocationChallengeState[]> {
  let query = supabase.from("location_challenge_states").select("*");
  if (teamId) query = query.eq("team_id", teamId);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as LocationChallengeState[];
}

export async function setLocationChallengeState(
  teamId: string,
  challengeId: string,
  state: LocationChallengeStateValue,
) {
  const { error } = await supabase.from("location_challenge_states").upsert(
    { team_id: teamId, challenge_id: challengeId, state },
    { onConflict: "team_id,challenge_id" },
  );
  if (error) throw error;
}

/* ------------------------------ geofencing ------------------------------ */

interface GeofenceTeam {
  id: string;
  name: string;
  /** Zones waar het team momenteel mee bezig is (ontgrendeld en niet afgerond). */
  activeZoneIds?: string[];
}

/**
 * Controleert of een team binnen de straal van een actief event komt en voert
 * dan de bijhorende actie uit. Elk event vuurt maximaal één keer per team
 * ('every') of één keer in totaal ('first'). Events met een zonebeperking
 * vuren enkel wanneer het team met die zone bezig is.
 */
export async function processGeofences(
  team: GeofenceTeam,
  position: { latitude: number; longitude: number },
  events: LocationEvent[],
): Promise<number> {
  let fired = 0;
  for (const event of events) {
    if (!event.active) continue;
    if (event.zone_id && !(team.activeZoneIds ?? []).includes(event.zone_id)) continue;
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

/** De opdracht die aan dit event hangt (indien er één is). */
async function challengeForEvent(eventId: string) {
  const { data } = await supabase
    .from("challenges")
    .select("id, title, description, active")
    .eq("location_event_id", eventId)
    .maybeSingle();
  return data as { id: string; title: string; description: string | null; active: boolean } | null;
}

async function runTriggerAction(team: GeofenceTeam, event: LocationEvent) {
  const message = (event.notification_message ?? "").trim() || event.description || "";

  switch (event.notification_target) {
    case "admin":
      await createNotification({
        title: `📍 ${team.name} bereikte ${event.name}`,
        body: message || null,
        audience: "admin",
        teamId: team.id,
        kind: "location",
      });
      break;
    case "all":
      await createNotification({
        title: `📍 ${event.name}`,
        body: message || null,
        audience: "all",
        kind: "location",
      });
      break;
    default:
      await createNotification({
        title: `📍 ${event.name}`,
        body: message || null,
        audience: "team",
        teamId: team.id,
        kind: "location",
      });
  }

  // Hangt er een opdracht aan dit event? Dan komt die nu vrij voor dit team.
  const challenge = await challengeForEvent(event.id);
  if (challenge?.active) {
    await setLocationChallengeState(team.id, challenge.id, "open");
    await createNotification({
      title: `📍 Locatieopdracht: ${challenge.title}`,
      body: challenge.description ?? "Open de app — er staat een opdracht klaar.",
      audience: "team",
      teamId: team.id,
      kind: "location",
    });
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

/**
 * Koppelt een bestaande opdracht aan een locatie-event (of maakt de koppeling
 * los). Eén event heeft maximaal één opdracht — de database dwingt dat af.
 */
export async function linkChallengeToEvent(challengeId: string, eventId: string | null) {
  const { error } = await supabase
    .from("challenges")
    .update({
      location_event_id: eventId,
      is_location: eventId !== null,
      zone_id: null,
    })
    .eq("id", challengeId);
  if (error) throw error;
}
