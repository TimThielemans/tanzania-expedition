import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { ConfigNotice } from "@/components/ConfigNotice";
import { useAnswers, useChallenges, usePhotos, useQuizAnswers, useRanking, useTeamLocations } from "@/hooks/useGame";
import { useTeamSession } from "@/lib/session";
import { isSupabaseConfigured } from "@/lib/supabase";
import AdminMap from "@/components/AdminMap";
import { Button } from "@/components/ui/button";
import { useLocationTracking, requestLocationPermission } from "@/hooks/useLocationTracking";
import { saveTeamLocation } from "@/lib/locations";
import { toast } from "sonner";

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
  const { data: locations } = useTeamLocations();

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

  const myLocation = locations?.find((l) => l.team_id === session.teamId);

  const gpsAge =
    myLocation?.updated_at != null ? Math.floor((Date.now() - new Date(myLocation.updated_at).getTime()) / 1000) : null;

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

      <div className="mt-4 rounded-3xl border border-border bg-card p-4 shadow-card">
        <h2 className="text-xl font-semibold">📍 Teamlocatie</h2>

        <p className="mt-1 text-sm text-muted-foreground">
          Controleer hier of jullie locatie correct wordt doorgestuurd.
        </p>

        <div className="mt-3">
          <AdminMap teams={me ? [me.team] : []} locations={myLocation ? [myLocation] : []} events={[]} finale={null} />
        </div>

        {myLocation ? (
          <>
            <div className="mt-4 space-y-2 text-sm">
              <p>
                <strong>GPS-status:</strong>{" "}
                {gpsAge == null || gpsAge > 120 ? (
                  <span className="text-red-600">🔴 Niet betrouwbaar</span>
                ) : myLocation.accuracy != null && myLocation.accuracy <= 15 ? (
                  <span className="text-green-600">🟢 Goed</span>
                ) : (
                  <span className="text-yellow-600">🟡 Werkt, maar kan beter</span>
                )}
              </p>

              <p>
                <strong>Nauwkeurigheid:</strong>{" "}
                {myLocation.accuracy != null ? `${Math.round(myLocation.accuracy)} meter` : "Onbekend"}
              </p>

              <p>
                <strong>Laatste update:</strong>{" "}
                {gpsAge != null
                  ? gpsAge < 60
                    ? `${gpsAge} seconden geleden`
                    : `${Math.floor(gpsAge / 60)} minuten geleden`
                  : "Onbekend"}
              </p>
            </div>

            <Button
              variant="outline"
              className="mt-4 w-full rounded-2xl"
              onClick={async () => {
                const ok = await requestLocationPermission();

                if (!ok) {
                  toast.error("Locatietoegang geweigerd.");
                  return;
                }

                navigator.geolocation.getCurrentPosition(
                  async (pos) => {
                    try {
                      await saveTeamLocation(teamId, {
                        latitude: pos.coords.latitude,
                        longitude: pos.coords.longitude,
                        accuracy: pos.coords.accuracy,
                      });
                    } catch {
                      toast.error("Locatie kon niet worden opgeslagen.");
                    }
                  },
                  () => {
                    toast.error("Locatie kon niet worden opgehaald.");
                  },
                  {
                    enableHighAccuracy: true,
                    timeout: 15000,
                  },
                );
              }}
            >
              📍 Locatie vernieuwen
            </Button>
          </>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">Nog geen locatie ontvangen.</p>
        )}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        {tiles.map((tile) => (
          <div key={tile.label} className="rounded-3xl border border-border bg-card p-4 shadow-card">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{tile.label}</p>
            <p className="mt-1 text-2xl font-bold">{tile.value}</p>
          </div>
        ))}
      </div>
    </AppShell>
  );
}
