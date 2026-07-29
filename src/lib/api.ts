import { supabase, PHOTO_BUCKET } from "./supabase";
import { enqueue } from "./offline";
import type {
  Answer,
  Challenge,
  PointAction,
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
  const { data, error } = await supabase
    .from("teams")
    .select("*")
    .eq("active", true)
    .order("sort_order")
    .order("name");
  if (error) throw error;
  return (data ?? []) as Team[];
}

export async function fetchZones(): Promise<Zone[]> {
  const { data, error } = await supabase.from("zones").select("*").eq("active", true).order("order_index");
  if (error) throw error;
  return (data ?? []) as Zone[];
}

export async function fetchChallenges(): Promise<Challenge[]> {
  const { data, error } = await supabase
    .from("challenges")
    .select("*")
    .eq("active", true)
    .order("sort_order");
  if (error) throw error;
  return (data ?? []).map((c) => ({
    ...c,
    options: Array.isArray(c.options) ? (c.options as string[]) : [],
  })) as Challenge[];
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
  const { data, error } = await supabase
    .from("point_actions")
    .select("*")
    .eq("active", true)
    .order("sort_order");
  if (error) throw error;
  return (data ?? []) as PointAction[];
}

export async function fetchRanking(): Promise<RankedTeam[]> {
  const [teams, scores] = await Promise.all([fetchTeams(), fetchScores()]);
  const byTeam = new Map(scores.map((s) => [s.team_id, s]));
  const rows = teams.map((team) => ({
    team,
    points: byTeam.get(team.id)?.points ?? 0,
    lastScoredAt: byTeam.get(team.id)?.last_scored_at ?? new Date().toISOString(),
  }));
  // Gelijke stand: wie er als eerste kwam, staat eerst.
  rows.sort((a, b) => b.points - a.points || a.lastScoredAt.localeCompare(b.lastScoredAt));
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

export async function addPoints(teamId: string, points: number) {
  const { error } = await supabase.rpc("add_points", { p_team_id: teamId, p_points: points });
  if (error) throw error;
}

/* ------------------------------ zones ------------------------------ */

export async function setZoneUnlocked(teamId: string, zoneId: string, unlocked: boolean) {
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
}

export async function unlockZoneWithPassword(teamId: string, zone: Zone, password: string) {
  if ((zone.unlock_password ?? "").trim().toLowerCase() !== password.trim().toLowerCase()) {
    throw new Error("Verkeerd wachtwoord voor deze zone.");
  }
  await setZoneUnlocked(teamId, zone.id, true);
}

/** Markeer zone als voltooid en open automatisch de volgende zone indien ingesteld. */
export async function refreshZoneCompletion(teamId: string, zones: Zone[], challenges: Challenge[]) {
  const [answers, quiz, photos] = await Promise.all([
    fetchAnswers(teamId),
    fetchQuizAnswers(teamId),
    fetchPhotos(teamId),
  ]);
  const done = new Set<string>([
    ...answers.map((a) => a.challenge_id),
    ...quiz.map((a) => a.challenge_id),
    ...photos.map((p) => p.challenge_id),
  ]);

  const sorted = [...zones].sort((a, b) => a.order_index - b.order_index);
  const completedZones: string[] = [];

  for (const zone of sorted) {
    const zoneChallenges = challenges.filter((c) => c.zone_id === zone.id);
    const complete = zoneChallenges.length > 0 && zoneChallenges.every((c) => done.has(c.id));
    if (!complete) continue;
    completedZones.push(zone.id);
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
    const next = sorted[sorted.indexOf(zone) + 1];
    if (next && (next.automatic_unlock || next.unlock_type === "automatic_after_completion")) {
      await setZoneUnlocked(teamId, next.id, true);
    }
  }
  return completedZones;
}

/* ------------------------------ inzendingen ------------------------------ */

export interface SubmitContext {
  teamId: string;
  zoneId: string;
  challenge: Challenge;
}

export async function submitTextAnswer({ teamId, zoneId, challenge }: SubmitContext, answer: string) {
  const payload = {
    team_id: teamId,
    zone_id: zoneId,
    challenge_id: challenge.id,
    answer,
    points_awarded: challenge.points,
  };
  try {
    const { error } = await supabase.from("answers").upsert(payload, { onConflict: "team_id,challenge_id" });
    if (error) throw error;
    await addPoints(teamId, challenge.points);
  } catch (err) {
    enqueue({ kind: "answer", payload, points: challenge.points, teamId });
    throw new OfflineQueuedError(err);
  }
}

export async function submitQuizAnswer({ teamId, zoneId, challenge }: SubmitContext, option: string) {
  const isCorrect = challenge.correct_answer ? challenge.correct_answer.trim() === option.trim() : null;
  const points = isCorrect === false ? 0 : challenge.points;
  const payload = {
    team_id: teamId,
    zone_id: zoneId,
    challenge_id: challenge.id,
    selected_option: option,
    is_correct: isCorrect,
    points_awarded: points,
  };
  try {
    const { error } = await supabase
      .from("quiz_answers")
      .upsert(payload, { onConflict: "team_id,challenge_id" });
    if (error) throw error;
    if (points !== 0) await addPoints(teamId, points);
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
    points_awarded: challenge.points,
  });
  if (error) throw error;
  await addPoints(teamId, challenge.points);
  return data.publicUrl;
}

/** Antwoord staat lokaal klaar en wordt gesynct zodra er weer verbinding is. */
export class OfflineQueuedError extends Error {
  constructor(public cause: unknown) {
    super("Geen verbinding — je antwoord is lokaal bewaard en wordt automatisch verstuurd.");
    this.name = "OfflineQueuedError";
  }
}
