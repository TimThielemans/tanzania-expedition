import { supabase } from "./supabase";
import { fetchTeams, fetchZones } from "./api";

/* ------------------------------ admin acties ------------------------------ */

export async function resetTeamProgress(teamId: string) {
  await supabase.from("answers").delete().eq("team_id", teamId);
  await supabase.from("quiz_answers").delete().eq("team_id", teamId);
  await supabase.from("photos").delete().eq("team_id", teamId);
  await supabase.from("team_progress").delete().eq("team_id", teamId);
  await supabase.from("scores").upsert(
    { team_id: teamId, points: 0, last_scored_at: new Date().toISOString() },
    { onConflict: "team_id" },
  );
}

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
}

export async function restartGame() {
  await clearAllPhotos();
  await clearAllAnswers();
  await supabase.from("team_progress").delete().not("id", "is", null);
  const teams = await fetchTeams();
  const now = new Date().toISOString();
  await supabase
    .from("scores")
    .upsert(teams.map((t) => ({ team_id: t.id, points: 0, last_scored_at: now })), {
      onConflict: "team_id",
    });
}

export async function setTeamScore(teamId: string, points: number) {
  const { error } = await supabase.from("scores").upsert(
    { team_id: teamId, points, last_scored_at: new Date().toISOString() },
    { onConflict: "team_id" },
  );
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
