import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, Loader2, LogOut, Send, Timer, Trash2, X } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { ConfigNotice } from "@/components/ConfigNotice";
import { StatusPill } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useAllChallenges,
  useAnswers,
  usePhotos,
  usePointActions,
  useProgress,
  useQuizAnswers,
  useRanking,
  useRealtime,
  useTeams,
  useZones,
  useNotifications,
} from "@/hooks/useGame";
import { addPoints, bonusRemainingMs, sortZones, verifyAdminPassword } from "@/lib/api";
import {
  approveSubmission,
  rejectSubmission,
  setBonusActive,
  updateBonusChallenge,
} from "@/lib/review";
import { deleteNotification, createNotification, setNotificationActive } from "@/lib/notifications";
import { clearAdminSession, saveAdminSession, useAdminSession } from "@/lib/admin-session";
import {
  clearAllAnswers,
  clearAllPhotos,
  downloadCsv,
  resetTeamProgress,
  restartGame,
  setAllZones,
  setChallengeActive,
} from "@/lib/admin";
import { isSupabaseConfigured } from "@/lib/supabase";
import type { Challenge, ReviewStatus } from "@/lib/types";

export const Route = createFileRoute("/admin")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Admin — BOW in Tanzania" },
      { name: "description", content: "Beheer teams, punten, antwoorden en opdrachten van de expeditie." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Admin — BOW in Tanzania" },
      { property: "og:description", content: "Beheer teams, punten, antwoorden en opdrachten." },
    ],
  }),
  component: AdminPage,
});

function AdminPage() {
  const { isAdmin, hydrated } = useAdminSession();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  if (!isSupabaseConfigured) return <ConfigNotice />;
  if (!hydrated) return null;

  async function login() {
    setBusy(true);
    try {
      const ok = await verifyAdminPassword(password);
      if (!ok) throw new Error("Verkeerd adminwachtwoord.");
      saveAdminSession();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Inloggen mislukt.");
    } finally {
      setBusy(false);
    }
  }

  if (!isAdmin) {
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
          <Button size="lg" className="h-12 w-full rounded-2xl" disabled={busy || !password} onClick={login}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : "Inloggen"}
          </Button>
        </div>
      </AppShell>
    );
  }

  return <AdminDashboard onLogout={clearAdminSession} />;
}

/* ------------------------------ review-item ------------------------------ */

interface ReviewItem {
  table: "answers" | "quiz_answers" | "photos";
  id: string;
  teamId: string;
  zoneId: string | null;
  challengeId: string;
  value: string;
  photoUrl?: string;
  status: ReviewStatus;
  points: number;
  createdAt: string;
}

