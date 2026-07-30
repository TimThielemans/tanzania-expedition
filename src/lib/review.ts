import { supabase } from "./supabase";
import { addPoints, fetchAllChallenges, fetchZones, sortZones, zoneNeedsPassword } from "./api";
import { createNotification } from "./notifications";
import type { Answer, Challenge, Photo, QuizAnswer, ReviewStatus } from "./types";

export type Submission =
  | ({ table: "answers"; value: string } & Answer)
  | ({ table: "quiz_answers"; value: string } & QuizAnswer)
  | ({ table: "photos"; value: string } & Photo);

/* --------------------------- goedkeuren / afkeuren --------------------------- */

async function setStatus(
  table: "answers" | "quiz_answers" | "photos",
  id: string,
  status: ReviewStatus,
  points: number,
) {
  const { error } = await supabase.from(table).update({ status, points_awarded: points }).eq("id", id);
  if (error) throw error;
}

interface ReviewInput {
  table: "answers" | "quiz_answers" | "photos";
  id: string;
  teamId: string;
  zoneId: string | null;
  currentPoints: number;
  challenge: Challenge | undefined;
}

/** Keurt een inzending goed en kent de punten van de opdracht toe. */
export async function approveSubmission(input: ReviewInput) {
  const points = input.challenge?.points ?? 0;
  const delta = points - input.currentPoints;
  await setStatus(input.table, input.id, "approved", points);
  if (delta !== 0) await addPoints(input.teamId, delta);
  await afterReview(input, "approved", points);
}

/** Keurt een inzending af: geen punten. */
export async function rejectSubmission(input: ReviewInput) {
  await setStatus(input.table, input.id, "rejected", 0);
  if (input.currentPoints !== 0) await addPoints(input.teamId, -input.currentPoints);
  await afterReview(input, "rejected", 0);
}

async function afterReview(input: ReviewInput, status: ReviewStatus, points: number) {
  // Bonusopdracht: het team krijgt meteen bericht.
  if (input.challenge?.is_bonus) {
    await createNotification({
      title: status === "approved" ? "✅ Bonusopdracht goedgekeurd!" : "❌ Bonusopdracht afgekeurd.",
      body:
        status === "approved"
          ? `${points} punten toegekend voor "${input.challenge.title}".`
          : `Geen punten voor "${input.challenge.title}".`,
      audience: "team",
      teamId: input.teamId,
      kind: "bonus",
    });
    return;
  }
  if (input.zoneId) await maybeDeliverZoneCode(input.teamId, input.zoneId);
}

/* --------------------------- automatische zonecode --------------------------- */

/**
 * Stuurt automatisch de code van de volgende zone zodra alle opdrachten van
 * een zone zijn ingezonden én nagekeken. Gebeurt maximaal één keer per team/zone.
 */
export async function maybeDeliverZoneCode(teamId: string, zoneId: string) {
  const [zones, challenges] = await Promise.all([fetchZones(), fetchAllChallenges()]);
  const sorted = sortZones(zones);
  const index = sorted.findIndex((z) => z.id === zoneId);
  const zone = sorted[index];
  if (!zone) return;

  const zoneChallenges = challenges.filter((c) => c.zone_id === zoneId && c.active && !c.is_bonus);
  if (zoneChallenges.length === 0) return;

  const [answers, quiz, photos] = await Promise.all([
    supabase.from("answers").select("*").eq("team_id", teamId),
    supabase.from("quiz_answers").select("*").eq("team_id", teamId),
    supabase.from("photos").select("*").eq("team_id", teamId),
  ]);
  const rows = [
    ...((answers.data ?? []) as Answer[]),
    ...((quiz.data ?? []) as QuizAnswer[]),
    ...((photos.data ?? []) as Photo[]),
  ];
  const byChallenge = new Map(rows.map((r) => [r.challenge_id, r]));

  const allDone = zoneChallenges.every((c) => {
    const row = byChallenge.get(c.id);
    return row && row.status !== "pending";
  });
  if (!allDone) return;

  const earned = zoneChallenges.reduce((sum, c) => sum + (byChallenge.get(c.id)?.points_awarded ?? 0), 0);
  const max = zoneChallenges.reduce((sum, c) => sum + c.points, 0);

  // Eén keer per team/zone
  const { error: noticeError } = await supabase
    .from("zone_completion_notices")
    .insert({ team_id: teamId, zone_id: zoneId });
  if (noticeError) return;

  const next = sorted[index + 1] ?? null;
  const lines = [`Jullie voltooiden ${zone.name} met ${earned} van de ${max} punten.`];
  if (next && zoneNeedsPassword(next)) {
    lines.push("", `Code voor ${next.name}:`, (next.unlock_password ?? "").trim());
  } else if (next) {
    lines.push("", `${next.name} is automatisch ontgrendeld.`);
  } else {
    lines.push("", "Dit was de laatste zone. Wat een expeditie!");
  }

  await createNotification({
    title: "🎉 Goed gedaan!",
    body: lines.join("\n"),
    audience: "team",
    teamId,
    kind: "zone_code",
  });
}

/* --------------------------- bonusopdrachten --------------------------- */

export async function updateBonusChallenge(
  id: string,
  values: { duration_minutes?: number; points?: number },
) {
  const { error } = await supabase.from("challenges").update(values).eq("id", id);
  if (error) throw error;
}

/** Activeert een bonusopdracht: timer start en alle teams krijgen een melding. */
export async function setBonusActive(challenge: Challenge, active: boolean) {
  const { error } = await supabase
    .from("challenges")
    .update({
      bonus_active: active,
      active: active ? true : challenge.active,
      bonus_started_at: active ? new Date().toISOString() : null,
    })
    .eq("id", challenge.id);
  if (error) throw error;

  if (active) {
    await createNotification({
      title: "📢 BONUSOPDRACHT",
      body:
        challenge.notification_message?.trim() ||
        `${challenge.description ?? challenge.title}\n\nJullie hebben ${challenge.duration_minutes} minuten.`,
      audience: "all",
      kind: "bonus",
    });
  }
}
