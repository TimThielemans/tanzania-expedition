import { supabase } from "./supabase";
import {
  addPoints,
  fetchAllChallenges,
  fetchZones,
  sortZones,
  zoneCompletionChallenges,
  zoneNeedsPassword,
} from "./api";
import { fetchLocationChallengeStates, fetchLocationEvents } from "./locations";
import { createNotification } from "./notifications";
import type { Answer, Challenge, Photo, QuizAnswer, ReviewStatus } from "./types";

export type SubmissionTable = "answers" | "quiz_answers" | "photos";

/** Beoordelingsopties: goedkeuren, afkeuren of ⭐ uitstekend (met creativiteitsbonus). */
export type ReviewVerdict = "approved" | "rejected" | "excellent";

export interface ReviewInput {
  table: SubmissionTable;
  id: string;
  teamId: string;
  zoneId: string | null;
  /** Punten die deze inzending nu al opleverde. */
  currentPoints: number;
  /** Creativiteitspunten die deze inzending nu al opleverde. */
  currentCreativity: number;
  challenge: Challenge | undefined;
}

/** Mag deze opdracht een creativiteitsbonus krijgen? Bonus/locatieopdrachten nooit. */
export function supportsCreativity(challenge: Challenge | undefined): boolean {
  if (!challenge) return false;
  if (challenge.is_bonus || challenge.is_location) return false;
  return (challenge.creativity_bonus_points ?? 0) > 0;
}

async function setStatus(table: SubmissionTable, id: string, status: ReviewStatus, points: number, creativity: number) {
  const { error } = await supabase
    .from(table)
    .update({ status, points_awarded: points, creativity_points: creativity })
    .eq("id", id);
  if (error) throw error;
}

/** Centrale beoordelingsactie voor antwoorden, quizantwoorden en foto's. */
export async function reviewSubmission(input: ReviewInput, verdict: ReviewVerdict) {
  const challenge = input.challenge;
  const rejected = verdict === "rejected";
  const excellent = verdict === "excellent" && supportsCreativity(challenge);

  const points = rejected ? 0 : (challenge?.points ?? 0);
  const creativity = excellent ? (challenge?.creativity_bonus_points ?? 0) : 0;
  const status: ReviewStatus = rejected ? "rejected" : "approved";

  await setStatus(input.table, input.id, status, points, creativity);

  const kind = challenge?.is_bonus ? "bonus" : "regular";
  const pointDelta = points - input.currentPoints;
  const creativityDelta = creativity - input.currentCreativity;
  if (pointDelta !== 0) await addPoints(input.teamId, pointDelta, kind);
  if (creativityDelta !== 0) await addPoints(input.teamId, creativityDelta, "creativity");

  if (excellent && challenge) {
    await createNotification({
      title: "🎁 Dat was uitstekend!",
      body: `Jullie krijgen een creativiteitsbonus van ${creativity} punten bij:\n\n${challenge.title}`,
      audience: "team",
      teamId: input.teamId,
      kind: "creativity",
    });
  }

  // Foto die als teamfoto gemarkeerd is, wordt bij goedkeuring de groepsfoto.
  if (!rejected && input.table === "photos") await maybeSetGroupPhoto(input.id, input.teamId);

  await afterReview(input, status, points);
}

/** Backwards-compatible helpers. */
export const approveSubmission = (input: ReviewInput) => reviewSubmission(input, "approved");
export const rejectSubmission = (input: ReviewInput) => reviewSubmission(input, "rejected");

/* --------------------------- teamfoto --------------------------- */

/** Markeert een foto als teamfoto (of haalt die markering weg). */
export async function markPhotoAsGroupPhoto(photoId: string, teamId: string, value: boolean) {
  const { error } = await supabase.from("photos").update({ is_group_photo: value }).eq("id", photoId);
  if (error) throw error;

  if (value) {
    const { data } = await supabase.from("photos").select("photo_url, status").eq("id", photoId).maybeSingle();
    if (data?.status === "approved") {
      await supabase.from("teams").update({ group_photo_url: data.photo_url }).eq("id", teamId);
    }
  }
}

