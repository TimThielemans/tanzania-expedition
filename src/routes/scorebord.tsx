import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { ConfigNotice } from "@/components/ConfigNotice";
import { useRanking, useRealtime } from "@/hooks/useGame";
import { fireConfetti } from "@/lib/confetti";
import { useTeamSession } from "@/lib/session";
import { isSupabaseConfigured } from "@/lib/supabase";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/scorebord")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Scorebord — BOW in Tanzania" },
      { name: "description", content: "Live ranking van alle teams tijdens de Tanzania-expeditie." },
      { property: "og:title", content: "Scorebord — BOW in Tanzania" },
      { property: "og:description", content: "Live ranking van alle teams tijdens de expeditie." },
    ],
  }),
  component: ScoreboardPage,
});

const MEDALS = ["🥇", "🥈", "🥉"];

function ScoreboardPage() {
  const queryClient = useQueryClient();
  const { data: ranking } = useRanking();
  const { session } = useTeamSession();

  useRealtime(["scores"], () => {
    void queryClient.invalidateQueries({ queryKey: ["ranking"] });
  });

  useEffect(() => {
    if (session && ranking?.[0]?.team.id === session.teamId) fireConfetti();
  }, [ranking, session]);

  if (!isSupabaseConfigured) return <ConfigNotice />;

  return (
    <AppShell title="Scorebord" subtitle="Live stand">
      <ol className="mt-4 space-y-3">
        {(ranking ?? []).map((row) => (
          <li
            key={row.team.id}
            className={cn(
              "grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-3xl border border-border bg-card p-4 shadow-card",
              row.team.id === session?.teamId && "border-primary ring-2 ring-primary/30",
            )}
          >
            <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-secondary text-xl font-bold">
              {MEDALS[row.rank - 1] ?? row.rank}
            </span>
            <span className="min-w-0 truncate text-lg font-semibold">{row.team.name}</span>
            <span className="shrink-0 text-2xl font-bold text-primary">{row.points}</span>
          </li>
        ))}
        {ranking && ranking.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nog geen teams.</p>
        ) : null}
      </ol>
    </AppShell>
  );
}