function AdminDashboard({ onLogout }: { onLogout: () => void }) {
  const queryClient = useQueryClient();
  const { data: ranking } = useRanking();
  const { data: teams } = useTeams();
  const { data: zones } = useZones();
  const { data: challenges } = useAllChallenges();
  const { data: actions } = usePointActions();
  const { data: answers } = useAnswers();
  const { data: quiz } = useQuizAnswers();
  const { data: photos } = usePhotos();
  const { data: progress } = useProgress();
  const { data: notifications } = useNotifications();

  useRealtime(
    ["scores", "answers", "quiz_answers", "photos", "team_progress", "notifications", "challenges"],
    () => {
      void queryClient.invalidateQueries();
    },
  );

  const [teamFilter, setTeamFilter] = useState("all");
  const [zoneFilter, setZoneFilter] = useState("all");
  const [noteTitle, setNoteTitle] = useState("");
  const [noteBody, setNoteBody] = useState("");
  const [noteTarget, setNoteTarget] = useState("all");
  const [queue, setQueue] = useState<{ items: ReviewItem[]; index: number } | null>(null);

  const refresh = () => queryClient.invalidateQueries();
  const teamName = (id: string) => teams?.find((t) => t.id === id)?.name ?? id;
  const challenge = (id: string) => challenges?.find((c) => c.id === id);
  const challengeTitle = (id: string) => challenge(id)?.title ?? id;
  const zoneName = (id: string | null) => (id ? (zones?.find((z) => z.id === id)?.name ?? id) : "Bonus");
  const fmt = (iso: string) => new Date(iso).toLocaleString("nl-BE");

  const sortedZones = sortZones(zones ?? []);
  const bonusChallenges = (challenges ?? []).filter((c) => c.is_bonus);
  const regularChallenges = (challenges ?? []).filter((c) => !c.is_bonus);

  const items: ReviewItem[] = useMemo(
    () => [
      ...(answers ?? []).map((a) => ({
        table: "answers" as const,
        id: a.id,
        teamId: a.team_id,
        zoneId: a.zone_id,
        challengeId: a.challenge_id,
        value: a.answer,
        status: a.status,
        points: a.points_awarded,
        createdAt: a.created_at,
      })),
      ...(quiz ?? []).map((q) => ({
        table: "quiz_answers" as const,
        id: q.id,
        teamId: q.team_id,
        zoneId: q.zone_id,
        challengeId: q.challenge_id,
        value: q.selected_option,
        status: q.status,
        points: q.points_awarded,
        createdAt: q.created_at,
      })),
    ],
    [answers, quiz],
  );

  const photoItems: ReviewItem[] = useMemo(
    () =>
      (photos ?? []).map((p) => ({
        table: "photos" as const,
        id: p.id,
        teamId: p.team_id,
        zoneId: p.zone_id,
        challengeId: p.challenge_id,
        value: "foto",
        photoUrl: p.photo_url,
        status: p.status,
        points: p.points_awarded,
        createdAt: p.created_at,
      })),
    [photos],
  );

  const matches = (row: ReviewItem) =>
    (teamFilter === "all" || row.teamId === teamFilter) &&
    (zoneFilter === "all" || row.zoneId === zoneFilter);

  const filteredItems = items.filter(matches);
  const filteredPhotos = photoItems.filter(matches);
  const pendingAnswers = filteredItems.filter((r) => r.status === "pending");
  const pendingPhotos = filteredPhotos.filter((r) => r.status === "pending");

  async function decide(item: ReviewItem, approve: boolean) {
    const input = {
      table: item.table,
      id: item.id,
      teamId: item.teamId,
      zoneId: item.zoneId,
      currentPoints: item.points,
      challenge: challenge(item.challengeId),
    };
    try {
      if (approve) await approveSubmission(input);
      else await rejectSubmission(input);
      toast.success(approve ? "Goedgekeurd." : "Afgekeurd.");
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Beoordelen mislukt.");
    }
  }

  async function decideInQueue(approve: boolean) {
    if (!queue) return;
    const item = queue.items[queue.index];
    if (!item) return;
    await decide(item, approve);
    const next = queue.index + 1;
    if (next >= queue.items.length) setQueue(null);
    else setQueue({ ...queue, index: next });
  }

  async function sendNotification() {
    if (!noteTitle.trim()) return;
    try {
      await createNotification({
        title: noteTitle.trim(),
        body: noteBody.trim() || null,
        audience: noteTarget === "all" ? "all" : "team",
        teamId: noteTarget === "all" ? null : noteTarget,
      });
      setNoteTitle("");
      setNoteBody("");
      toast.success("Melding verstuurd.");
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Versturen mislukt.");
    }
  }

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

  const current = queue?.items[queue.index];

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
      <Tabs defaultValue="answers" className="mt-4">
        <TabsList className="grid w-full grid-cols-4 rounded-2xl text-xs">
          <TabsTrigger value="answers">Antwoorden</TabsTrigger>
          <TabsTrigger value="opdrachten">Opdrachten</TabsTrigger>
          <TabsTrigger value="meldingen">Meldingen</TabsTrigger>
          <TabsTrigger value="beheer">Beheer</TabsTrigger>
        </TabsList>

        {/* ---------------- antwoorden ---------------- */}
        <TabsContent value="answers" className="mt-4 space-y-4">
          <Section title="Filters">
            <div className="grid gap-2">
              <Select value={teamFilter} onValueChange={setTeamFilter}>
                <SelectTrigger className="h-12 rounded-2xl">
                  <SelectValue placeholder="Team" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle teams</SelectItem>
                  {(teams ?? []).map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={zoneFilter} onValueChange={setZoneFilter}>
                <SelectTrigger className="h-12 rounded-2xl">
                  <SelectValue placeholder="Zone" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle zones</SelectItem>
                  {sortedZones.map((z) => (
                    <SelectItem key={z.id} value={z.id}>
                      {z.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </Section>

          {teamFilter !== "all" ? (
            <Section title={`Punten — ${teamName(teamFilter)}`}>
              <p className="text-sm text-muted-foreground">
                Huidige stand:{" "}
                <span className="font-bold text-primary">
                  {ranking?.find((r) => r.team.id === teamFilter)?.points ?? 0} pt
                </span>
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {(actions ?? []).map((action) => (
                  <Button
                    key={action.id}
                    size="lg"
                    variant={action.points >= 0 ? "default" : "destructive"}
                    className="h-12 min-w-16 flex-1 rounded-2xl text-base"
                    onClick={async () => {
                      await addPoints(teamFilter, action.points);
                      await refresh();
                    }}
                  >
                    {action.label}
                  </Button>
                ))}
              </div>
            </Section>
          ) : null}

          <Section title="Nakijken">
            <div className="grid gap-2">
              <Button
                className="h-12 rounded-2xl"
                disabled={pendingAnswers.length === 0}
                onClick={() => setQueue({ items: pendingAnswers, index: 0 })}
              >
                Antwoorden nakijken ({pendingAnswers.length})
              </Button>
              <Button
                variant="secondary"
                className="h-12 rounded-2xl"
                disabled={pendingPhotos.length === 0}
                onClick={() => setQueue({ items: pendingPhotos, index: 0 })}
              >
                Foto's nakijken ({pendingPhotos.length})
              </Button>
            </div>
          </Section>

          <Section title={`Antwoorden (${filteredItems.length})`}>
            {filteredItems.map((row) => (
              <ReviewRow
                key={row.id}
                title={`${teamName(row.teamId)} — ${challengeTitle(row.challengeId)}`}
                subtitle={`${row.value} · ${zoneName(row.zoneId)} · ${fmt(row.createdAt)}`}
                status={row.status}
                onApprove={() => decide(row, true)}
                onReject={() => decide(row, false)}
              />
            ))}
            {filteredItems.length === 0 ? (
              <p className="text-sm text-muted-foreground">Geen antwoorden.</p>
            ) : null}
          </Section>

          <Section title={`Foto's (${filteredPhotos.length})`}>
            <div className="grid grid-cols-2 gap-3">
              {filteredPhotos.map((row) => (
                <div key={row.id} className="space-y-1 rounded-2xl bg-muted p-2">
                  <a href={row.photoUrl} target="_blank" rel="noreferrer">
                    <img
                      src={row.photoUrl}
                      alt={`${teamName(row.teamId)} — ${challengeTitle(row.challengeId)}`}
                      loading="lazy"
                      className="aspect-square w-full rounded-xl object-cover"
                    />
                  </a>
                  <p className="truncate text-[11px] font-semibold">{teamName(row.teamId)}</p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {challengeTitle(row.challengeId)}
                  </p>
                  <StatusPill status={row.status} />
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      className="h-9 flex-1 rounded-xl"
                      onClick={() => decide(row, true)}
                      aria-label="Goedkeuren"
                    >
                      <Check className="size-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      className="h-9 flex-1 rounded-xl"
                      onClick={() => decide(row, false)}
                      aria-label="Afkeuren"
                    >
                      <X className="size-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            {filteredPhotos.length === 0 ? (
              <p className="text-sm text-muted-foreground">Geen foto's.</p>
            ) : null}
          </Section>
        </TabsContent>

        {/* ---------------- opdrachten ---------------- */}
        <TabsContent value="opdrachten" className="mt-4 space-y-4">
          <Section title="Bonusopdrachten">
            <p className="text-sm text-muted-foreground">
              Activeren stuurt meteen een melding naar alle teams en start de klok.
            </p>
            <div className="mt-2 space-y-3">
              {bonusChallenges.map((c) => (
                <BonusRow key={c.id} challenge={c} onDone={refresh} />
              ))}
              {bonusChallenges.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nog geen bonusopdrachten in de database.
                </p>
              ) : null}
            </div>
          </Section>

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
                  Opdrachten voltooid: {doneIds.size}/{regularChallenges.filter((c) => c.active).length}
                </p>
                <ul className="mt-2 space-y-1 text-sm">
                  {rows.map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate">{zoneName(p.zone_id)}</span>
                      <span className="shrink-0">
                        {p.unlocked ? "🔑" : "🔒"} {p.completed ? "✅" : ""}
                      </span>
                    </li>
                  ))}
                  {rows.length === 0 ? <li className="text-muted-foreground">Geen voortgang.</li> : null}
                </ul>
              </Section>
            );
          })}

          <Section title="Opdrachten aan/uit">
            <p className="text-sm text-muted-foreground">
              Uitgeschakelde opdrachten verdwijnen meteen bij de teams, maar blijven hier zichtbaar.
            </p>
            <div className="mt-2 space-y-3">
              {sortedZones.map((zone) => (
                <div key={zone.id}>
                  <p className="text-sm font-semibold">{zone.name}</p>
                  <ul className="mt-1 space-y-1">
                    {regularChallenges
                      .filter((c) => c.zone_id === zone.id)
                      .map((c) => (
                        <li
                          key={c.id}
                          className="flex items-center justify-between gap-3 rounded-2xl bg-muted px-3 py-2"
                        >
                          <span className="min-w-0 truncate text-sm">
                            {c.active ? "" : "💤 "}
                            {c.title}
                          </span>
                          <Switch
                            checked={c.active}
                            aria-label={`${c.title} activeren`}
                            onCheckedChange={async (checked) => {
                              await setChallengeActive(c.id, checked);
                              await refresh();
                            }}
                          />
                        </li>
                      ))}
                  </ul>
                </div>
              ))}
            </div>
          </Section>

          <div className="flex gap-2">
            <Button
              className="h-12 flex-1 rounded-2xl"
              onClick={() => guarded("Alle zones openen.", () => setAllZones(true))}
            >
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
        </TabsContent>

        {/* ---------------- meldingen ---------------- */}
        <TabsContent value="meldingen" className="mt-4 space-y-4">
          <Section title="Nieuwe melding">
            <div className="grid gap-2">
              <Input
                value={noteTitle}
                onChange={(e) => setNoteTitle(e.target.value)}
                placeholder="Titel, bv. 📢 Zone ontgrendeld"
                className="h-12 rounded-2xl text-base"
              />
              <Textarea
                value={noteBody}
                onChange={(e) => setNoteBody(e.target.value)}
                placeholder="Bericht (optioneel)"
                rows={3}
                className="rounded-2xl text-base"
              />
              <Select value={noteTarget} onValueChange={setNoteTarget}>
                <SelectTrigger className="h-12 rounded-2xl">
                  <SelectValue placeholder="Ontvanger" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle teams</SelectItem>
                  {(teams ?? []).map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button className="h-12 rounded-2xl" disabled={!noteTitle.trim()} onClick={sendNotification}>
                <Send className="size-4" /> Versturen
              </Button>
            </div>
          </Section>

          <Section title={`Geschiedenis (${notifications?.length ?? 0})`}>
            {(notifications ?? []).map((n) => (
              <div key={n.id} className="rounded-2xl bg-muted px-3 py-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{n.title}</p>
                    {n.body ? (
                      <p className="whitespace-pre-line text-xs text-muted-foreground">{n.body}</p>
                    ) : null}
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {n.audience === "all"
                        ? "Alle teams"
                        : n.audience === "admin"
                          ? "Spelleiding"
                          : teamName(n.team_id ?? "")}{" "}
                      · {fmt(n.created_at)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Switch
                      checked={n.active}
                      aria-label="Melding actief"
                      onCheckedChange={async (checked) => {
                        await setNotificationActive(n.id, checked);
                        await refresh();
                      }}
                    />
                    <Button
                      size="icon"
                      variant="destructive"
                      className="size-9 rounded-xl"
                      aria-label="Melding verwijderen"
                      onClick={() => guarded("Melding verwijderen.", () => deleteNotification(n.id))}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
            {(notifications ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">Nog geen meldingen.</p>
            ) : null}
          </Section>
        </TabsContent>

        {/* ---------------- beheer ---------------- */}
        <TabsContent value="beheer" className="mt-4 space-y-3">
          <Section title="Teams resetten">
            <div className="grid gap-2">
              {(teams ?? []).map((team) => (
                <Button
                  key={team.id}
                  variant="secondary"
                  className="h-11 rounded-2xl"
                  onClick={() =>
                    guarded(`Reset voortgang van ${team.name}.`, () => resetTeamProgress(team.id))
                  }
                >
                  Reset {team.name}
                </Button>
              ))}
            </div>
          </Section>

          <Section title="Exporteren">
            <div className="grid gap-2">
              <Button
                variant="secondary"
                className="h-12 rounded-2xl"
                onClick={() =>
                  downloadCsv(
                    "antwoorden.csv",
                    items.map((row) => ({
                      type: row.table,
                      team: teamName(row.teamId),
                      zone: zoneName(row.zoneId),
                      opdracht: challengeTitle(row.challengeId),
                      antwoord: row.value,
                      status: row.status,
                      punten: row.points,
                      tijdstip: row.createdAt,
                    })),
                  )
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
                    photoItems.map((p) => ({
                      team: teamName(p.teamId),
                      zone: zoneName(p.zoneId),
                      opdracht: challengeTitle(p.challengeId),
                      status: p.status,
                      punten: p.points,
                      url: p.photoUrl,
                      tijdstip: p.createdAt,
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

      {/* ---------------- review-modal ---------------- */}
      <Dialog open={current !== undefined} onOpenChange={(open) => !open && setQueue(null)}>
        <DialogContent className="max-w-sm rounded-3xl">
          <DialogHeader>
            <DialogTitle className="text-2xl">
              {current ? challengeTitle(current.challengeId) : ""}
            </DialogTitle>
            <DialogDescription className="text-base">
              {current ? `${teamName(current.teamId)} · ${zoneName(current.zoneId)}` : ""}
            </DialogDescription>
          </DialogHeader>

          {current?.photoUrl ? (
            <img
              src={current.photoUrl}
              alt="Inzending"
              className="max-h-80 w-full rounded-2xl object-contain"
            />
          ) : (
            <p className="whitespace-pre-line rounded-2xl bg-muted p-4 text-lg font-semibold">
              {current?.value}
            </p>
          )}

          <p className="text-center text-xs text-muted-foreground">
            {queue ? `${queue.index + 1} van ${queue.items.length}` : ""} ·{" "}
            {challenge(current?.challengeId ?? "")?.points ?? 0} punten
          </p>

          <div className="grid grid-cols-2 gap-2">
            <Button className="h-12 rounded-2xl" onClick={() => decideInQueue(true)}>
              <Check className="size-4" /> Goedkeuren
            </Button>
            <Button variant="destructive" className="h-12 rounded-2xl" onClick={() => decideInQueue(false)}>
              <X className="size-4" /> Afkeuren
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

/* ------------------------------ onderdelen ------------------------------ */

function BonusRow({ challenge, onDone }: { challenge: Challenge; onDone: () => void }) {
  const [minutes, setMinutes] = useState(String(challenge.duration_minutes));
  const [points, setPoints] = useState(String(challenge.points));
  const [busy, setBusy] = useState(false);
  const remaining = bonusRemainingMs(challenge);

  async function save() {
    setBusy(true);
    try {
      await updateBonusChallenge(challenge.id, {
        duration_minutes: Math.max(1, Number(minutes) || challenge.duration_minutes),
        points: Number(points) || challenge.points,
      });
      toast.success("Opgeslagen.");
      onDone();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Opslaan mislukt.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2 rounded-2xl bg-muted p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{challenge.title}</p>
          {challenge.description ? (
            <p className="truncate text-xs text-muted-foreground">{challenge.description}</p>
          ) : null}
          {remaining > 0 ? (
            <p className="mt-1 inline-flex items-center gap-1 text-xs font-bold text-primary">
              <Timer className="size-3.5" /> nog {Math.ceil(remaining / 60000)} min
            </p>
          ) : null}
        </div>
        <Switch
          checked={challenge.bonus_active}
          aria-label={`${challenge.title} activeren`}
          onCheckedChange={async (checked) => {
            try {
              await setBonusActive(challenge, checked);
              toast.success(checked ? "Bonusopdracht gestart." : "Bonusopdracht gestopt.");
              onDone();
            } catch (error) {
              toast.error(error instanceof Error ? error.message : "Actie mislukt.");
            }
          }}
        />
      </div>
      <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
        <label className="text-xs font-semibold">
          Minuten
          <Input
            type="number"
            inputMode="numeric"
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
            className="h-10 rounded-xl"
          />
        </label>
        <label className="text-xs font-semibold">
          Punten
          <Input
            type="number"
            inputMode="numeric"
            value={points}
            onChange={(e) => setPoints(e.target.value)}
            className="h-10 rounded-xl"
          />
        </label>
        <Button className="mt-4 h-10 rounded-xl" disabled={busy} onClick={save}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : "Opslaan"}
        </Button>
      </div>
    </div>
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

function ReviewRow({
  title,
  subtitle,
  status,
  onApprove,
  onReject,
}: {
  title: string;
  subtitle: string;
  status: ReviewStatus;
  onApprove: () => void;
  onReject: () => void;
}) {
  return (
    <div className="rounded-2xl bg-muted px-3 py-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{title}</p>
          <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
        </div>
        <StatusPill status={status} />
      </div>
      <div className="mt-2 flex gap-2">
        <Button size="sm" className="h-9 flex-1 rounded-xl" onClick={onApprove}>
          <Check className="size-4" /> Goed
        </Button>
        <Button size="sm" variant="destructive" className="h-9 flex-1 rounded-xl" onClick={onReject}>
          <X className="size-4" /> Af
        </Button>
      </div>
    </div>
  );
}
