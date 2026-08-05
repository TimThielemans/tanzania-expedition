import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Lock } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { ConfigNotice } from "@/components/ConfigNotice";
import { ChallengeCard } from "@/components/ChallengeCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getSiteImageStorageUrl } from "@/lib/supabase";
import {
  useAnswers,
  useChallenges,
  useLocationChallengeStates,
  useLocationEvents,
  usePhotos,
  useProgress,
  useQuizAnswers,
  useZones,
} from "@/hooks/useGame";
import {
  locationChallengesOfZone,
  refreshZoneCompletion,
  zoneProgressChallenges,
  unlockZoneWithPassword,
  unlockedZoneIds,
  zoneNeedsPassword,
  type ZoneCompletionEvent,
} from "@/lib/api";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ReviewStatus } from "@/lib/types";
import { setLocationChallengeState } from "@/lib/locations";
import { fireConfetti } from "@/lib/confetti";
import { useTeamSession } from "@/lib/session";
import { isSupabaseConfigured } from "@/lib/supabase";

export const Route = createFileRoute("/zone/$zoneId")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Zone — BOW in Tanzania" },
      { name: "description", content: "Los de opdrachten van deze zone op en verdien punten." },
      { property: "og:title", content: "Zone — BOW in Tanzania" },
      { property: "og:description", content: "Los de opdrachten van deze zone op en verdien punten." },
    ],
  }),
  component: ZonePage,
});