async function maybeSetGroupPhoto(photoId: string, teamId: string) {
  const { data } = await supabase.from("photos").select("photo_url, is_group_photo").eq("id", photoId).maybeSingle();
  if (!data?.is_group_photo) return;
  await supabase.from("teams").update({ group_photo_url: data.photo_url }).eq("id", teamId);
}

/* --------------------------- na de beoordeling --------------------------- */

async function afterReview(input: ReviewInput, status: ReviewStatus, points: number) {
  const challenge = input.challenge;
  const custom = challenge?.approval_message?.trim();

  if (custom) {
    // Eigen bericht vervangt de standaardmelding, zowel bij goed- als afkeuring.
    await createNotification({
      title: challenge?.title ?? "Opdracht nagekeken",
      body: custom,
      audience: "team",
      teamId: input.teamId,
      kind: challenge?.is_bonus ? "bonus" : challenge?.is_location ? "location" : "review",
    });
  } else if (challenge?.is_bonus) {
    await createNotification({
      title: status === "approved" ? "✅ Bonusopdracht goedgekeurd!" : "❌ Bonusopdracht afgekeurd.",
      body:
        status === "approved"
          ? `${points} punten toegekend voor "${challenge.title}".`
          : `Geen punten voor "${challenge.title}".`,
      audience: "team",
      teamId: input.teamId,
      kind: "bonus",
    });
  } else if (challenge?.is_location) {
    await createNotification({
      title: status === "approved" ? "✅ Punten toegekend" : "❌ Inzending afgekeurd",
      body:
        status === "approved"
          ? `${points} punten voor de locatieopdracht "${challenge.title}".`
          : `Geen punten voor de locatieopdracht "${challenge.title}".`,
      audience: "team",
      teamId: input.teamId,
      kind: "location",
    });
  }

  // Bonusopdrachten horen bij geen enkele zone.
  if (challenge?.is_bonus) return;

  // Locatieopdracht: de zone komt van het gekoppelde locatie-event.
  if (challenge?.is_location) {
    if (!challenge.location_event_id) return;
    const events = await fetchLocationEvents();
    const zoneId = events.find((e) => e.id === challenge.location_event_id)?.zone_id ?? null;
    if (zoneId) await maybeDeliverZoneCode(input.teamId, zoneId);
    return;
  }

  if (input.zoneId) await maybeDeliverZoneCode(input.teamId, input.zoneId);
}

/* --------------------------- automatische zonecode --------------------------- */

/**
 * Stuurt automatisch de code van de volgende zone zodra alle opdrachten van
 * een zone — inclusief de locatieopdrachten van die zone — zijn ingezonden én
 * nagekeken. Gebeurt maximaal één keer per team/zone.
 */
export async function maybeDeliverZoneCode(teamId: string, zoneId: string) {
  const [zones, challenges, locEvents, locStates] = await Promise.all([
    fetchZones(),
    fetchAllChallenges(),
    fetchLocationEvents(),
    fetchLocationChallengeStates(teamId),
  ]);
  const sorted = sortZones(zones);
  const index = sorted.findIndex((z) => z.id === zoneId);
  const zone = sorted[index];
  if (!zone) return;

  const zoneChallenges = zoneCompletionChallenges(challenges, locEvents, zoneId, locStates);
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

  const earned = zoneChallenges.reduce(
    (sum, c) => sum + (byChallenge.get(c.id)?.points_awarded ?? 0) + (byChallenge.get(c.id)?.creativity_points ?? 0),
    0,
  );
  const max = zoneChallenges.reduce((sum, c) => sum + c.points, 0);

  // Eén keer per team/zone
  const { error: noticeError } = await supabase
    .from("zone_completion_notices")
    .insert({ team_id: teamId, zone_id: zoneId });
  if (noticeError) return;

  const next = sorted[index + 1] ?? null;
  const lines = [`Jullie voltooiden ${zone.name} met ${earned} punten.`];
  //const lines = [`Jullie voltooiden ${zone.name} met ${earned} van de ${max} punten.`];
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

export async function updateBonusChallenge(id: string, values: { duration_minutes?: number; points?: number }) {
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
