import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, Loader2, LogOut, Send, Star, Timer, Trash2, X } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { ConfigNotice } from "@/components/ConfigNotice";
import { StatusPill } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Trophy, ClipboardList, Bell, MapPin, Settings } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  useAllChallenges,
  useAnswers,
  usePhotos,
  usePointActions,
  useProgress,
  useQuizAnswers,
  useRanking,
  useRealtime,
  useTeamLocations,
  useTeams,
  useZones,
  useNotifications,
} from "@/hooks/useGame";
import { addPoints, bonusRemainingMs, sortZones, verifyAdminPassword } from "@/lib/api";
import {
  markPhotoAsGroupPhoto,
  reviewSubmission,
  setBonusActive,
  supportsCreativity,
  updateBonusChallenge,
} from "@/lib/review";
import type { ReviewVerdict } from "@/lib/review";
import {
  deleteAllNotifications,
  deleteNotification,
  createNotification,
  setNotificationActive,
} from "@/lib/notifications";
import { clearAdminSession, saveAdminSession, useAdminSession } from "@/lib/admin-session";
import { AdminMapPanel } from "@/components/AdminMapPanel";
import {
  clearAllAnswers,
  clearAllPhotos,
  createTeam,
  deleteAllTeams,
  deleteTeam,
  downloadCsv,
  fullGameReset,
  setAllZones,
  setChallengeActive,
  updateTeam,
} from "@/lib/admin";
import { isSupabaseConfigured } from "@/lib/supabase";
import type { Challenge, ReviewStatus, Team } from "@/lib/types";

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
  creativity: number;
  isGroupPhoto: boolean;
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
  const { data: locations } = useTeamLocations();

  useRealtime(["scores", "answers", "quiz_answers", "photos", "team_progress", "notifications", "challenges"], () => {
    void queryClient.invalidateQueries();
  });

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

  // Wachtende inzendingen staan altijd bovenaan.
  const pendingFirst = (rows: ReviewItem[]) =>
    [...rows].sort((a, b) => {
      if (a.status === b.status) return a.createdAt.localeCompare(b.createdAt);
      return a.status === "pending" ? -1 : b.status === "pending" ? 1 : 0;
    });

  const items: ReviewItem[] = useMemo(
    () =>
      pendingFirst([
        ...(answers ?? []).map((a) => ({
          table: "answers" as const,
          id: a.id,
          teamId: a.team_id,
          zoneId: a.zone_id,
          challengeId: a.challenge_id,
          value: a.answer,
          status: a.status,
          points: a.points_awarded,
          creativity: a.creativity_points ?? 0,
          isGroupPhoto: false,
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
          creativity: q.creativity_points ?? 0,
          isGroupPhoto: false,
          createdAt: q.created_at,
        })),
      ]),
    [answers, quiz],
  );

  const photoItems: ReviewItem[] = useMemo(
    () =>
      pendingFirst(
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
          creativity: p.creativity_points ?? 0,
          isGroupPhoto: p.is_group_photo ?? false,
          createdAt: p.created_at,
        })),
      ),
    [photos],
  );

  const matches = (row: ReviewItem) =>
    (teamFilter === "all" || row.teamId === teamFilter) && (zoneFilter === "all" || row.zoneId === zoneFilter);

  const filteredItems = items.filter(matches);
  const filteredPhotos = photoItems.filter(matches);
  const pendingAnswers = filteredItems.filter((r) => r.status === "pending");
  const pendingPhotos = filteredPhotos.filter((r) => r.status === "pending");

  async function decide(item: ReviewItem, verdict: ReviewVerdict) {
    try {
      await reviewSubmission(
        {
          table: item.table,
          id: item.id,
          teamId: item.teamId,
          zoneId: item.zoneId,
          currentPoints: item.points,
          currentCreativity: item.creativity,
          challenge: challenge(item.challengeId),
        },
        verdict,
      );
      toast.success(
        verdict === "rejected"
          ? "Afgekeurd."
          : verdict === "excellent"
            ? "Goedgekeurd met creativiteitsbonus."
            : "Goedgekeurd.",
      );
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Beoordelen mislukt.");
    }
  }

  async function decideInQueue(verdict: ReviewVerdict) {
    if (!queue) return;
    const item = queue.items[queue.index];
    if (!item) return;
    await decide(item, verdict);
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
        <TabsList className="grid w-full grid-cols-5 rounded-2xl">
          <TabsTrigger value="answers">
            <Trophy className="h-5 w-5" />
          </TabsTrigger>

          <TabsTrigger value="opdrachten">
            <ClipboardList className="h-5 w-5" />
          </TabsTrigger>

          <TabsTrigger value="meldingen">
            <Bell className="h-5 w-5" />
          </TabsTrigger>

          <TabsTrigger value="map">
            <MapPin className="h-5 w-5" />
          </TabsTrigger>

          <TabsTrigger value="beheer">
            <Settings className="h-5 w-5" />
          </TabsTrigger>
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
                creativity={row.creativity}
                canExcel={supportsCreativity(challenge(row.challengeId))}
                onApprove={() => decide(row, "approved")}
                onReject={() => decide(row, "rejected")}
                onExcellent={() => decide(row, "excellent")}
              />
            ))}
            {filteredItems.length === 0 ? <p className="text-sm text-muted-foreground">Geen antwoorden.</p> : null}
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
                  <p className="truncate text-[11px] text-muted-foreground">{challengeTitle(row.challengeId)}</p>
                  <StatusPill status={row.status} creativity={row.creativity} />
                  <label className="flex items-center justify-between gap-2 text-[11px] font-semibold">
                    Teamfoto
                    <Switch
                      checked={row.isGroupPhoto}
                      aria-label="Als teamfoto gebruiken"
                      onCheckedChange={async (checked) => {
                        await markPhotoAsGroupPhoto(row.id, row.teamId, checked);
                        await refresh();
                      }}
                    />
                  </label>
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      className="h-9 flex-1 rounded-xl"
                      onClick={() => decide(row, "approved")}
                      aria-label="Goedkeuren"
                    >
                      <Check className="size-4" />
                    </Button>
                    {supportsCreativity(challenge(row.challengeId)) ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        className="h-9 flex-1 rounded-xl"
                        onClick={() => decide(row, "excellent")}
                        aria-label="Uitstekend"
                      >
                        <Star className="size-4" />
                      </Button>
                    ) : null}
                    <Button
                      size="sm"
                      variant="destructive"
                      className="h-9 flex-1 rounded-xl"
                      onClick={() => decide(row, "rejected")}
                      aria-label="Afkeuren"
                    >
                      <X className="size-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            {filteredPhotos.length === 0 ? <p className="text-sm text-muted-foreground">Geen foto's.</p> : null}
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
                <p className="text-sm text-muted-foreground">Nog geen bonusopdrachten in de database.</p>
              ) : null}
              {draft?.kind === "bonus" ? (
                <div className="rounded-2xl bg-muted p-3">
                  <ChallengeEditor
                    value={draft.value}
                    onChange={(value) => setDraft({ ...draft, value })}
                    onSaved={() => {
                      setDraft(null);
                      void refresh();
                    }}
                    onCancel={() => setDraft(null)}
                  />
                </div>
              ) : (
                <Button
                  variant="secondary"
                  className="h-11 w-full rounded-2xl"
                  onClick={() =>
                    setDraft({
                      kind: "bonus",
                      value: emptyChallenge({ isBonus: true, sortOrder: bonusChallenges.length }),
                    })
                  }
                >
                  <Plus className="mr-1 size-4" /> Bonusopdracht toevoegen
                </Button>
              )}
            </div>
          </Section>

          <Section title="Opdrachten beheren">
            <p className="text-sm text-muted-foreground">
              Tik op een opdracht om ze te bewerken. Locatieopdrachten (📍) staan bij hun zone.
            </p>
            <div className="mt-2 space-y-4">
              {sortedZones.map((zone) => {
                const zoneChallenges = [
                  ...regularChallenges.filter((c) => c.zone_id === zone.id && !c.is_location),
                  ...locationChallengesByZone(zone.id),
                ].sort((a, b) => a.sort_order - b.sort_order);
                return (
                  <div key={zone.id} className="space-y-1">
                    <p className="text-sm font-semibold">
                      {zone.name} <span className="text-muted-foreground">({zoneChallenges.length})</span>
                    </p>
                    {zoneChallenges.map((c) => (
                      <div key={c.id} className="rounded-2xl bg-muted px-3 py-2">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            className="min-w-0 flex-1 truncate text-left text-sm"
                            onClick={() =>
                              setEditing((prev) => (prev === c.id ? null : c.id))
                            }
                          >
                            {c.is_location ? "📍 " : ""}
                            {c.active ? "" : "💤 "}
                            {c.title}
                            <span className="ml-1 text-xs text-muted-foreground">{c.points}p</span>
                          </button>
                          <Switch
                            checked={c.active}
                            aria-label={`${c.title} activeren`}
                            onCheckedChange={async (checked) => {
                              await setChallengeActive(c.id, checked);
                              await refresh();
                            }}
                          />
                        </div>
                        {editing === c.id ? (
                          <div className="mt-2">
                            <ChallengeEditor
                              challengeId={c.id}
                              value={editValue ?? toInput(c)}
                              onChange={setEditValue}
                              onSaved={() => {
                                setEditing(null);
                                setEditValue(null);
                                void refresh();
                              }}
                              onCancel={() => {
                                setEditing(null);
                                setEditValue(null);
                              }}
                            />
                          </div>
                        ) : null}
                      </div>
                    ))}
                    {draft?.kind === "zone" && draft.zoneId === zone.id ? (
                      <div className="rounded-2xl bg-muted p-3">
                        <ChallengeEditor
                          value={draft.value}
                          onChange={(value) => setDraft({ ...draft, value })}
                          onSaved={() => {
                            setDraft(null);
                            void refresh();
                          }}
                          onCancel={() => setDraft(null)}
                        />
                      </div>
                    ) : (
                      <Button
                        variant="ghost"
                        className="h-10 w-full rounded-2xl text-xs"
                        onClick={() =>
                          setDraft({
                            kind: "zone",
                            zoneId: zone.id,
                            value: emptyChallenge({
                              zoneId: zone.id,
                              sortOrder: zoneChallenges.length,
                            }),
                          })
                        }
                      >
                        <Plus className="mr-1 size-4" /> Opdracht toevoegen aan {zone.name}
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          </Section>

          <Section title="Teamoverzicht">
            <ul className="space-y-2">
              {(teams ?? []).map((team) => {
                const rows = (progress ?? []).filter((p) => p.team_id === team.id);
                const doneIds = new Set([
                  ...(answers ?? []).filter((a) => a.team_id === team.id).map((a) => a.challenge_id),
                  ...(quiz ?? []).filter((a) => a.team_id === team.id).map((a) => a.challenge_id),
                  ...(photos ?? []).filter((p) => p.team_id === team.id).map((p) => p.challenge_id),
                ]);
                return (
                  <li key={team.id} className="rounded-2xl bg-muted px-3 py-2">
                    <p className="flex items-center gap-2 text-sm font-semibold">
                      <span aria-hidden>{gpsIndicator(team.id)}</span>
                      <span className="min-w-0 truncate">{team.name}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {doneIds.size}/{regularChallenges.filter((c) => c.active).length} opdrachten ·{" "}
                      {rows.filter((p) => p.unlocked).length} zones open
                    </p>
                    <p className="mt-1 flex flex-wrap gap-1 text-xs">
                      {rows.map((p) => (
                        <span key={p.id} className="rounded-lg bg-background px-2 py-0.5">
                          {zoneName(p.zone_id)} {p.unlocked ? "🔑" : "🔒"}
                          {p.completed ? "✅" : ""}
                        </span>
                      ))}
                    </p>
                  </li>
                );
              })}
              {(teams ?? []).length === 0 ? (
                <li className="text-sm text-muted-foreground">Nog geen teams.</li>
              ) : null}
            </ul>
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
            <Button
              variant="destructive"
              className="h-11 w-full rounded-2xl"
              disabled={(notifications ?? []).length === 0}
              onClick={() => guarded("Alle meldingen en leesstatussen verwijderen.", deleteAllNotifications)}
            >
              <Trash2 className="size-4" /> Alle meldingen verwijderen
            </Button>

            {(notifications ?? []).map((n) => (
              <div key={n.id} className="rounded-2xl bg-muted px-3 py-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{n.title}</p>
                    {n.body ? <p className="whitespace-pre-line text-xs text-muted-foreground">{n.body}</p> : null}
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {n.audience === "all"
                        ? "Alle teams"
                        : n.audience === "admin"
                          ? "Reisleider"
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

        {/* ---------------- map ---------------- */}
        <TabsContent value="map" className="mt-4">
          <AdminMapPanel />
        </TabsContent>

        {/* ---------------- beheer ---------------- */}

        <TabsContent value="beheer" className="mt-4 space-y-3">
          <Section title="Teams">
            <TeamManager onDone={refresh} />
          </Section>

          <Section title="Teamoverzicht">
            <ul className="space-y-2">
              {(teams ?? []).map((team) => {
                const unlocked = (progress ?? []).filter((p) => p.team_id === team.id && p.unlocked);
                const currentZone =
                  sortedZones.filter((z) => unlocked.some((p) => p.zone_id === z.id)).at(-1)?.name ?? "—";
                const activity = [...items, ...photoItems]
                  .filter((r) => r.teamId === team.id)
                  .map((r) => r.createdAt)
                  .sort()
                  .at(-1);
                const gps = (locations ?? []).find((l) => l.team_id === team.id)?.updated_at;
                return (
                  <li key={team.id} className="rounded-2xl bg-muted px-3 py-2 text-sm">
                    <p className="font-semibold">{team.name}</p>
                    <p className="text-xs text-muted-foreground">
                      Zone: {currentZone} · Laatste activiteit: {activity ? fmt(activity) : "—"} · GPS:{" "}
                      {gps ? fmt(gps) : "—"}
                    </p>
                  </li>
                );
              })}
              {(teams ?? []).length === 0 ? <li className="text-sm text-muted-foreground">Nog geen teams.</li> : null}
            </ul>
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
                onClick={() =>
                  guarded(
                    "Volledige reset: antwoorden, foto's, meldingen, scores, voortgang, prestaties, locaties en locatieopdrachten worden gewist. Bonusopdrachten gaan uit.",
                    fullGameReset,
                  )
                }
              >
                Volledige reset
              </Button>
              <Button
                variant="destructive"
                className="h-12 rounded-2xl"
                onClick={() => guarded("Alle teams én al hun gegevens verwijderen.", deleteAllTeams)}
              >
                Alle teams verwijderen
              </Button>
            </div>
          </Section>
        </TabsContent>
      </Tabs>

      {/* ---------------- review-modal ---------------- */}
      <Dialog open={current !== undefined} onOpenChange={(open) => !open && setQueue(null)}>
        <DialogContent className="max-w-sm rounded-3xl">
          <DialogHeader>
            <DialogTitle className="text-2xl">{current ? challengeTitle(current.challengeId) : ""}</DialogTitle>
            <DialogDescription className="text-base">
              {current ? `${teamName(current.teamId)} · ${zoneName(current.zoneId)}` : ""}
            </DialogDescription>
          </DialogHeader>

          {current?.photoUrl ? (
            <img src={current.photoUrl} alt="Inzending" className="max-h-80 w-full rounded-2xl object-contain" />
          ) : (
            <p className="whitespace-pre-line rounded-2xl bg-muted p-4 text-lg font-semibold">{current?.value}</p>
          )}

          <p className="text-center text-xs text-muted-foreground">
            {queue ? `${queue.index + 1} van ${queue.items.length}` : ""} ·{" "}
            {challenge(current?.challengeId ?? "")?.points ?? 0} punten
            {supportsCreativity(challenge(current?.challengeId ?? ""))
              ? ` · ⭐ +${challenge(current?.challengeId ?? "")?.creativity_bonus_points} mogelijk`
              : ""}
          </p>

          {current?.photoUrl ? (
            <label className="flex items-center justify-between gap-3 rounded-2xl bg-muted px-3 py-2 text-sm font-semibold">
              Gebruik als teamfoto
              <Switch
                checked={current.isGroupPhoto}
                aria-label="Als teamfoto gebruiken"
                onCheckedChange={async (checked) => {
                  await markPhotoAsGroupPhoto(current.id, current.teamId, checked);
                  await refresh();
                }}
              />
            </label>
          ) : null}

          <div className="grid grid-cols-2 gap-2">
            <Button className="h-12 rounded-2xl" onClick={() => decideInQueue("approved")}>
              <Check className="size-4" /> Goedkeuren
            </Button>
            <Button variant="destructive" className="h-12 rounded-2xl" onClick={() => decideInQueue("rejected")}>
              <X className="size-4" /> Afkeuren
            </Button>
            {supportsCreativity(challenge(current?.challengeId ?? "")) ? (
              <Button
                variant="secondary"
                className="col-span-2 h-12 rounded-2xl"
                onClick={() => decideInQueue("excellent")}
              >
                <Star className="size-4" /> Uitstekend (+creativiteit)
              </Button>
            ) : null}
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
  creativity,
  canExcel,
  onApprove,
  onReject,
  onExcellent,
}: {
  title: string;
  subtitle: string;
  status: ReviewStatus;
  creativity: number;
  canExcel: boolean;
  onApprove: () => void;
  onReject: () => void;
  onExcellent: () => void;
}) {
  return (
    <div className="rounded-2xl bg-muted px-3 py-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{title}</p>
          <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
        </div>
        <StatusPill status={status} creativity={creativity} />
      </div>
      <div className="mt-2 flex gap-2">
        <Button size="sm" className="h-9 flex-1 rounded-xl" onClick={onApprove}>
          <Check className="size-4" /> Goed
        </Button>
        {canExcel ? (
          <Button
            size="sm"
            variant="secondary"
            className="h-9 flex-1 rounded-xl"
            onClick={onExcellent}
            aria-label="Uitstekend met creativiteitsbonus"
          >
            <Star className="size-4" /> Top
          </Button>
        ) : null}
        <Button size="sm" variant="destructive" className="h-9 flex-1 rounded-xl" onClick={onReject}>
          <X className="size-4" /> Af
        </Button>
      </div>
    </div>
  );
}

/** Teams aanmaken, hernoemen, wachtwoord wijzigen en verwijderen. */
function TeamManager({ onDone }: { onDone: () => void }) {
  const { data: teams } = useTeams();
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    try {
      await action();
      toast.success("Klaar.");
      onDone();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Actie mislukt.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-2 rounded-2xl bg-muted p-3">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Teamnaam"
          className="h-11 rounded-xl"
        />
        <Input
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Teamwachtwoord"
          className="h-11 rounded-xl"
        />
        <Button
          className="h-11 rounded-xl"
          disabled={busy || !name.trim() || !password.trim()}
          onClick={() =>
            run(async () => {
              await createTeam({ name, password, sortOrder: (teams?.length ?? 0) + 1 });
              setName("");
              setPassword("");
            })
          }
        >
          Team toevoegen
        </Button>
      </div>

      {(teams ?? []).map((team) => (
        <TeamRow key={team.id} team={team} busy={busy} onRun={run} />
      ))}
      {(teams ?? []).length === 0 ? <p className="text-sm text-muted-foreground">Nog geen teams.</p> : null}
    </div>
  );
}

function TeamRow({
  team,
  busy,
  onRun,
}: {
  team: Team;
  busy: boolean;
  onRun: (action: () => Promise<unknown>) => Promise<void>;
}) {
  const [name, setName] = useState(team.name);
  const [password, setPassword] = useState(team.password);

  return (
    <div className="grid gap-2 rounded-2xl bg-muted p-3">
      <Input value={name} onChange={(e) => setName(e.target.value)} className="h-11 rounded-xl" />
      <Input value={password} onChange={(e) => setPassword(e.target.value)} className="h-11 rounded-xl" />
      <div className="flex gap-2">
        <Button
          className="h-11 flex-1 rounded-xl"
          disabled={busy}
          onClick={() => onRun(() => updateTeam(team.id, { name: name.trim(), password: password.trim() }))}
        >
          Opslaan
        </Button>
        <Button
          variant="destructive"
          className="h-11 rounded-xl"
          disabled={busy}
          aria-label={`${team.name} verwijderen`}
          onClick={() => {
            if (!window.confirm(`${team.name} en alle gegevens verwijderen?`)) return;
            void onRun(() => deleteTeam(team.id));
          }}
        >
          <Trash2 className="size-4" />
        </Button>
      </div>
    </div>
  );
}
