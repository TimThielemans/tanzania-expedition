import { createFileRoute, Link } from "@tanstack/react-router";
import { BellOff, CheckCheck } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { ConfigNotice } from "@/components/ConfigNotice";
import { Button } from "@/components/ui/button";
import { useNotificationCenter } from "@/hooks/useNotificationCenter";
import { useTeamSession } from "@/lib/session";
import { useAdminSession } from "@/lib/admin-session";
import { isSupabaseConfigured } from "@/lib/supabase";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/meldingen")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Meldingen — BOW in Tanzania" },
      {
        name: "description",
        content: "Alle berichten van de spelleiding: zonecodes, prestaties en updates van de expeditie.",
      },
      { property: "og:title", content: "Meldingen — BOW in Tanzania" },
      {
        property: "og:description",
        content: "Alle berichten van de spelleiding tijdens de Tanzania-expeditie.",
      },
    ],
  }),
  component: NotificationsPage,
});

function NotificationsPage() {
  const { session, hydrated } = useTeamSession();
  const { isAdmin } = useAdminSession();
  const { items, unread, markRead, markAllRead } = useNotificationCenter();

  if (!isSupabaseConfigured) return <ConfigNotice />;
  if (!hydrated) return null;

  if (!session && !isAdmin) {
    return (
      <AppShell title="Meldingen" subtitle="Berichten van de spelleiding">
        <p className="mt-4 text-sm text-muted-foreground">
          Log eerst in met je team om jullie meldingen te zien.
        </p>
        <Link to="/" className="mt-4 inline-block underline">
          Naar login
        </Link>
      </AppShell>
    );
  }

  const fmt = (iso: string) => new Date(iso).toLocaleString("nl-BE");

  return (
    <AppShell
      title="Meldingen"
      subtitle={unread > 0 ? `${unread} ongelezen` : "Alles gelezen"}
      action={
        unread > 0 ? (
          <Button variant="secondary" size="sm" className="rounded-full" onClick={() => void markAllRead()}>
            <CheckCheck className="size-4" /> Alles gelezen
          </Button>
        ) : undefined
      }
    >
      <ul className="mt-4 space-y-3">
        {items.map((n) => (
          <li key={n.id}>
            <button
              type="button"
              onClick={() => !n.read && void markRead(n.id)}
              className={cn(
                "w-full rounded-3xl border p-4 text-left shadow-card transition-colors",
                n.read
                  ? "border-border bg-card"
                  : "border-primary/50 bg-secondary ring-1 ring-primary/30",
              )}
            >
              <div className="flex items-start gap-2">
                {!n.read ? <span className="mt-2 size-2 shrink-0 rounded-full bg-destructive" /> : null}
                <div className="min-w-0 flex-1">
                  <p className={cn("text-base leading-snug", n.read ? "font-medium" : "font-bold")}>
                    {n.title}
                  </p>
                  {n.body ? <p className="mt-1 text-sm text-muted-foreground">{n.body}</p> : null}
                  <p className="mt-2 text-xs text-muted-foreground">{fmt(n.created_at)}</p>
                </div>
              </div>
            </button>
          </li>
        ))}
      </ul>

      {items.length === 0 ? (
        <div className="mt-8 grid place-items-center gap-2 text-center text-muted-foreground">
          <BellOff className="size-8" />
          <p className="text-sm">Nog geen meldingen. Hier verschijnen zonecodes en nieuws.</p>
        </div>
      ) : null}
    </AppShell>
  );
}