function ZonePage() {
  const { zoneId } = useParams({ from: "/zone/$zoneId" });
  const { session, hydrated } = useTeamSession();
  const queryClient = useQueryClient();

  const { data: zones } = useZones();
  const { data: challenges } = useChallenges();
  const { data: progress } = useProgress(session?.teamId);
  const { data: answers } = useAnswers(session?.teamId);
  const { data: quiz } = useQuizAnswers(session?.teamId);
  const { data: photos } = usePhotos(session?.teamId);
  const { data: locationEvents } = useLocationEvents();
  const { data: locationStates } = useLocationChallengeStates(session?.teamId);

  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [completion, setCompletion] = useState<ZoneCompletionEvent | null>(null);

  const zone = zones?.find((z) => z.id === zoneId);
  /** Vaste zoneopdrachten plus de al geactiveerde locatieopdrachten van deze zone. */
  const zoneChallenges = useMemo(
    () => zoneProgressChallenges(challenges ?? [], locationEvents ?? [], zoneId, locationStates ?? []),
    [challenges, locationEvents, locationStates, zoneId],
  );

  /** Nog open locatieopdrachten van deze zone (om apart te tonen met 📍-badge). */
  const openLocationIds = useMemo(
    () =>
      new Set(
        locationChallengesOfZone(challenges ?? [], locationEvents ?? [], zoneId)
          .filter((c) => (locationStates ?? []).some((s) => s.challenge_id === c.id && s.state === "open"))
          .map((c) => c.id),
      ),
    [challenges, locationEvents, locationStates, zoneId],
  );

  const submittedValue = useMemo(() => {
    const map = new Map<string, { value: string; status: ReviewStatus; points: number }>();
    (answers ?? []).forEach((a) =>
      map.set(a.challenge_id, { value: a.answer, status: a.status, points: a.points_awarded }),
    );
    (quiz ?? []).forEach((a) =>
      map.set(a.challenge_id, { value: a.selected_option, status: a.status, points: a.points_awarded }),
    );
    (photos ?? []).forEach((p) =>
      map.set(p.challenge_id, { value: "foto", status: p.status, points: p.points_awarded }),
    );
    return map;
  }, [answers, quiz, photos]);

  /** Locatieopdrachten van deze zone die de voltooiing nog tegenhouden. */
  const pendingLocationCount = useMemo(() => {
    const dismissed = new Set((locationStates ?? []).filter((s) => s.state === "dismissed").map((s) => s.challenge_id));
    return locationChallengesOfZone(challenges ?? [], locationEvents ?? [], zoneId).filter(
      (c) => !dismissed.has(c.id) && !submittedValue.has(c.id),
    ).length;
  }, [challenges, locationEvents, locationStates, zoneId, submittedValue]);

  if (!isSupabaseConfigured) return <ConfigNotice />;
  if (!hydrated) return null;
  if (!session) {
    return (
      <AppShell title="Niet ingelogd">
        <p className="mt-4 text-sm text-muted-foreground">Log eerst in met je team.</p>
        <Link to="/" className="mt-4 inline-block underline">
          Naar login
        </Link>
      </AppShell>
    );
  }

  const unlocked = unlockedZoneIds(zones ?? [], progress ?? []).has(zoneId);

  async function handleUnlock() {
    if (!zone || !session) return;
    setBusy(true);
    try {
      await unlockZoneWithPassword(session.teamId, zone, password);
      fireConfetti();
      toast.success(`${zone.name} ontgrendeld!`);
      await queryClient.invalidateQueries({ queryKey: ["progress"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Ontgrendelen mislukt.");
    } finally {
      setBusy(false);
    }
  }

  async function handleSubmitted() {
    if (!session || !zones || !challenges) return;
    const { completedZones, events } = await refreshZoneCompletion(session.teamId, zones, challenges);
    if (completedZones.includes(zoneId)) fireConfetti("big");
    const event = events.find((e) => e.zoneName === zone?.name) ?? events[0];
    if (event) setCompletion(event);
    await queryClient.invalidateQueries();
  }

  const completedCount = zoneChallenges.filter((c) => submittedValue.has(c.id)).length;
  const imageUrl = getSiteImageStorageUrl(zone?.picture);

  return (
    <AppShell
      title={zone ? `${zone.icon} ${zone.name}` : "Zone"}
      subtitle={zone?.tagline ? <span className="italic">{zone.tagline}</span> : undefined}
      action={
        <div className="rounded-2xl bg-primary-foreground/15 px-3 py-2 text-center">
          <p className="text-lg font-bold leading-none">
            {completedCount} / {zoneChallenges.length}
          </p>
          <p className="text-[10px] font-semibold uppercase tracking-wide opacity-80">voltooid</p>
        </div>
      }
    >
      {!zone ? (
        <p className="mt-4 text-sm text-muted-foreground">Zone niet gevonden.</p>
      ) : !unlocked ? (
        <div className="mt-4 space-y-4 rounded-3xl border border-border bg-card p-5 shadow-card">
          <Lock className="size-8 text-accent" />
          <h2 className="text-2xl">Zone vergrendeld</h2>
          {!zoneNeedsPassword(zone) ? (
            <p className="text-sm text-muted-foreground">
              Deze zone opent automatisch zodra je de vorige zone volledig hebt afgerond.
            </p>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">Vul het zonewachtwoord in dat je van de reisleider kreeg.</p>
              <Input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
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
            </>
          )}
        </div>
      ) : (
        <>
          {zone.description ? (
            <p className="mt-4 rounded-3xl border border-border bg-card p-4 text-sm shadow-card">{zone.description}</p>
          ) : null}

          <div className="mt-4 space-y-4">
            {zoneChallenges.map((challenge) => (
              <ChallengeCard
                key={challenge.id}
                challenge={challenge}
                teamId={session.teamId}
                submitted={submittedValue.has(challenge.id)}
                submittedValue={submittedValue.get(challenge.id)?.value}
                state={submittedValue.get(challenge.id)?.status ?? "todo"}
                awardedPoints={submittedValue.get(challenge.id)?.points}
                isLocation={challenge.is_location}
                onDismiss={
                  openLocationIds.has(challenge.id)
                    ? async () => {
                        if (!session) return;
                        await setLocationChallengeState(session.teamId, challenge.id, "dismissed");
                        toast.info("Opdracht overgeslagen.");
                        await queryClient.invalidateQueries();
                      }
                    : undefined
                }
                onSubmitted={handleSubmitted}
              />
            ))}
            {zoneChallenges.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nog geen opdrachten in deze zone.</p>
            ) : null}
          </div>

          {imageUrl ? (
            <img
              src={imageUrl}
              alt={zone.name}
              loading="lazy"
              className="mt-5 w-full rounded-3xl object-cover shadow-card"
            />
          ) : null}

          {pendingLocationCount > 0 ? (
            <p className="mt-5 rounded-2xl border border-accent/40 bg-accent/10 p-4 text-sm">
              📍 Deze zone heeft nog{" "}
              {pendingLocationCount === 1
                ? "een openstaande locatieopdracht"
                : `${pendingLocationCount} openstaande locatieopdrachten`}
              . De zone is pas voltooid als die ook zijn ingezonden.
            </p>
          ) : null}

          <Button asChild size="lg" variant="secondary" className="mt-6 h-12 w-full rounded-2xl">
            <Link to="/">Terug naar Home</Link>
          </Button>
        </>
      )}

      <Dialog open={completion !== null} onOpenChange={(open) => !open && setCompletion(null)}>
        <DialogContent className="max-w-sm rounded-3xl">
          <DialogHeader>
            <DialogTitle className="text-2xl">
              {completion?.nextNeedsPassword || !completion?.nextZoneName ? "✅ Zone voltooid!" : "🎉 Zone voltooid!"}
            </DialogTitle>
            <DialogDescription className="text-base">
              {completion?.nextNeedsPassword
                ? "De reisleider kijkt jullie antwoorden na. Klopt alles? Dan krijgen jullie het wachtwoord voor de volgende zone via Meldingen."
                : completion?.nextZoneName
                  ? `De volgende zone (${completion.nextZoneName}) is automatisch ontgrendeld.`
                  : "Jullie hebben de laatste zone afgerond. Wat een expeditie!"}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button className="h-12 w-full rounded-2xl" onClick={() => setCompletion(null)}>
              Verder
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
