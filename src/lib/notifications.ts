import { supabase } from "./supabase";
import { logRpc } from "./errors";
import type { AppNotification, NotificationAudience, NotificationRead } from "./types";

export const ADMIN_READER = "admin";

/* ------------------------------ reads ------------------------------ */

export async function fetchNotifications(): Promise<AppNotification[]> {
  const { data, error } = await supabase.from("notifications").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as AppNotification[];
}

export async function fetchNotificationReads(reader: string): Promise<NotificationRead[]> {
  const { data, error } = await supabase.from("notification_reads").select("*").eq("reader", reader);
  if (error) throw error;
  return (data ?? []) as NotificationRead[];
}

/** Meldingen die zichtbaar zijn voor een team (of voor de reisleider). */
export function visibleFor(
  notifications: AppNotification[],
  reader: { kind: "team"; teamId: string } | { kind: "admin" },
): AppNotification[] {
  return notifications.filter((n) => {
    if (!n.active) return false;
    if (reader.kind === "admin") return true;
    if (n.audience === "admin") return false;
    if (n.audience === "all") return true;
    return n.team_id === reader.teamId;
  });
}

/* ------------------------------ writes ------------------------------ */

export interface NewNotification {
  title: string;
  body?: string | null;
  audience: NotificationAudience;
  teamId?: string | null;
  kind?: string;
}

export async function createNotification(input: NewNotification) {
  const { error } = await supabase.from("notifications").insert({
    title: input.title,
    body: input.body ?? null,
    audience: input.audience,
    team_id: input.audience === "team" ? (input.teamId ?? null) : null,
    kind: input.kind ?? "info",
  });

  if (error) throw error;

  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    if (input.kind === "bonus") {
      navigator.vibrate([200, 100, 200, 100, 200]);
    }

    if (input.kind === "location") {
      navigator.vibrate([150, 100, 150]);
    }

    if (input.kind === "review") {
      navigator.vibrate(200);
    }
  }
}

export async function deleteNotification(id: string) {
  const { error } = await supabase.from("notifications").delete().eq("id", id);
  if (error) throw error;
}

/** Wist álle meldingen én alle leesstatussen. */
export async function deleteAllNotifications() {
  const result = await supabase.rpc("delete_all_notifications");
  logRpc("delete_all_notifications", result);
}

export async function setNotificationActive(id: string, active: boolean) {
  const { error } = await supabase.from("notifications").update({ active }).eq("id", id);
  if (error) throw error;
}

export async function markNotificationRead(notificationId: string, reader: string) {
  const { error } = await supabase
    .from("notification_reads")
    .upsert({ notification_id: notificationId, reader }, { onConflict: "notification_id,reader" });
  if (error) throw error;
}

export async function markAllNotificationsRead(ids: string[], reader: string) {
  if (ids.length === 0) return;
  const { error } = await supabase.from("notification_reads").upsert(
    ids.map((notification_id) => ({ notification_id, reader })),
    { onConflict: "notification_id,reader" },
  );
  if (error) throw error;
}
