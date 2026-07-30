import { useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNotificationReads, useNotifications, useRealtime } from "./useGame";
import {
  ADMIN_READER,
  markAllNotificationsRead,
  markNotificationRead,
  visibleFor,
} from "@/lib/notifications";
import { useAdminSession } from "@/lib/admin-session";
import { useTeamSession } from "@/lib/session";

/** Meldingen voor het ingelogde team (of de reisleider), inclusief leesstatus. */
export function useNotificationCenter() {
  const { session } = useTeamSession();
  const { isAdmin } = useAdminSession();
  const queryClient = useQueryClient();

  const reader = session?.teamId ?? (isAdmin ? ADMIN_READER : "");
  const { data: notifications } = useNotifications();
  const { data: reads } = useNotificationReads(reader);

  useRealtime(["notifications", "notification_reads"], () => {
    void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    void queryClient.invalidateQueries({ queryKey: ["notification-reads"] });
  });

  const readIds = useMemo(() => new Set((reads ?? []).map((r) => r.notification_id)), [reads]);

  const items = useMemo(() => {
    if (!reader) return [];
    const list = visibleFor(
      notifications ?? [],
      session ? { kind: "team", teamId: session.teamId } : { kind: "admin" },
    );
    return list.map((n) => ({ ...n, read: readIds.has(n.id) }));
  }, [notifications, reader, session, readIds]);

  const unread = items.filter((n) => !n.read).length;

  async function markRead(id: string) {
    if (!reader) return;
    await markNotificationRead(id, reader);
    await queryClient.invalidateQueries({ queryKey: ["notification-reads"] });
  }

  async function markAllRead() {
    if (!reader) return;
    await markAllNotificationsRead(
      items.filter((n) => !n.read).map((n) => n.id),
      reader,
    );
    await queryClient.invalidateQueries({ queryKey: ["notification-reads"] });
  }

  return { items, unread, markRead, markAllRead, reader };
}
