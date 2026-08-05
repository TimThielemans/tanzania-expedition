import { supabase, PHOTO_BUCKET } from "./supabase";
import { enqueue } from "./offline";
import { createNotification } from "./notifications";
import { compareTeams } from "./scoring";
import { fetchLocationChallengeStates, fetchLocationEvents, setLocationChallengeState } from "./locations";
import type {
  Answer,
  Challenge,
  LocationChallengeState,
  LocationEvent,
  PointAction,
  PointKind,
  Photo,
  QuizAnswer,
  RankedTeam,
  Score,
  Team,
  TeamProgress,
  Zone,
} from "./types";

/* ------------------------------ reads ------------------------------ */

export async function fetchSettings(): Promise<Record<string, string>> {
  const { data, error } = await supabase.from("game_settings").select("key, value");
  if (error) throw error;
  return Object.fromEntries((data ?? []).map((r) => [r.key as string, (r.value ?? "") as string]));
}

export async function fetchTeams(): Promise<Team[]> {
  const { data, error } = await supabase.from("teams").select("*").eq("active", true).order("sort_order").order("name");
  if (error) throw error;
  return (data ?? []) as Team[];
}

export async function fetchZones(): Promise<Zone[]> {
  const { data, error } = await supabase.from("zones").select("*").eq("active", true).order("order_index");
  if (error) throw error;
  return (data ?? []) as Zone[];
}

function mapChallenges(data: unknown[]): Challenge[] {
  return (data ?? []).map((c) => ({
    ...(c as Challenge),
    options: Array.isArray((c as Challenge).options) ? ((c as Challenge).options as string[]) : [],
  })) as Challenge[];
}

/** Actieve opdrachten (inclusief bonusopdrachten). */
export async function fetchChallenges(): Promise<Challenge[]> {
  const { data, error } = await supabase.from("challenges").select("*").eq("active", true).order("sort_order");
  if (error) throw error;
  return mapChallenges(data ?? []);
}

/** Alle opdrachten, ook uitgeschakelde — voor de admin. */
export async function fetchAllChallenges(): Promise<Challenge[]> {
  const { data, error } = await supabase.from("challenges").select("*").order("sort_order");
  if (error) throw error;
  return mapChallenges(data ?? []);
}

/** Loopt een bonusopdracht nog? */
export function bonusRemainingMs(challenge: Challenge, now = Date.now()): number {
  if (!challenge.is_bonus || !challenge.bonus_active || !challenge.bonus_started_at) return 0;
  const end = new Date(challenge.bonus_started_at).getTime() + challenge.duration_minutes * 60_000;
  return Math.max(0, end - now);
}

export function activeBonusChallenges(challenges: Challenge[], now = Date.now()): Challenge[] {
  return challenges.filter((c) => c.is_bonus && c.active && bonusRemainingMs(c, now) > 0);
}

/** Locatieopdrachten die voor dit team zijn vrijgekomen en nog open staan. */
export function openLocationChallenges(challenges: Challenge[], states: LocationChallengeState[]): Challenge[] {
  const open = new Set(states.filter((s) => s.state === "open").map((s) => s.challenge_id));
  return challenges.filter((c) => c.is_location && c.active && open.has(c.id));
}

/** Locatieopdrachten die bij een zone horen via hun locatie-event. */
export function locationChallengesOfZone(
  challenges: Challenge[],
  events: LocationEvent[],
  zoneId: string,
): Challenge[] {
  const eventIds = new Set(events.filter((e) => e.zone_id === zoneId).map((e) => e.id));
  return challenges.filter(
    (c) => c.is_location && c.active && c.location_event_id && eventIds.has(c.location_event_id),
  );
}

/** Opdrachten die in een zone horen (dus geen bonus- of locatieopdracht). */
export function zoneChallengesOf(challenges: Challenge[], zoneId: string): Challenge[] {
  return challenges.filter((c) => c.zone_id === zoneId && c.active && !c.is_bonus && !c.is_location);
}

/**
 * Alle opdrachten die een zone moet afronden voordat die als voltooid geldt:
 * de vaste zoneopdrachten plus élke actieve locatieopdracht van die zone,
 * behalve de opdrachten die dit team expliciet heeft weggeklikt (dismissed).
 * Bonusopdrachten en opdrachten/locatieopdrachten van andere zones tellen nooit mee.
 */
export function zoneCompletionChallenges(
  challenges: Challenge[],
  events: LocationEvent[],
  zoneId: string,
  states: LocationChallengeState[],
): Challenge[] {
  const dismissed = new Set(states.filter((s) => s.state === "dismissed").map((s) => s.challenge_id));
  return [
    ...zoneChallengesOf(challenges, zoneId),
    ...locationChallengesOfZone(challenges, events, zoneId).filter((c) => !dismissed.has(c.id)),
  ];
}

