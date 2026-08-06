import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { LogOut, Loader2, MapPin } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { ConfigNotice } from "@/components/ConfigNotice";
import { ZoneCard } from "@/components/ZoneCard";
import { ChallengeCard } from "@/components/ChallengeCard";
import { PwaInstallHint } from "@/components/PwaInstallHint";
import { BonusChallengeCard } from "@/components/BonusChallengeCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  useAnswers,
  useChallenges,
  useLocationChallengeStates,
  useLocationEvents,
  usePhotos,
  useProgress,
  useQuizAnswers,
  useRanking,
  useRealtime,
  useSettings,
  useTeams,
  useZones,
} from "@/hooks/useGame";
import { enableLocationSharing, useLocationTracking, requestLocationPermission } from "@/hooks/useLocationTracking";
import { TRACKING_KEY } from "@/components/AdminMapPanel";
import {
  activeBonusChallenges,
  loginTeam,
  openLocationChallenges,
  zoneProgressChallenges,
  unlockZoneWithPassword,
  unlockedZoneIds,
  zoneNeedsPassword,
} from "@/lib/api";
import { setLocationChallengeState, showLocationToast, fetchTeamLocations } from "@/lib/locations";
import { fireConfetti } from "@/lib/confetti";
import type { ReviewStatus, Zone } from "@/lib/types";
import { clearSession, saveSession, useTeamSession } from "@/lib/session";
import { arrivalDone, useArrival } from "@/lib/arrival";
import { ArrivalScreen } from "@/components/ArrivalScreen";
import { isSupabaseConfigured } from "@/lib/supabase";

const MEDALS = ["🥇", "🥈", "🥉"];

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "BOW in Tanzania — Teambuilding expeditie" },
      {
        name: "description",
        content: "Speel de Tanzania-expeditie: ontgrendel zones, los opdrachten op en verzamel punten met je team.",
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
  return session ? <SessionScreen teamId={session.teamId} teamName={session.teamName} /> : <LoginScreen />;
}

/** Eerste keer per team + toestel: aankomstscherm in plaats van Home. */
function SessionScreen({ teamId, teamName }: { teamId: string; teamName: string }) {
  const { done, hydrated, complete } = useArrival(teamId);
  if (!hydrated) return null;
  if (!done) return <ArrivalScreen teamName={teamName} onDone={complete} />;
  return <HomeScreen teamId={teamId} />;
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
      // Eerste login op dit toestel: geen toast, het aankomstscherm neemt over.
      if (arrivalDone(team.id)) toast.success(`Welkom, ${team.name}!`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Inloggen mislukt.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bg-hero flex min-h-[100dvh] flex-col justify-end px-4 pb-10 pt-16">
      <div className="mx-auto w-full max-w-lg text-primary-foreground">
        <p className="text-5xl">🦁🌴⛰️</p>
        <h1 className="mt-4 text-5xl leading-none">{settings?.app_title ?? "BOW in Tanzania"}</h1>
        <p className="mt-2 text-base opacity-90">{settings?.welcome_message ?? "Welkom bij Expeditie Tanzania"}</p>
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

        <PwaInstallHint />

        <Link to="/admin" className="block text-center text-sm text-muted-foreground underline">
          Admin
        </Link>
      </div>
    </div>
  );
}

/* -------------------------------- home -------------------------------- */

