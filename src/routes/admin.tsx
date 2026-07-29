import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, LogOut } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { ConfigNotice } from "@/components/ConfigNotice";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  useAnswers,
  useChallenges,
  usePhotos,
  usePointActions,
  useProgress,
  useQuizAnswers,
  useRanking,
  useRealtime,
  useTeams,
  useZones,
} from "@/hooks/useGame";
import { addPoints, verifyAdminPassword } from "@/lib/api";
import {
  clearAllAnswers,
  clearAllPhotos,
  downloadCsv,
  resetTeamProgress,
  restartGame,
  setAllZones,
  setTeamScore,
} from "@/lib/admin";
import { isSupabaseConfigured } from "@/lib/supabase";

export const Route = createFileRoute("/admin")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Admin — BOW in Tanzania" },
      { name: "description", content: "Beheer teams, punten, antwoorden en zones van de expeditie." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Admin — BOW in Tanzania" },
      { property: "og:description", content: "Beheer teams, punten, antwoorden en zones." },
    ],
  }),
  component: AdminPage,
});

const ADMIN_KEY = "bow-admin-session";

function AdminPage() {
  const [authed, setAuthed] = useState(false);
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setAuthed(sessionStorage.getItem(ADMIN_KEY) === "1");
    setReady(true);
  }, []);

  if (!isSupabaseConfigured) return <ConfigNotice />;
  if (!ready) return null;

  async function login() {
    setBusy(true);
    try {
      const ok = await verifyAdminPassword(password);
      if (!ok) throw new Error("Verkeerd adminwachtwoord.");
      sessionStorage.setItem(ADMIN_KEY, "1");
      setAuthed(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Inloggen mislukt.");
    } finally {
      setBusy(false);
    }
  }

  if (!authed) {
    return (
      <AppShell title="Admin" subtitle="Beveiligde zone">
        <div className="mt-4 space-y-3 rounded-3xl border border-border bg-card p-5 shadow-card">
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && password && login()}
            placeholder="Adminwachtwoord"
            className="h-12 rounded-2xl text-base"
          />
          <Button
            size="lg"
            className="h-12 w-full rounded-2xl"
            disabled={busy || !password}
            onClick={login}
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : "Inloggen"}
          </Button>
        </div>
      </AppShell>
    );
  }

  return <AdminDashboard onLogout={() => { sessionStorage.removeItem(ADMIN_KEY); setAuthed(false); }} />;
}

