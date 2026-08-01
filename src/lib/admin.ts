import { supabase } from "./supabase";
import { describeError, logRpc } from "./errors";
import { fetchTeams, fetchZones } from "./api";
import type { Challenge, Team } from "./types";

/* ------------------------------ admin acties ------------------------------ */

export async function setAllZones(unlocked: boolean) {
  const [teams, zones] = await Promise.all([fetchTeams(), fetchZones()]);
  const rows = teams.flatMap((team) =>
    zones.map((zone) => ({
      team_id: team.id,
      zone_id: zone.id,
      unlocked,
      unlocked_at: unlocked ? new Date().toISOString() : null,
    })),
  );
  const { error } = await supabase.from("team_progress").upsert(rows, { onConflict: "team_id,zone_id" });
  if (error) throw error;
}

export async function clearAllAnswers() {
  await supabase.from("answers").delete().not("id", "is", null);
  await supabase.from("quiz_answers").delete().not("id", "is", null);
}

export async function clearAllPhotos() {
  const { data } = await supabase.from("photos").select("storage_path");
  const paths = (data ?? []).map((p) => p.storage_path).filter(Boolean) as string[];
  if (paths.length > 0) await supabase.storage.from("photos").remove(paths);
  await supabase.from("photos").delete().not("id", "is", null);
  await supabase.from("teams").update({ group_photo_url: null }).not("id", "is", null);
}
/**
 * Volledige reset: het spel staat daarna exact zoals bij een verse opstart.
 * Wist antwoorden, quizantwoorden, foto's (ook uit Storage), meldingen en
 * leesstatussen, voortgang, zonecodes, eerste-team-prestaties, teamfoto's,
 * locaties, locatietriggers en locatieopdrachten, en zet bonusopdrachten uit.
 */
export async function fullGameReset() {
  // Eerst de bestanden uit Storage, daarna de databasekant in één transactie.
  const { data, error: readError } = await supabase.from("photos").select("storage_path");
  if (readError) {
    console.info("[reset] fotopaden lezen mislukt", JSON.stringify(readError));
    throw new Error(`Fotopaden lezen: ${describeError(readError)}`);
  }

  const paths = (data ?? []).map((p) => p.storage_path).filter(Boolean) as string[];
  if (paths.length > 0) {
    const { error: storageError } = await supabase.storage.from("photos").remove(paths);
    console.info("[reset] storage", { count: paths.length, error: storageError ? JSON.stringify(storageError) : null });
    if (storageError) throw new Error(`Storage opruimen: ${describeError(storageError)}`);
  }

  const result = await supabase.rpc("full_game_reset");
  logRpc("full_game_reset", result);
}

/** Verwijdert alle teams én alles wat eraan hangt. */
export async function deleteAllTeams() {
  const result = await supabase.rpc("test_delete");
  logRpc("test_delete", result);
}

/* ------------------------------ teambeheer ------------------------------ */

export async function createTeam(input: { name: string; password: string; sortOrder?: number }) {
  const { data, error } = await supabase
    .from("teams")
    .insert({
      name: input.name.trim(),
      password: input.password.trim(),
      sort_order: input.sortOrder ?? 0,
      active: true,
    })
    .select("id")
    .single();
  if (error) throw error;
  await supabase
    .from("scores")
    .upsert(
      { team_id: data.id, points: 0, regular_points: 0, bonus_points: 0, creativity_points: 0 },
      { onConflict: "team_id" },
    );
}

export async function updateTeam(id: string, values: Partial<Pick<Team, "name" | "password">>) {
  const { error } = await supabase.from("teams").update(values).eq("id", id);
  if (error) throw error;
}

export async function deleteTeam(id: string) {
  await supabase.from("notification_reads").delete().eq("reader", id);
  const { error } = await supabase.from("teams").delete().eq("id", id);
  if (error) throw error;
}

/* ------------------------------ instellingen ------------------------------ */

export async function setSetting(key: string, value: string) {
  const { error } = await supabase.from("game_settings").upsert({ key, value }, { onConflict: "key" });
  if (error) throw error;
}

/* ------------------------------ CSV export ------------------------------ */

export function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const headers = Array.from(new Set(rows.flatMap((r) => Object.keys(r))));
  const escape = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  return [headers.join(","), ...rows.map((r) => headers.map((h) => escape(r[h])).join(","))].join("\n");
}

export function downloadCsv(filename: string, rows: Record<string, unknown>[]) {
  const blob = new Blob(["\uFEFF" + toCsv(rows)], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export async function setChallengeActive(challengeId: string, active: boolean) {
  const { error } = await supabase.from("challenges").update({ active }).eq("id", challengeId);
  if (error) throw error;
}

/* ------------------------------ opdrachten ------------------------------ */

export type ChallengeInput = Pick<
  Challenge,
  | "title"
  | "description"
  | "image_url"
  | "challenge_type"
  | "options"
  | "correct_answer"
  | "points"
  | "creativity_bonus_points"
  | "sort_order"
  | "active"
  | "zone_id"
  | "is_bonus"
  | "duration_minutes"
  | "notification_message"
  | "is_location"
>;

export async function createChallenge(input: ChallengeInput) {
  const { error } = await supabase.from("challenges").insert(input);
  if (error) throw error;
}

export async function updateChallenge(id: string, values: Partial<ChallengeInput>) {
  const { error } = await supabase.from("challenges").update(values).eq("id", id);
  if (error) throw error;
}

export async function deleteChallenge(id: string) {
  const { error } = await supabase.from("challenges").delete().eq("id", id);
  if (error) throw error;
}
