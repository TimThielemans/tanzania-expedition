import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { ConfigNotice } from "@/components/ConfigNotice";
import {
  useAnswers,
  useChallenges,
  usePhotos,
  useQuizAnswers,
  useRanking,
} from "@/hooks/useGame";
import { useTeamSession } from "@/lib/session";
import { isSupabaseConfigured } from "@/lib/supabase";

export const Route = createFileRoute("/statistieken")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Statistieken — BOW in Tanzania" },
      { name: "description", content: "Bekijk de voortgang, punten en voltooiing van jouw team." },
      { property: "og:title", content: "Statistieken — BOW in Tanzania" },
      { property: "og:description", content: "Voortgang, punten en voltooiing van jouw team." },
    ],
  }),
  component: StatsPage,
});

function StatsPage() {
  const { session, hydrated } = useTeamSession();
  const teamId = session?.teamId;
  const { data: challenges } = useChallenges();
  const { data: answers } = useAnswers(teamId);
  const { data: quiz } = useQuizAnswers(teamId);
  const { data: photos } = usePhotos(teamId);
  const { data: ranking } = useRanking();

  if (!isSupabaseConfigured) return <ConfigNotice />;
  if (!hydrated) return null;

  if (!session) {
    return (
      <AppShell title="Statistieken">
        <p className="mt-4 text-sm text-muted-foreground">Log eerst in met je team.</p>
        <Link to="/" className="mt-3 inline-block underline">
          Naar login
        </Link>
      </AppShell>
    );
  }

  const completed = new Set([
    ...(answers ?? []).map((a) => a.challenge_id),
    ...(quiz ?? []).map((a) => a.challenge_id),
    ...(photos ?? []).map((p) => p.challenge_id),
  ]).size;
  const total = challenges?.length ?? 0;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  const me = ranking?.find((r) => r.team.id === session.teamId);

  const tiles = [
    { label: "Voltooide opdrachten", value: `${completed}/${total}` },
    { label: "Ingezonden antwoorden", value: String((answers?.length ?? 0) + (quiz?.length ?? 0)) },
    { label: "Geüploade foto's", value: String(photos?.length ?? 0) },
    { label: "Totaal punten", value: String(me?.points ?? 0) },
    { label: "Huidige plaats", value: me ? `#${me.rank}` : "—" },
    { label: "Voltooiing", value: `${pct}%` },
  ];

  return (
    <AppShell title="Statistieken" subtitle={session.teamName}>
      <div className="mt-4 rounded-3xl border border-border bg-card p-4 shadow-card">
        <div className="h-3 w-full overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-2 text-sm text-muted-foreground">{pct}% van de expeditie voltooid</p>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        {tiles.map((tile) => (
          <div key={tile.label} className="rounded-3xl border border-border bg-card p-4 shadow-card">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {tile.label}
            </p>
            <p className="mt-1 text-2xl font-bold">{tile.value}</p>
          </div>
        ))}
      </div>
    </AppShell>
  );
}