/**
 * Alle opdrachten die meetellen voor de X/Y-voortgang van een zone: de vaste
 * zoneopdrachten plus de locatieopdrachten van die zone die dit team al
 * geactiveerd heeft (afgewezen opdrachten tellen niet mee).
 */
export function zoneProgressChallenges(
  challenges: Challenge[],
  events: LocationEvent[],
  zoneId: string,
  states: LocationChallengeState[],
): Challenge[] {
  const counted = new Set(states.filter((s) => s.state !== "dismissed").map((s) => s.challenge_id));
  return [
    ...zoneChallengesOf(challenges, zoneId),
    ...locationChallengesOfZone(challenges, events, zoneId).filter((c) => counted.has(c.id)),
  ];
}

export async function fetchProgress(teamId?: string): Promise<TeamProgress[]> {
  let query = supabase.from("team_progress").select("*");
  if (teamId) query = query.eq("team_id", teamId);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as TeamProgress[];
}

export async function fetchAnswers(teamId?: string): Promise<Answer[]> {
  let query = supabase.from("answers").select("*").order("created_at", { ascending: false });
  if (teamId) query = query.eq("team_id", teamId);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as Answer[];
}

export async function fetchQuizAnswers(teamId?: string): Promise<QuizAnswer[]> {
  let query = supabase.from("quiz_answers").select("*").order("created_at", { ascending: false });
  if (teamId) query = query.eq("team_id", teamId);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as QuizAnswer[];
}

export async function fetchPhotos(teamId?: string): Promise<Photo[]> {
  let query = supabase.from("photos").select("*").order("created_at", { ascending: false });
  if (teamId) query = query.eq("team_id", teamId);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as Photo[];
}

export async function fetchScores(): Promise<Score[]> {
  const { data, error } = await supabase.from("scores").select("*");
  if (error) throw error;
  return (data ?? []) as Score[];
}

export async function fetchPointActions(): Promise<PointAction[]> {
  const { data, error } = await supabase.from("point_actions").select("*").eq("active", true).order("sort_order");
  if (error) throw error;
  return (data ?? []) as PointAction[];
}

export async function fetchRanking(): Promise<RankedTeam[]> {
  const [teams, scores] = await Promise.all([fetchTeams(), fetchScores()]);
  const byTeam = new Map(scores.map((s) => [s.team_id, s]));
  const rows: RankedTeam[] = teams.map((team) => {
    const score = byTeam.get(team.id);
    return {
      team,
      points: score?.points ?? 0,
      regularPoints: score?.regular_points ?? 0,
      bonusPoints: score?.bonus_points ?? 0,
      creativityPoints: score?.creativity_points ?? 0,
      lastScoredAt: score?.last_scored_at ?? new Date().toISOString(),
      rank: 0,
    };
  });
  // Volgorde + gelijke stand: zie src/lib/scoring.ts (TIEBREAKERS).
  rows.sort(compareTeams);
  return rows.map((row, index) => ({ ...row, rank: index + 1 }));
}

/* ------------------------------ login ------------------------------ */

export async function loginTeam(teamId: string, password: string): Promise<Team> {
  const { data, error } = await supabase.from("teams").select("*").eq("id", teamId).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Team niet gevonden.");
  if ((data.password ?? "").trim() !== password.trim()) throw new Error("Wachtwoord klopt niet.");
  return data as Team;
}

export async function verifyAdminPassword(password: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("admin_settings")
    .select("value")
    .eq("key", "admin_password")
    .maybeSingle();
  if (error) throw error;
  if (!data?.value) throw new Error("Er is nog geen admin_password ingesteld in admin_settings.");
  return data.value.trim() === password.trim();
}

/* ------------------------------ punten ------------------------------ */

/**
 * Kent punten toe in één van de drie categorieën.
 * Het totaal (scores.points) is altijd de som van gewoon + bonus + creativiteit.
 */
export async function addPoints(teamId: string, points: number, kind: PointKind = "regular") {
  const { error } = await supabase.rpc("add_points", {
    p_team_id: teamId,
    p_points: points,
    p_kind: kind,
  });
  if (error) throw error;
}

/* ------------------------------ zones ------------------------------ */

/** Een zone zonder wachtwoord opent automatisch zodra de vorige zone klaar is. */
export function zoneNeedsPassword(zone: Zone): boolean {
  return (zone.unlock_password ?? "").trim().length > 0;
}

