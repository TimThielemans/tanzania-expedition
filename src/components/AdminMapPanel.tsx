import { lazy, Suspense, useState } from "react";
import { ClientOnly } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronDown, Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useAllChallenges,
  useLocationEvents,
  useSettings,
  useTeamLocations,
  useTeams,
  useZones,
  useRealtime,
} from "@/hooks/useGame";
import { setSetting } from "@/lib/admin";
import {
  createLocationEvent,
  deleteLocationEvent,
  emptyLocationEvent,
  linkChallengeToEvent,
  updateLocationEvent,
} from "@/lib/locations";
import type { LocationEventInput } from "@/lib/locations";
import type { Challenge, LocationEvent, LocationTriggerMode, NotificationTarget } from "@/lib/types";

const AdminMap = lazy(() => import("@/components/AdminMap"));
const MapLocationPicker = lazy(() => import("@/components/MapLocationPicker"));

export const TRACKING_KEY = "location_tracking_enabled";

const TARGET_LABELS: Record<NotificationTarget, string> = {
  team: "Melding naar dit team",
  admin: "Melding naar de reisleider",
  all: "Melding naar alle teams",
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl border border-border bg-card p-4 shadow-card">
      <h2 className="text-xl">{title}</h2>
      <div className="mt-2 space-y-2">{children}</div>
    </section>
  );
}

const mapFallback = <div className="h-56 w-full rounded-2xl bg-muted" />;