function HomeScreen({ teamId }: { teamId: string }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: settings } = useSettings();
  const { data: zones } = useZones();
  const { data: challenges } = useChallenges();
  const { data: progress } = useProgress(teamId);
  const { data: ranking } = useRanking();
  const { data: answers } = useAnswers(teamId);
  const { data: quiz } = useQuizAnswers(teamId);
  const { data: photos } = usePhotos(teamId);
  const { data: locationEvents } = useLocationEvents();
  const { data: locationStates } = useLocationChallengeStates(teamId);

  const [lockedZone, setLockedZone] = useState<Zone | null>(null);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);
  const [consented, setConsented] = useState(false);

  useEffect(() => {
    setConsented(window.localStorage.getItem(CONSENT_KEY) === "true");
  }, []);

  useRealtime(["scores", "challenges", "team_progress", "notifications", "location_challenge_states"], () => {
    void queryClient.invalidateQueries();
  });

  const submissions = useMemo(() => {
    const map = new Map<string, { status: ReviewStatus; points: number }>();
    (answers ?? []).forEach((a) => map.set(a.challenge_id, { status: a.status, points: a.points_awarded }));
    (quiz ?? []).forEach((a) => map.set(a.challenge_id, { status: a.status, points: a.points_awarded }));
    (photos ?? []).forEach((p) => map.set(p.challenge_id, { status: p.status, points: p.points_awarded }));
    return map;
  }, [answers, quiz, photos]);

  const me = ranking?.find((r) => r.team.id === teamId);
  const unlockedIds = unlockedZoneIds(zones ?? [], progress ?? []);
  const trackingOn = (settings?.[TRACKING_KEY] ?? "false") === "true";

  // Zones waar het team nu mee bezig is: ontgrendeld en nog niet afgerond.
  const activeZoneIds = useMemo(
    () =>
      (zones ?? [])
        .filter((z) => unlockedIds.has(z.id) && !(progress ?? []).some((p) => p.zone_id === z.id && p.completed))
        .map((z) => z.id),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [zones, progress, [...unlockedIds].join(",")],
  );

  const { isTracker, takeOver } = useLocationTracking({
    team: me ? { id: me.team.id, name: me.team.name } : null,
    trackingEnabled: trackingOn,
    consented,
    events: locationEvents ?? [],
    activeZoneIds,
    onTriggered: () => queryClient.invalidateQueries(),
  });

  /** Locatieopdrachten zonder zonebeperking horen op het startscherm. */
  const homeLocationChallenges = useMemo(() => {
    const zoneBound = new Set((locationEvents ?? []).filter((e) => e.zone_id).map((e) => e.id));
    return openLocationChallenges(challenges ?? [], locationStates ?? []).filter(
      (c) => !c.location_event_id || !zoneBound.has(c.location_event_id),
    );
  }, [challenges, locationStates, locationEvents]);

  async function dismissLocationChallenge(challengeId: string) {
    await setLocationChallengeState(teamId, challengeId, "dismissed");
    toast.info("Opdracht overgeslagen.");
    await queryClient.invalidateQueries();
  }

  const bonus = useMemo(
    () => activeBonusChallenges(challenges ?? []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [challenges, tick],
  );

  async function askLocation() {
    const ok = await enableLocationSharing();
    setConsented(ok);
    toast[ok ? "success" : "error"](ok ? "Locatie delen staat aan." : "Zonder locatie kunnen we jullie niet volgen.");
  }

  async function handleUnlock() {
    if (!lockedZone) return;
    setBusy(true);
    try {
      await unlockZoneWithPassword(teamId, lockedZone, password);
      fireConfetti();
      toast.success(`${lockedZone.name} ontgrendeld!`);
      const id = lockedZone.id;
      setLockedZone(null);
      setPassword("");
      await queryClient.invalidateQueries();
      void navigate({ to: "/zone/$zoneId", params: { zoneId: id } });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Ontgrendelen mislukt.");
    } finally {
      setBusy(false);
    }
  }

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
      <Link
        data-tour="team-bar"
        to="/scorebord"
        className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-3xl border border-border bg-card p-4 shadow-card transition-transform active:scale-[0.99]"
      >
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Team</p>
          <p className="truncate text-xl font-bold">{me?.team.name ?? "—"}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2 rounded-2xl bg-secondary px-3 py-2">
          {me && me.rank <= 3 ? <span className="text-xl">{MEDALS[me.rank - 1]}</span> : null}
          <span className="text-2xl font-bold text-primary">{me?.points ?? 0}</span>
          <span className="text-xs font-semibold text-muted-foreground">pt</span>
        </div>
      </Link>

      {trackingOn && !consented ? (
        <div data-tour="location-share" className="mt-4 rounded-3xl border border-border bg-card p-4 shadow-card">
          <h2 className="text-xl">📍 Deel jullie locatie</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            De reisleider volgt de expeditie live. Locatie wordt enkel gedeeld zolang de app open is.
          </p>
          <Button className="mt-3 h-12 w-full rounded-2xl text-base" onClick={askLocation}>
            Locatie delen aanzetten
          </Button>
        </div>
      ) : null}

      {trackingOn && consented ? (
        <button
          type="button"
          data-tour="location-share"
          className="mt-4 flex w-full items-center gap-3 rounded-3xl border border-border bg-card p-4 text-left shadow-card"
          onClick={async () => {
            if (isTracker) {
              try {
                const locations = await fetchTeamLocations();
                const myLocation = locations.find((l) => l.team_id === teamId);
                if (!myLocation) {
                  toast.error("Nog geen locatie ontvangen van dit toestel.");
                  return;
                }
                showLocationToast(myLocation?.accuracy, myLocation?.updated_at);
              } catch {
                toast.error("GPS-status kon niet worden opgehaald.");
              }
              return;
            }
            if (!window.confirm("Wil je dat dit toestel als enige de locatie van jullie team deelt?")) return;
            await takeOver();
            toast.success("Dit toestel deelt nu de locatie.");
          }}
        >
          <MapPin className={isTracker ? "size-5 text-primary" : "size-5 text-muted-foreground"} />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">
              {isTracker ? "Dit toestel deelt de locatie" : "Ander toestel deelt de locatie"}
            </span>
            <span className="block text-xs text-muted-foreground">
              {isTracker
                ? "Houd de app open tijdens de expeditie."
                : "Tik hier om dit toestel de locatiedeler van jullie team te maken."}
            </span>
          </span>
        </button>
      ) : null}

      {homeLocationChallenges.length > 0 ? (
        <section className="mt-6 space-y-3">
          <h2 className="text-2xl">Locatieopdrachten</h2>
          {homeLocationChallenges.map((challenge) => (
            <ChallengeCard
              key={challenge.id}
              challenge={challenge}
              teamId={teamId}
              isLocation
              submitted={submissions.has(challenge.id)}
              state={submissions.get(challenge.id)?.status ?? "todo"}
              awardedPoints={submissions.get(challenge.id)?.points}
              onSubmitted={() => queryClient.invalidateQueries()}
              onDismiss={() => void dismissLocationChallenge(challenge.id)}
            />
          ))}
        </section>
      ) : null}

      {bonus.length > 0 ? (
        <section className="mt-6 space-y-3">
          <h2 className="text-2xl">Bonusopdrachten</h2>
          {bonus.map((challenge) => (
            <BonusChallengeCard
              key={challenge.id}
              challenge={challenge}
              teamId={teamId}
              submitted={submissions.has(challenge.id)}
              status={submissions.get(challenge.id)?.status}
              awardedPoints={submissions.get(challenge.id)?.points}
              onSubmitted={() => queryClient.invalidateQueries()}
              onExpired={() => setTick((t) => t + 1)}
            />
          ))}
        </section>
      ) : null}

      <h2 className="mt-6 text-2xl">Zones</h2>
      <div data-tour="zones" className="mt-3 space-y-3">
        {(zones ?? []).map((zone, index) => {
          const zoneChallenges = zoneProgressChallenges(
            challenges ?? [],
            locationEvents ?? [],
            zone.id,
            locationStates ?? [],
          );

          const unlocked = unlockedIds.has(zone.id);

          return (
            <ZoneCard
              key={zone.id}
              zone={zone}
              unlocked={unlocked}
              completed={zoneChallenges.filter((c) => submissions.has(c.id)).length}
              total={zoneChallenges.length}
              tourTarget={index === 0 ? "first-zone" : undefined}
              onClick={() => {
                if (unlocked) {
                  void navigate({
                    to: "/zone/$zoneId",
                    params: { zoneId: zone.id },
                  });
                } else {
                  setPassword("");
                  setLockedZone(zone);
                }
              }}
            />
          );
        })}
      </div>

      <Dialog open={lockedZone !== null} onOpenChange={(open) => !open && setLockedZone(null)}>
        <DialogContent className="max-w-sm rounded-3xl">
          <DialogHeader>
            <DialogTitle className="text-2xl">
              {lockedZone?.icon} {lockedZone?.name}
            </DialogTitle>
            <DialogDescription className="text-base">
              {lockedZone && zoneNeedsPassword(lockedZone)
                ? "Vul het zonewachtwoord in dat je van de reisleider kreeg."
                : "Deze zone opent automatisch zodra jullie de vorige zone volledig hebben afgerond."}
            </DialogDescription>
          </DialogHeader>
          {lockedZone && zoneNeedsPassword(lockedZone) ? (
            <div className="space-y-3">
              <Input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && password && handleUnlock()}
                placeholder="Zonewachtwoord"
                className="h-12 rounded-2xl text-base"
              />
              <Button
                size="lg"
                className="h-12 w-full rounded-2xl text-base"
                disabled={busy || !password}
                onClick={handleUnlock}
              >
                {busy ? <Loader2 className="size-4 animate-spin" /> : "Ontgrendelen"}
              </Button>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