export function sortZones(zones: Zone[]): Zone[] {
  return [...zones].sort((a, b) => a.order_index - b.order_index);
}

/** Bepaalt welke zones open staan voor een team. Zone 1 staat altijd open. */
export function unlockedZoneIds(zones: Zone[], progress: TeamProgress[]): Set<string> {
  const sorted = sortZones(zones);
  const byZone = new Map(progress.map((p) => [p.zone_id, p]));
  const open = new Set<string>();

  sorted.forEach((zone, index) => {
    if (index === 0) {
      open.add(zone.id);
      return;
    }
    if (byZone.get(zone.id)?.unlocked) {
      open.add(zone.id);
      return;
    }
    const previous = sorted[index - 1];
    if (!zoneNeedsPassword(zone) && byZone.get(previous.id)?.completed) open.add(zone.id);
  });

  return open;
}

/** Registreer het eerste team dat een zone bereikt en maak een globale melding. */
async function registerFirstUnlock(teamId: string, zone: Zone) {
  const { error } = await supabase.from("zone_first_unlocks").insert({ zone_id: zone.id, team_id: teamId });
  if (error) return; // al bezet door een sneller team
  const { data: team } = await supabase.from("teams").select("name").eq("id", teamId).maybeSingle();
  await createNotification({
    title: `🏆 ${team?.name ?? "Een team"} bereikte als eerste ${zone.name}!`,
    body: "Wie volgt? Zet de achtervolging in!",
    audience: "all",
    kind: "achievement",
  });
}

export async function setZoneUnlocked(teamId: string, zoneId: string, unlocked: boolean, zone?: Zone) {
  const { error } = await supabase.from("team_progress").upsert(
    {
      team_id: teamId,
      zone_id: zoneId,
      unlocked,
      unlocked_at: unlocked ? new Date().toISOString() : null,
    },
    { onConflict: "team_id,zone_id" },
  );
  if (error) throw error;
  if (unlocked && zone) await registerFirstUnlock(teamId, zone);
}

export async function unlockZoneWithPassword(teamId: string, zone: Zone, password: string) {
  if ((zone.unlock_password ?? "").trim().toLowerCase() !== password.trim().toLowerCase()) {
    throw new Error("Verkeerd wachtwoord voor deze zone.");
  }
  await setZoneUnlocked(teamId, zone.id, true, zone);
}

export interface ZoneCompletionEvent {
  zoneName: string;
  nextZoneName: string | null;
  nextNeedsPassword: boolean;
}

/**
 * Markeer voltooide zones. Zonder wachtwoord opent de volgende zone automatisch;
 * met wachtwoord krijgt de reisleider een melding om de antwoorden na te kijken.
 */
export async function refreshZoneCompletion(
  teamId: string,
  zones: Zone[],
  challenges: Challenge[],
): Promise<{ completedZones: string[]; events: ZoneCompletionEvent[] }> {
  const [answers, quiz, photos, existing, teamRow, locEvents, locStates] = await Promise.all([
    fetchAnswers(teamId),
    fetchQuizAnswers(teamId),
    fetchPhotos(teamId),
    fetchProgress(teamId),
    supabase.from("teams").select("name").eq("id", teamId).maybeSingle(),
    fetchLocationEvents(),
    fetchLocationChallengeStates(teamId),
  ]);
  const teamName = teamRow.data?.name ?? "Een team";
  const done = new Set<string>([
    ...answers.map((a) => a.challenge_id),
    ...quiz.map((a) => a.challenge_id),
    ...photos.map((p) => p.challenge_id),
  ]);
  const alreadyCompleted = new Set(existing.filter((p) => p.completed).map((p) => p.zone_id));

  const sorted = sortZones(zones);
  const completedZones: string[] = [];
  const events: ZoneCompletionEvent[] = [];

  for (const [index, zone] of sorted.entries()) {
    const zoneChallenges = zoneCompletionChallenges(challenges, locEvents, zone.id, locStates);
    const complete = zoneChallenges.length > 0 && zoneChallenges.every((c) => done.has(c.id));
    if (!complete) continue;

    completedZones.push(zone.id);
    const isNew = !alreadyCompleted.has(zone.id);

    await supabase.from("team_progress").upsert(
      {
        team_id: teamId,
        zone_id: zone.id,
        unlocked: true,
        completed: true,
        completed_at: new Date().toISOString(),
      },
      { onConflict: "team_id,zone_id" },
    );

    const next = sorted[index + 1] ?? null;
    const nextNeedsPassword = next ? zoneNeedsPassword(next) : false;

    if (next && !nextNeedsPassword) {
      await setZoneUnlocked(teamId, next.id, true, next);
    }

    if (isNew) {
      events.push({
        zoneName: zone.name,
        nextZoneName: next?.name ?? null,
        nextNeedsPassword,
      });
      if (nextNeedsPassword) {
        await createNotification({
          title: `✅ ${teamName} voltooide alle opdrachten in ${zone.name}.`,
          body: "Bekijk de antwoorden en beslis of de volgende zone geopend mag worden.",
          audience: "admin",
          teamId,
          kind: "review",
        });
      }
    }
  }
  return { completedZones, events };
}

