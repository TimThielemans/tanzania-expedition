import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { ConfigNotice } from "@/components/ConfigNotice";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useProgress, useRanking, useRealtime, useZones } from "@/hooks/useGame";
import { sortZones } from "@/lib/api";
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
  const { data: zones } = useZones();
  const { data: progress } = useProgress();
  const { session } = useTeamSession();
  const [openTeam, setOpenTeam] = useState<string | null>(null);

  useRealtime(["scores", "teams", "team_progress"], () => {
    void queryClient.invalidateQueries();
  });

  useEffect(() => {
    if (session && ranking?.[0]?.team.id === session.teamId) fireConfetti();
  }, [ranking, session]);

  if (!isSupabaseConfigured) return <ConfigNotice />;

  const detail = ranking?.find((r) => r.team.id === openTeam) ?? null;
  const currentZone = (teamId: string) => {
    const unlocked = (progress ?? []).filter((p) => p.team_id === teamId && p.unlocked);
    return (
      sortZones(zones ?? [])
        .filter((z) => unlocked.some((p) => p.zone_id === z.id))
        .at(-1)?.name ?? "Nog niet gestart"
    );
  };

  return (
    <AppShell title="Scorebord" subtitle="Live stand">
      <ol className="mt-4 space-y-3">
        {(ranking ?? []).map((row) => (
          <li key={row.team.id}>
            <button
              type="button"
              onClick={() => setOpenTeam(row.team.id)}
              className={cn(
                "grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-3xl border border-border bg-card p-4 text-left shadow-card",
                row.team.id === session?.teamId && "border-primary ring-2 ring-primary/30",
              )}
            >
              <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-secondary text-xl font-bold">
                {MEDALS[row.rank - 1] ?? row.rank}
              </span>
              <span className="min-w-0 truncate text-lg font-semibold">{row.team.name}</span>
              <span className="shrink-0 text-2xl font-bold text-primary">{row.points}</span>
            </button>
          </li>
        ))}
        {ranking && ranking.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nog geen teams.</p>
        ) : null}
      </ol>

      <Dialog open={detail !== null} onOpenChange={(open) => !open && setOpenTeam(null)}>
        <DialogContent className="max-w-sm rounded-3xl">
          <DialogHeader>
            <DialogTitle className="text-2xl">{detail?.team.name}</DialogTitle>
            <DialogDescription>Plaats {detail?.rank} · {currentZone(detail?.team.id ?? "")}</DialogDescription>
          </DialogHeader>

          {detail?.team.group_photo_url ? (
            <img
              src={detail.team.group_photo_url}
              alt={`Teamfoto van ${detail.team.name}`}
              className="max-h-56 w-full rounded-2xl object-cover"
            />
          ) : null}

          <p className="text-center text-4xl font-bold text-primary">{detail?.points} pt</p>

          <dl className="space-y-1 rounded-2xl bg-muted p-3 text-sm">
            <div className="flex justify-between">
              <dt>Gewone punten</dt>
              <dd className="font-bold">{detail?.regularPoints ?? 0}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Bonuspunten</dt>
              <dd className="font-bold">{detail?.bonusPoints ?? 0}</dd>
            </div>
            <div className="flex justify-between">
              <dt>⭐ Creativiteitspunten</dt>
              <dd className="font-bold">{detail?.creativityPoints ?? 0}</dd>
            </div>
          </dl>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