/** Formulier voor één locatie-event, met kaartkiezer en opdrachtkoppeling. */
function EventForm({
  draft,
  setDraft,
  center,
  zones,
  locationChallenges,
  linkedChallengeId,
  onLinkChange,
}: {
  draft: LocationEventInput;
  setDraft: (next: LocationEventInput) => void;
  center: { latitude: number; longitude: number } | null;
  zones: { id: string; name: string }[];
  locationChallenges: Challenge[];
  linkedChallengeId: string;
  onLinkChange: (challengeId: string) => void;
}) {
  return (
    <div className="grid gap-2">
      <Input
        value={draft.name}
        onChange={(e) => setDraft({ ...draft, name: e.target.value })}
        placeholder="Naam, bv. Waterput bij de baobab"
        className="h-11 rounded-xl"
      />
      <Textarea
        value={draft.description ?? ""}
        onChange={(e) => setDraft({ ...draft, description: e.target.value || null })}
        placeholder="Korte omschrijving (enkel voor de reisleider)"
        rows={2}
        className="rounded-xl"
      />

      <ClientOnly fallback={mapFallback}>
        <Suspense fallback={mapFallback}>
          <MapLocationPicker
            value={{ latitude: draft.latitude, longitude: draft.longitude }}
            center={center}
            radiusMeters={draft.radius_meters}
            onChange={(pos) => setDraft({ ...draft, ...pos })}
          />
        </Suspense>
      </ClientOnly>

      <div className="grid grid-cols-3 gap-2">
        <label className="text-[11px] font-semibold">
          Breedte
          <Input
            value={String(draft.latitude)}
            onChange={(e) => setDraft({ ...draft, latitude: Number(e.target.value) || 0 })}
            inputMode="decimal"
            className="h-11 rounded-xl"
          />
        </label>
        <label className="text-[11px] font-semibold">
          Lengte
          <Input
            value={String(draft.longitude)}
            onChange={(e) => setDraft({ ...draft, longitude: Number(e.target.value) || 0 })}
            inputMode="decimal"
            className="h-11 rounded-xl"
          />
        </label>
        <label className="text-[11px] font-semibold">
          Straal (m)
          <Input
            value={String(draft.radius_meters)}
            onChange={(e) => setDraft({ ...draft, radius_meters: Number(e.target.value) || 50 })}
            inputMode="numeric"
            className="h-11 rounded-xl"
          />
        </label>
      </div>

      <label className="text-[11px] font-semibold">
        Wie krijgt de melding?
        <Select
          value={draft.notification_target}
          onValueChange={(v) => setDraft({ ...draft, notification_target: v as NotificationTarget })}
        >
          <SelectTrigger className="h-11 rounded-xl">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(TARGET_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>

      <Textarea
        value={draft.notification_message ?? ""}
        onChange={(e) => setDraft({ ...draft, notification_message: e.target.value || null })}
        placeholder="Berichttekst voor de melding"
        rows={2}
        className="rounded-xl"
      />

      <label className="text-[11px] font-semibold">
        Hoe vaak vuurt dit event?
        <Select
          value={draft.trigger_mode}
          onValueChange={(v) => setDraft({ ...draft, trigger_mode: v as LocationTriggerMode })}
        >
          <SelectTrigger className="h-11 rounded-xl">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="every">Elk team (één keer per team)</SelectItem>
            <SelectItem value="first">Enkel het eerste team</SelectItem>
          </SelectContent>
        </Select>
      </label>

      <label className="text-[11px] font-semibold">
        Enkel geldig in zone
        <Select
          value={draft.zone_id ?? "all"}
          onValueChange={(v) => setDraft({ ...draft, zone_id: v === "all" ? null : v })}
        >
          <SelectTrigger className="h-11 rounded-xl">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle zones</SelectItem>
            {zones.map((zone) => (
              <SelectItem key={zone.id} value={zone.id}>
                {zone.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>

      <label className="text-[11px] font-semibold">
        Gekoppelde opdracht
        <Select value={linkedChallengeId} onValueChange={onLinkChange}>
          <SelectTrigger className="h-11 rounded-xl">
            <SelectValue placeholder="Geen opdracht" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Geen opdracht — enkel een melding</SelectItem>
            {locationChallenges.map((challenge) => (
              <SelectItem key={challenge.id} value={challenge.id}>
                {challenge.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>
      <p className="text-[11px] text-muted-foreground">
        Opdrachten maak je aan in het tabblad Opdrachten. Hier kies je welke
        bestaande opdracht vrijkomt zodra een team deze plek bereikt.
      </p>
    </div>
  );
}

export function AdminMapPanel() {
  const queryClient = useQueryClient();
  const { data: teams } = useTeams();
  const { data: zones } = useZones();
  const { data: locations } = useTeamLocations();
  const { data: events } = useLocationEvents();
  const { data: challenges } = useAllChallenges();
  const { data: settings } = useSettings();
  const [draft, setDraft] = useState<LocationEventInput>(emptyLocationEvent);
  const [showNew, setShowNew] = useState(false);
  const [draftChallenge, setDraftChallenge] = useState("none");

  const [openId, setOpenId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<LocationEventInput | null>(null);
  const [busy, setBusy] = useState(false);

  useRealtime(["team_locations", "location_events", "location_event_triggers"], () => {
    void queryClient.invalidateQueries({ queryKey: ["team-locations"] });
    void queryClient.invalidateQueries({ queryKey: ["location-events"] });
    void queryClient.invalidateQueries({ queryKey: ["location-triggers"] });
  });

  const refresh = () => queryClient.invalidateQueries();
  const trackingOn = (settings?.[TRACKING_KEY] ?? "false") === "true";
  const finaleLat = Number(settings?.finale_latitude);
  const finaleLng = Number(settings?.finale_longitude);
  const finale =
    Number.isFinite(finaleLat) && Number.isFinite(finaleLng) && (finaleLat || finaleLng)
      ? { latitude: finaleLat, longitude: finaleLng }
      : null;

  const allChallenges = challenges ?? [];
  /** Kandidaten om te koppelen: locatieopdrachten die nog vrij zijn of al aan dít event hangen. */
  const candidatesFor = (eventId: string | null) =>
    allChallenges.filter(
      (c) =>
        !c.is_bonus &&
        (c.location_event_id === null || c.location_event_id === eventId) &&
        (c.is_location || c.location_event_id === null),
    );
  const linkedIdOf = (eventId: string) =>
    allChallenges.find((c) => c.location_event_id === eventId)?.id ?? "none";

  async function applyLink(eventId: string, challengeId: string, previous: string) {
    if (previous !== "none" && previous !== challengeId) await linkChallengeToEvent(previous, null);
    if (challengeId !== "none") await linkChallengeToEvent(challengeId, eventId);
  }

  async function saveNewEvent() {
    if (!draft.name.trim()) return;
    setBusy(true);
    try {
      const id = await createLocationEvent({ ...draft, name: draft.name.trim() });
      await applyLink(id, draftChallenge, "none");
      setDraft(emptyLocationEvent);
      setDraftChallenge("none");
      toast.success("Locatie-event aangemaakt.");
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Opslaan mislukt.");
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit(event: LocationEvent, challengeId: string) {
    if (!editDraft) return;
    setBusy(true);
    try {
      await updateLocationEvent(event.id, { ...editDraft, name: editDraft.name.trim() });
      await applyLink(event.id, challengeId, linkedIdOf(event.id));
      toast.success("Locatie-event bijgewerkt.");
      setOpenId(null);
      setEditDraft(null);
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Opslaan mislukt.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <Section title="Locatietracking">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Teams delen hun locatie enkel als dit aan staat, ze ingelogd zijn en de app open is.
          </p>
          <Switch
            checked={trackingOn}
            aria-label="Locatietracking inschakelen"
            onCheckedChange={async (checked) => {
              await setSetting(TRACKING_KEY, checked ? "true" : "false");
              toast.success(checked ? "Tracking staat aan." : "Tracking staat uit.");
              await refresh();
            }}
          />
        </div>
      </Section>

      <Section title="Live kaart">
        <ClientOnly fallback={<div className="h-80 w-full rounded-2xl bg-muted" />}>
          <Suspense fallback={<div className="h-80 w-full rounded-2xl bg-muted" />}>
            <AdminMap
              teams={teams ?? []}
              locations={locations ?? []}
              events={events ?? []}
              finale={finale}
            />
          </Suspense>
        </ClientOnly>
      </Section>

      <Section title="Finalelocatie">
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs font-semibold">
            Breedtegraad
            <Input
              defaultValue={settings?.finale_latitude ?? ""}
              onBlur={(e) => void setSetting("finale_latitude", e.target.value.trim()).then(refresh)}
              className="h-11 rounded-xl"
              inputMode="decimal"
            />
          </label>
          <label className="text-xs font-semibold">
            Lengtegraad
            <Input
              defaultValue={settings?.finale_longitude ?? ""}
              onBlur={(e) =>
                void setSetting("finale_longitude", e.target.value.trim()).then(refresh)
              }
              className="h-11 rounded-xl"
              inputMode="decimal"
            />
          </label>
        </div>
      </Section>

      <Section title="Nieuw locatie-event">
        {showNew ? (
          <>
            <EventForm
              draft={draft}
              setDraft={setDraft}
              center={finale}
              zones={zones ?? []}
              locationChallenges={candidatesFor(null)}
              linkedChallengeId={draftChallenge}
              onLinkChange={setDraftChallenge}
            />
            <div className="flex gap-2">
              <Button
                className="h-12 flex-1 rounded-2xl"
                disabled={busy || !draft.name.trim()}
                onClick={saveNewEvent}
              >
                {busy ? <Loader2 className="size-4 animate-spin" /> : "Locatie-event toevoegen"}
              </Button>
              <Button
                variant="secondary"
                className="h-12 rounded-2xl"
                onClick={() => {
                  setShowNew(false);
                  setDraft(emptyLocationEvent);
                  setDraftChallenge("none");
                }}
              >
                Sluiten
              </Button>
            </div>
          </>
        ) : (
          <Button
            variant="secondary"
            className="h-11 w-full rounded-2xl"
            onClick={() => setShowNew(true)}
          >
            <Plus className="mr-1 size-4" /> Locatie-event toevoegen
          </Button>
        )}
      </Section>


      <Section title={`Locatie-events (${events?.length ?? 0})`}>
        {(events ?? []).map((event) => {
          const open = openId === event.id;
          const linkedId = linkedIdOf(event.id);
          const linked = allChallenges.find((c) => c.id === linkedId);
          return (
            <div key={event.id} className="rounded-2xl bg-muted px-3 py-2">
              <div className="flex items-start justify-between gap-2">
                <button
                  type="button"
                  className="min-w-0 flex-1 text-left"
                  onClick={() => {
                    if (open) {
                      setOpenId(null);
                      setEditDraft(null);
                      return;
                    }
                    setOpenId(event.id);
                    const { id: _id, created_at: _created, ...rest } = event;
                    setEditDraft(rest);
                  }}
                >
                  <p className="truncate text-sm font-semibold">
                    {event.name} {linked ? "· 📍 opdracht" : ""}
                  </p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {TARGET_LABELS[event.notification_target]} ·{" "}
                    {event.trigger_mode === "first" ? "eerste team" : "elk team"} ·{" "}
                    {event.radius_meters} m ·{" "}
                    {event.zone_id
                      ? (zones ?? []).find((z) => z.id === event.zone_id)?.name ?? "zone"
                      : "alle zones"}
                  </p>
                </button>
                <div className="flex shrink-0 items-center gap-2">
                  <ChevronDown
                    className={`size-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
                  />
                  <Switch
                    checked={event.active}
                    aria-label={`${event.name} actief`}
                    onCheckedChange={async (checked) => {
                      await updateLocationEvent(event.id, { active: checked });
                      await refresh();
                    }}
                  />
                  <Button
                    size="icon"
                    variant="destructive"
                    className="size-9 rounded-xl"
                    aria-label="Event verwijderen"
                    onClick={async () => {
                      if (!window.confirm(`${event.name} verwijderen?`)) return;
                      await deleteLocationEvent(event.id);
                      await refresh();
                    }}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>

              {open && editDraft ? (
                <div className="mt-3 space-y-2 border-t border-border pt-3">
                  <EventForm
                    draft={editDraft}
                    setDraft={setEditDraft}
                    center={finale}
                    zones={zones ?? []}
                    locationChallenges={candidatesFor(event.id)}
                    linkedChallengeId={linkedId}
                    onLinkChange={(id) => void applyLink(event.id, id, linkedId).then(refresh)}
                  />
                  <Button
                    className="h-11 w-full rounded-2xl"
                    disabled={busy}
                    onClick={() => void saveEdit(event, linkedIdOf(event.id))}
                  >
                    {busy ? <Loader2 className="size-4 animate-spin" /> : "Wijzigingen opslaan"}
                  </Button>
                </div>
              ) : null}
            </div>
          );
        })}
        {(events ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">Nog geen locatie-events.</p>
        ) : null}
      </Section>
    </div>
  );
}