/* ------------------------------ inzendingen ------------------------------ */

export interface SubmitContext {
  teamId: string;
  zoneId: string | null;
  challenge: Challenge;
}

/** Een ingezonden locatieopdracht verdwijnt uit de open lijst. */
async function markLocationSubmitted(teamId: string, challenge: Challenge) {
  if (!challenge.is_location) return;
  await setLocationChallengeState(teamId, challenge.id, "submitted");
}

export async function submitTextAnswer({ teamId, zoneId, challenge }: SubmitContext, answer: string) {
  // Met een correct antwoord in de database keuren we automatisch; anders kijkt de reisleider na.
  const expected = (challenge.correct_answer ?? "").trim();
  const auto = expected.length > 0;
  const correct = auto && expected.toLowerCase() === answer.trim().toLowerCase();
  const points = auto && correct ? challenge.points : 0;
  const payload = {
    team_id: teamId,
    zone_id: zoneId,
    challenge_id: challenge.id,
    answer,
    status: auto ? (correct ? "approved" : "rejected") : "pending",
    points_awarded: points,
  };
  try {
    const { error } = await supabase.from("answers").upsert(payload, { onConflict: "team_id,challenge_id" });
    if (error) throw error;
    if (points !== 0) await addPoints(teamId, points);
    await markLocationSubmitted(teamId, challenge);
    if (zoneId) {
      await maybeDeliverZoneCode(teamId, zoneId);
    }
  } catch (err) {
    enqueue({ kind: "answer", payload, points, teamId });
    throw new OfflineQueuedError(err);
  }
}

export async function submitQuizAnswer({ teamId, zoneId, challenge }: SubmitContext, option: string) {
  const isCorrect = challenge.correct_answer ? challenge.correct_answer.trim() === option.trim() : null;
  const points = isCorrect === true ? challenge.points : 0;
  const payload = {
    team_id: teamId,
    zone_id: zoneId,
    challenge_id: challenge.id,
    selected_option: option,
    is_correct: isCorrect,
    status: isCorrect === null ? "pending" : isCorrect ? "approved" : "rejected",
    points_awarded: points,
  };
  try {
    const { error } = await supabase.from("quiz_answers").upsert(payload, { onConflict: "team_id,challenge_id" });
    if (error) throw error;
    if (points !== 0) await addPoints(teamId, points);
    await markLocationSubmitted(teamId, challenge);
    if (zoneId) {
      await maybeDeliverZoneCode(teamId, zoneId);
    }
  } catch (err) {
    enqueue({ kind: "quiz", payload, points, teamId });
    throw new OfflineQueuedError(err);
  }
}

export async function uploadPhoto({ teamId, zoneId, challenge }: SubmitContext, file: File) {
  const ext = file.name.split(".").pop() ?? "jpg";
  const path = `${teamId}/${challenge.id}-${Date.now()}.${ext}`;
  const { error: uploadError } = await supabase.storage
    .from(PHOTO_BUCKET)
    .upload(path, file, { upsert: true, contentType: file.type || "image/jpeg" });
  if (uploadError) throw uploadError;

  const { data } = supabase.storage.from(PHOTO_BUCKET).getPublicUrl(path);
  const { error } = await supabase.from("photos").insert({
    team_id: teamId,
    zone_id: zoneId,
    challenge_id: challenge.id,
    photo_url: data.publicUrl,
    storage_path: path,
    status: "pending",
    points_awarded: 0,
  });
  if (error) throw error;
  await markLocationSubmitted(teamId, challenge);
  if (zoneId) {
    await maybeDeliverZoneCode(teamId, zoneId);
  }
  // Foto's leveren pas punten op na goedkeuring door de reisleider.
  return data.publicUrl;
}

/** Antwoord staat lokaal klaar en wordt gesynct zodra er weer verbinding is. */
export class OfflineQueuedError extends Error {
  constructor(public cause: unknown) {
    super("Geen verbinding — je antwoord is lokaal bewaard en wordt automatisch verstuurd.");
    this.name = "OfflineQueuedError";
  }
}
