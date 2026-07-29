import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { LogOut, Loader2 } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { ConfigNotice } from "@/components/ConfigNotice";
import { ZoneCard } from "@/components/ZoneCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useAnswers,
  useChallenges,
  usePhotos,
  useProgress,
  useQuizAnswers,
  useRanking,
  useSettings,
  useTeams,
  useZones,
} from "@/hooks/useGame";
import { loginTeam, unlockedZoneIds } from "@/lib/api";
import { clearSession, saveSession, useTeamSession } from "@/lib/session";
import { isSupabaseConfigured } from "@/lib/supabase";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "BOW in Tanzania — Teambuilding expeditie" },
      {
        name: "description",
        content:
          "Speel de Tanzania-expeditie: ontgrendel zones, los opdrachten op en verzamel punten met je team.",
      },
      { property: "og:title", content: "BOW in Tanzania — Teambuilding expeditie" },
      {
        property: "og:description",
        content: "Ontgrendel zones, los opdrachten op en verzamel punten met je team.",
      },
    ],
  }),
  component: IndexPage,
});

function IndexPage() {
  const { session, hydrated } = useTeamSession();
  if (!isSupabaseConfigured) return <ConfigNotice />;
  if (!hydrated) return null;
  return session ? <HomeScreen teamId={session.teamId} /> : <LoginScreen />;
}

/* ------------------------------- login ------------------------------- */

function LoginScreen() {
  const { data: settings } = useSettings();
  const { data: teams, isLoading } = useTeams();
  const [teamId, setTeamId] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleLogin() {
    setBusy(true);
    try {
      const team = await loginTeam(teamId, password);
      saveSession({ teamId: team.id, teamName: team.name });
      toast.success(`Welkom, ${team.name}!`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Inloggen mislukt.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bg-hero flex min-h-screen flex-col justify-end px-4 pb-10 pt-16">
      <div className="mx-auto w-full max-w-lg text-primary-foreground">
        <p className="text-5xl">🦁🌴⛰️</p>
        <h1 className="mt-4 text-5xl leading-none">{settings?.app_title ?? "BOW in Tanzania"}</h1>
        <p className="mt-2 text-base opacity-90">
          {settings?.welcome_message ?? "Welkom bij Expeditie Tanzania"}
        </p>
      </div>

      <div className="mx-auto mt-8 w-full max-w-lg space-y-4 rounded-3xl bg-card p-5 shadow-raised">
        <div className="space-y-2">
          <label className="text-sm font-semibold">Kies je team</label>
          <Select value={teamId} onValueChange={setTeamId}>
            <SelectTrigger className="h-12 w-full rounded-2xl text-base">
              <SelectValue placeholder={isLoading ? "Laden…" : "Selecteer team"} />
            </SelectTrigger>
            <SelectContent>
              {(teams ?? []).map((team) => (
                <SelectItem key={team.id} value={team.id}>
                  {team.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-semibold">Wachtwoord</label>
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && teamId && password && handleLogin()}
            placeholder="Teamwachtwoord"
            className="h-12 rounded-2xl text-base"
          />
        </div>

        <Button
          size="lg"
          className="h-14 w-full rounded-2xl text-lg"
          disabled={busy || !teamId || !password}
          onClick={handleLogin}
        >
          {busy ? <Loader2 className="size-5 animate-spin" /> : "Start expeditie"}
        </Button>

        <Link to="/admin" className="block text-center text-sm text-muted-foreground underline">
          Admin
        </Link>
      </div>
    </div>
  );
}

/* -------------------------------- home -------------------------------- */

function HomeScreen({ teamId }: { teamId: string }) {
  const { data: settings } = useSettings();
  const { data: zones } = useZones();
  const { data: challenges } = useChallenges();
  const { data: progress } = useProgress(teamId);
  const { data: ranking } = useRanking();
  const { data: answers } = useAnswers(teamId);
  const { data: quiz } = useQuizAnswers(teamId);
  const { data: photos } = usePhotos(teamId);

  const done = useMemo(
    () =>
      new Set<string>([
        ...(answers ?? []).map((a) => a.challenge_id),
        ...(quiz ?? []).map((a) => a.challenge_id),
        ...(photos ?? []).map((p) => p.challenge_id),
      ]),
    [answers, quiz, photos],
  );

  const me = ranking?.find((r) => r.team.id === teamId);
  const unlockedIds = unlockedZoneIds(zones ?? [], progress ?? []);

  return (
    <AppShell
      title={settings?.app_title ?? "BOW in Tanzania"}
      subtitle={settings?.welcome_message}
      action={
        <Button
          variant="secondary"
          size="sm"
          className="rounded-full"
          onClick={() => {
            clearSession();
            toast.success("Uitgelogd.");
          }}
        >
          <LogOut className="size-4" /> Uit
        </Button>
      }
    >
      <section className="grid grid-cols-3 gap-3 rounded-3xl border border-border bg-card p-4 shadow-card">
        <Stat label="Team" value={me?.team.name ?? "—"} />
        <Stat label="Punten" value={String(me?.points ?? 0)} />
        <Stat label="Plaats" value={me ? `#${me.rank}` : "—"} />
      </section>

      <h2 className="mt-6 text-2xl">Zones</h2>
      <div className="mt-3 space-y-3">
        {(zones ?? []).map((zone) => {
          const zoneChallenges = (challenges ?? []).filter((c) => c.zone_id === zone.id && c.active);
          return (
            <ZoneCard
              key={zone.id}
              zone={zone}
              unlocked={unlockedIds.has(zone.id)}
              completed={zoneChallenges.filter((c) => done.has(c.id)).length}
              total={zoneChallenges.length}
            />
          );
        })}
        {zones && zones.length === 0 ? (
          <p className="text-sm text-muted-foreground">Er zijn nog geen zones aangemaakt.</p>
        ) : null}
      </div>
    </AppShell>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 text-center">
      <p className="truncate text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="truncate text-xl font-bold">{value}</p>
    </div>
  );
}
