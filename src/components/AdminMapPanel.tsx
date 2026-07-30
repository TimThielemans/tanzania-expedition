import { lazy, Suspense, useState } from "react";
import { ClientOnly } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Trash2 } from "lucide-react";
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
  useLocationEvents,
  useSettings,
  useTeamLocations,
  useTeams,
  useRealtime,
} from "@/hooks/useGame";
import { setSetting } from "@/lib/admin";
import { createLocationEvent, deleteLocationEvent, updateLocationEvent } from "@/lib/locations";
import type { LocationEventInput } from "@/lib/locations";
import type { LocationTriggerMode, LocationTriggerType } from "@/lib/types";

const AdminMap = lazy(() => import("@/components/AdminMap"));

export const TRACKING_KEY = "location_tracking_enabled";

const TRIGGER_LABELS: Record<LocationTriggerType, string> = {
  team_notification: "Melding naar dit team",
  admin_notification: "Melding naar reisleider",
  global_notification: "Melding naar alle teams",
  location_challenge: "Locatieopdracht voor dit team",
};

const emptyEvent: LocationEventInput = {
  name: "",
  description: null,
  latitude: 0,
  longitude: 0,
  radius_meters: 50,
  trigger_mode: "every",
  trigger_type: "team_notification",
  notification_message: null,
  challenge_title: null,
  challenge_description: null,
  challenge_type: "text_answer",
  points: 10,
  active: true,
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl border border-border bg-card p-4 shadow-card">
      <h2 className="text-xl">{title}</h2>
      <div className="mt-2 space-y-2">{children}</div>
    </section>
  );
}

export function AdminMapPanel() {
  const queryClient = useQueryClient();
  const { data: teams } = useTeams();
  const { data: locations } = useTeamLocations();
  const { data: events } = useLocationEvents();
  const { data: settings } = useSettings();
  const [draft, setDraft] = useState<LocationEventInput>(emptyEvent);
  const [busy, setBusy] = useState(false);

  useRealtime(["team_locations", "location_events", "location_event_triggers"], () => {
    void queryClient.invalidateQueries({ queryKey: ["team-locations"] });
    void queryClient.invalidateQueries({ queryKey: ["location-events"] });
    void queryClient.invalidateQueries({ queryKey: ["location-triggers"] });
  });

  const refresh = () => queryClient.invalidateQueries();
  const trackingOn = (settings?.[TRACKING_KEY] ?? "false") === "true";
  const finaleLat = Number(settings?.finale_lat);
  const finaleLng = Number(settings?.finale_lng);
  const finale =
    Number.isFinite(finaleLat) && Number.isFinite(finaleLng) && (finaleLat || finaleLng)
      ? { latitude: finaleLat, longitude: finaleLng }
      : null;

  async function saveEvent() {
    if (!draft.name.trim()) return;
    setBusy(true);
    try {
      await createLocationEvent({ ...draft, name: draft.name.trim() });
      setDraft(emptyEvent);
      toast.success("Locatie-event aangemaakt.");
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

      <Section title="Kaart">
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
              defaultValue={settings?.finale_lat ?? ""}
              onBlur={(e) => void setSetting("finale_lat", e.target.value.trim()).then(refresh)}
              className="h-11 rounded-xl"
              inputMode="decimal"
            />
          </label>
          <label className="text-xs font-semibold">
            Lengtegraad
            <Input
              defaultValue={settings?.finale_lng ?? ""}
              onBlur={(e) => void setSetting("finale_lng", e.target.value.trim()).then(refresh)}
              className="h-11 rounded-xl"
              inputMode="decimal"
            />
          </label>
        </div>
      </Section>

      <Section title="Nieuw locatie-event">
        <div className="grid gap-2">
          <Input
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            placeholder="Naam, bv. Bibliotheek-checkpoint"
            className="h-11 rounded-xl"
          />
          <div className="grid grid-cols-3 gap-2">
            <Input
              value={String(draft.latitude)}
              onChange={(e) => setDraft({ ...draft, latitude: Number(e.target.value) || 0 })}
              placeholder="Lat"
              inputMode="decimal"
              className="h-11 rounded-xl"
            />
            <Input
              value={String(draft.longitude)}
              onChange={(e) => setDraft({ ...draft, longitude: Number(e.target.value) || 0 })}
              placeholder="Lng"
              inputMode="decimal"
              className="h-11 rounded-xl"
            />
            <Input
              value={String(draft.radius_meters)}
              onChange={(e) => setDraft({ ...draft, radius_meters: Number(e.target.value) || 50 })}
              placeholder="Straal (m)"
              inputMode="numeric"
              className="h-11 rounded-xl"
            />
          </div>
          <Select
            value={draft.trigger_type}
            onValueChange={(v) => setDraft({ ...draft, trigger_type: v as LocationTriggerType })}
          >
            <SelectTrigger className="h-11 rounded-xl">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(TRIGGER_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
          <Textarea
            value={draft.notification_message ?? ""}
            onChange={(e) => setDraft({ ...draft, notification_message: e.target.value || null })}
            placeholder="Berichttekst"
            rows={2}
            className="rounded-xl"
          />

          {draft.trigger_type === "location_challenge" ? (
            <>
              <Input
                value={draft.challenge_title ?? ""}
                onChange={(e) => setDraft({ ...draft, challenge_title: e.target.value || null })}
                placeholder="Titel van de opdracht"
                className="h-11 rounded-xl"
              />
              <Textarea
                value={draft.challenge_description ?? ""}
                onChange={(e) =>
                  setDraft({ ...draft, challenge_description: e.target.value || null })
                }
                placeholder="Opdrachtomschrijving"
                rows={2}
                className="rounded-xl"
              />
              <div className="grid grid-cols-2 gap-2">
                <Select
                  value={draft.challenge_type}
                  onValueChange={(v) =>
                    setDraft({ ...draft, challenge_type: v as "text_answer" | "photo_upload" })
                  }
                >
                  <SelectTrigger className="h-11 rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="text_answer">Tekstantwoord</SelectItem>
                    <SelectItem value="photo_upload">Foto</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  value={String(draft.points)}
                  onChange={(e) => setDraft({ ...draft, points: Number(e.target.value) || 0 })}
                  placeholder="Punten"
                  inputMode="numeric"
                  className="h-11 rounded-xl"
                />
              </div>
            </>
          ) : null}

          <Button className="h-12 rounded-2xl" disabled={busy || !draft.name.trim()} onClick={saveEvent}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : "Locatie-event toevoegen"}
          </Button>
        </div>
      </Section>

      <Section title={`Locatie-events (${events?.length ?? 0})`}>
        {(events ?? []).map((event) => (
          <div key={event.id} className="rounded-2xl bg-muted px-3 py-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{event.name}</p>
                <p className="truncate text-[11px] text-muted-foreground">
                  {TRIGGER_LABELS[event.trigger_type]} ·{" "}
                  {event.trigger_mode === "first" ? "eerste team" : "elk team"} ·{" "}
                  {event.radius_meters} m
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
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
          </div>
        ))}
        {(events ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">Nog geen locatie-events.</p>
        ) : null}
      </Section>
    </div>
  );
}