function AdminDashboard({ onLogout }: { onLogout: () => void }) {
  const queryClient = useQueryClient();
  const { data: ranking } = useRanking();
  const { data: teams } = useTeams();
  const { data: zones } = useZones();
  const { data: challenges } = useChallenges();
  const { data: actions } = usePointActions();
  const { data: answers } = useAnswers();
  const { data: quiz } = useQuizAnswers();
  const { data: photos } = usePhotos();
  const { data: progress } = useProgress();

  useRealtime(["scores", "answers", "quiz_answers", "photos", "team_progress"], () => {
    void queryClient.invalidateQueries();
  });

  const refresh = () => queryClient.invalidateQueries();
  const teamName = (id: string) => teams?.find((t) => t.id === id)?.name ?? id;
  const challengeTitle = (id: string) => challenges?.find((c) => c.id === id)?.title ?? id;
  const zoneName = (id: string) => zones?.find((z) => z.id === id)?.name ?? id;
  const fmt = (iso: string) => new Date(iso).toLocaleString("nl-BE");

  async function guarded(label: string, action: () => Promise<unknown>) {
    if (!window.confirm(`${label}\n\nWeet je het zeker?`)) return;
    try {
      await action();
      toast.success("Klaar.");
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Actie mislukt.");
    }
  }

  return (
    <AppShell
      title="Admin"
      subtitle="Beheer de expeditie"
      action={
        <Button variant="secondary" size="sm" className="rounded-full" onClick={onLogout}>
          <LogOut className="size-4" /> Uit
        </Button>
      }
    >
      <Tabs defaultValue="scores" className="mt-4">
        <TabsList className="grid w-full grid-cols-4 rounded-2xl">
          <TabsTrigger value="scores">Punten</TabsTrigger>
          <TabsTrigger value="answers">Antwoorden</TabsTrigger>
          <TabsTrigger value="zones">Zones</TabsTrigger>
          <TabsTrigger value="beheer">Beheer</TabsTrigger>
        </TabsList>

        {/* ---------------- punten ---------------- */}
        <TabsContent value="scores" className="mt-4 space-y-3">
          {(ranking ?? []).map((row) => (
            <div key={row.team.id} className="rounded-3xl border border-border bg-card p-4 shadow-card">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
                <div className="min-w-0">
                  <p className="truncate text-lg font-semibold">
                    #{row.rank} {row.team.name}
                  </p>
                  <p className="text-xs text-muted-foreground">Laatste punt: {fmt(row.lastScoredAt)}</p>
                </div>
                <p className="shrink-0 text-3xl font-bold text-primary">{row.points}</p>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {(actions ?? []).map((action) => (
                  <Button
                    key={action.id}
                    size="lg"
                    variant={action.points >= 0 ? "default" : "destructive"}
                    className="h-12 min-w-16 flex-1 rounded-2xl text-base"
                    onClick={async () => {
                      await addPoints(row.team.id, action.points);
                      await refresh();
                    }}
                  >
                    {action.label}
                  </Button>
                ))}
              </div>

              <div className="mt-3 flex gap-2">
                <Input
                  type="number"
                  defaultValue={row.points}
                  className="h-11 rounded-2xl"
                  onKeyDown={async (e) => {
                    if (e.key !== "Enter") return;
                    await setTeamScore(row.team.id, Number((e.target as HTMLInputElement).value));
                    toast.success("Score aangepast.");
                    await refresh();
                  }}
                  aria-label={`Score van ${row.team.name}`}
                />
                <Button
                  variant="secondary"
                  className="h-11 shrink-0 rounded-2xl"
                  onClick={() => guarded(`Reset voortgang van ${row.team.name}.`, () => resetTeamProgress(row.team.id))}
                >
                  Reset team
                </Button>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">Enter = score exact instellen.</p>
            </div>
          ))}
        </TabsContent>

        {/* ---------------- antwoorden ---------------- */}
        <TabsContent value="answers" className="mt-4 space-y-4">
          <Section title={`Antwoorden (${answers?.length ?? 0})`}>
            {(answers ?? []).map((a) => (
              <Row
                key={a.id}
                title={`${teamName(a.team_id)} — ${challengeTitle(a.challenge_id)}`}
                subtitle={`${a.answer} · ${fmt(a.created_at)}`}
              />
            ))}
          </Section>

          <Section title={`Quizantwoorden (${quiz?.length ?? 0})`}>
            {(quiz ?? []).map((q) => (
              <Row
                key={q.id}
                title={`${teamName(q.team_id)} — ${challengeTitle(q.challenge_id)}`}
                subtitle={`${q.selected_option} ${q.is_correct === null ? "" : q.is_correct ? "✅" : "❌"} · ${fmt(q.created_at)}`}
              />
            ))}
          </Section>

          <Section title={`Foto's (${photos?.length ?? 0})`}>
            <div className="grid grid-cols-3 gap-2">
              {(photos ?? []).map((p) => (
                <a key={p.id} href={p.photo_url} target="_blank" rel="noreferrer">
                  <img
                    src={p.photo_url}
                    alt={teamName(p.team_id)}
                    loading="lazy"
                    className="aspect-square w-full rounded-2xl object-cover"
                  />
                  <span className="block truncate text-[11px]">{teamName(p.team_id)}</span>
                </a>
              ))}
            </div>
          </Section>
        </TabsContent>

        {/* ---------------- zones ---------------- */}
        <TabsContent value="zones" className="mt-4 space-y-4">
          <div className="flex gap-2">
            <Button className="h-12 flex-1 rounded-2xl" onClick={() => guarded("Alle zones openen.", () => setAllZones(true))}>
              Alles ontgrendelen
            </Button>
            <Button
              variant="secondary"
              className="h-12 flex-1 rounded-2xl"
              onClick={() => guarded("Alle zones sluiten.", () => setAllZones(false))}
            >
              Alles vergrendelen
            </Button>
          </div>

          {(teams ?? []).map((team) => {
            const rows = (progress ?? []).filter((p) => p.team_id === team.id);
            const doneIds = new Set([
              ...(answers ?? []).filter((a) => a.team_id === team.id).map((a) => a.challenge_id),
              ...(quiz ?? []).filter((a) => a.team_id === team.id).map((a) => a.challenge_id),
              ...(photos ?? []).filter((p) => p.team_id === team.id).map((p) => p.challenge_id),
            ]);
            return (
              <Section key={team.id} title={team.name}>
                <p className="text-sm text-muted-foreground">
                  Opdrachten voltooid: {doneIds.size}/{challenges?.length ?? 0}
                </p>
                <ul className="mt-2 space-y-1 text-sm">
                  {rows.map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate">{zoneName(p.zone_id)}</span>
                      <span className="shrink-0">
                        {p.unlocked ? "🔓" : "🔒"} {p.completed ? "✅" : ""}
                      </span>
                    </li>
                  ))}
                  {rows.length === 0 ? <li className="text-muted-foreground">Geen voortgang.</li> : null}
                </ul>
              </Section>
            );
          })}
        </TabsContent>

        {/* ---------------- beheer ---------------- */}
        <TabsContent value="beheer" className="mt-4 space-y-3">
          <Section title="Exporteren">
            <div className="grid gap-2">
              <Button
                variant="secondary"
                className="h-12 rounded-2xl"
                onClick={() =>
                  downloadCsv("antwoorden.csv", [
                    ...(answers ?? []).map((a) => ({
                      type: "antwoord",
                      team: teamName(a.team_id),
                      zone: zoneName(a.zone_id),
                      opdracht: challengeTitle(a.challenge_id),
                      antwoord: a.answer,
                      punten: a.points_awarded,
                      tijdstip: a.created_at,
                    })),
                    ...(quiz ?? []).map((q) => ({
                      type: "quiz",
                      team: teamName(q.team_id),
                      zone: zoneName(q.zone_id),
                      opdracht: challengeTitle(q.challenge_id),
                      antwoord: q.selected_option,
                      punten: q.points_awarded,
                      tijdstip: q.created_at,
                    })),
                  ])
                }
              >
                Antwoorden → CSV
              </Button>
              <Button
                variant="secondary"
                className="h-12 rounded-2xl"
                onClick={() =>
                  downloadCsv(
                    "scores.csv",
                    (ranking ?? []).map((r) => ({
                      plaats: r.rank,
                      team: r.team.name,
                      punten: r.points,
                      laatste_punt: r.lastScoredAt,
                    })),
                  )
                }
              >
                Scores → CSV
              </Button>
              <Button
                variant="secondary"
                className="h-12 rounded-2xl"
                onClick={() =>
                  downloadCsv(
                    "fotos.csv",
                    (photos ?? []).map((p) => ({
                      team: teamName(p.team_id),
                      zone: zoneName(p.zone_id),
                      opdracht: challengeTitle(p.challenge_id),
                      url: p.photo_url,
                      pad: p.storage_path,
                      tijdstip: p.created_at,
                    })),
                  )
                }
              >
                Fotometadata → CSV
              </Button>
            </div>
          </Section>

          <Section title="Gevarenzone">
            <div className="grid gap-2">
              <Button
                variant="destructive"
                className="h-12 rounded-2xl"
                onClick={() => guarded("Alle antwoorden wissen.", clearAllAnswers)}
              >
                Alle antwoorden wissen
              </Button>
              <Button
                variant="destructive"
                className="h-12 rounded-2xl"
                onClick={() => guarded("Alle foto's wissen (ook uit Storage).", clearAllPhotos)}
              >
                Alle foto's wissen
              </Button>
              <Button
                variant="destructive"
                className="h-12 rounded-2xl"
                onClick={() => guarded("Volledig spel herstarten: alles wordt gewist.", restartGame)}
              >
                Spel herstarten
              </Button>
            </div>
          </Section>
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl border border-border bg-card p-4 shadow-card">
      <h2 className="text-xl">{title}</h2>
      <div className="mt-2 space-y-2">{children}</div>
    </section>
  );
}

function Row({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="rounded-2xl bg-muted px-3 py-2">
      <p className="truncate text-sm font-semibold">{title}</p>
      <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
    </div>
  );
}
