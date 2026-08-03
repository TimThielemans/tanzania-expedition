import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  distanceMeters,
  forceLocationTrigger,
  resetLocationTrigger,
} from "@/lib/locations";
import type {
  Challenge,
  LocationEvent,
  LocationEventTrigger,
  Team,
  TeamLocation,
  Zone,
} from "@/lib/types";

/** Kolom in de matrix: één locatie-event met zijn zone en opdracht. */
interface Column {
  event: LocationEvent;
  zone: Zone | null;
  challenge: Challenge | null;
}

function ageText(updatedAt?: string | null): string {
  if (!updatedAt) return "Onbekend";
  const seconds = Math.floor((Date.now() - new Date(updatedAt).getTime()) / 1000);
  if (!Number.isFinite(seconds) || seconds < 0) return "Onbekend";
  if (seconds < 60) return `${seconds} seconden geleden`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} minuten geleden`;
  return `${Math.floor(seconds / 3600)} uur geleden`;
}

function distanceText(location: TeamLocation | undefined, event: LocationEvent): string {
  if (!location) return "Onbekend";
  const meters = distanceMeters(location, event);
  if (!Number.isFinite(meters)) return "Onbekend";
  return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(1)} km`;
}

function timeText(iso?: string | null): string {
  if (!iso) return "Onbekend";
  return new Date(iso).toLocaleString("nl-BE", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function AdminLocationMatrix({
  teams,
  zones,
  events,
  triggers,
  challenges,
  locations,
}: {
  teams: Team[];
  zones: Zone[];
  events: LocationEvent[];
  triggers: LocationEventTrigger[];
  challenges: Challenge[];
  locations: TeamLocation[];
}) {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<{ team: Team; column: Column } | null>(null);
  const [headerInfo, setHeaderInfo] = useState<Column | null>(null);
  const [busy, setBusy] = useState(false);

  const columns = useMemo<Column[]>(() => {
    const zoneById = new Map(zones.map((z) => [z.id, z]));
    const withMeta = events.map((event) => {
      const challenge = challenges.find((c) => c.location_event_id === event.id) ?? null;
      const zoneId = challenge?.zone_id ?? event.zone_id ?? null;
      return { event, challenge, zone: zoneId ? zoneById.get(zoneId) ?? null : null };
    });
    return withMeta.sort((a, b) => {
      const zoneA = a.zone ? a.zone.order_index : Number.MAX_SAFE_INTEGER;
      const zoneB = b.zone ? b.zone.order_index : Number.MAX_SAFE_INTEGER;
      if (zoneA !== zoneB) return zoneA - zoneB;
      if (a.event.order_index !== b.event.order_index)
        return a.event.order_index - b.event.order_index;
      return a.event.created_at.localeCompare(b.event.created_at);
    });
  }, [events, challenges, zones]);

  const triggerFor = (eventId: string, teamId: string) =>
    triggers.find((t) => t.event_id === eventId && t.team_id === teamId) ?? null;

  const locationFor = (teamId: string) => locations.find((l) => l.team_id === teamId);

  const refresh = () => queryClient.invalidateQueries();

  const selectedTrigger = selected ? triggerFor(selected.column.event.id, selected.team.id) : null;

  async function handleReset() {
    if (!selected) return;
    if (!window.confirm(`Trigger "${selected.column.event.name}" resetten voor ${selected.team.name}?`))
      return;
    setBusy(true);
    try {
      await resetLocationTrigger(selected.column.event.id, selected.team.id);
      toast.success("Trigger gereset.");
      setSelected(null);
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Resetten mislukt.");
    } finally {
      setBusy(false);
    }
  }

  async function handleForce() {
    if (!selected) return;
    if (
      !window.confirm(`Trigger "${selected.column.event.name}" forceren voor ${selected.team.name}?`)
    )
      return;
    setBusy(true);
    try {
      await forceLocationTrigger(selected.team, selected.column.event);
      toast.success("Trigger geforceerd.");
      setSelected(null);
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Forceren mislukt.");
    } finally {
      setBusy(false);
    }
  }

  if (columns.length === 0 || teams.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nog geen locatie-events of teams om te vergelijken.
      </p>
    );
  }

  return (
    <>
      <div className="max-h-[60vh] overflow-auto rounded-2xl border border-border">
        <table className="border-separate border-spacing-0 text-xs">
          <thead>
            <tr>
              <th className="sticky left-0 top-0 z-30 border-b border-border bg-card px-2 py-1 text-left font-semibold">
                Team
              </th>
              {columns.map((column, index) => {
                const newZone = index > 0 && columns[index - 1]?.zone?.id !== column.zone?.id;
                return (
                  <th
                    key={column.event.id}
                    className={`sticky top-0 z-20 border-b border-border bg-card px-1 py-1 text-center font-normal ${
                      newZone ? "border-l border-l-border" : ""
                    }`}
                  >
                    <button
                      type="button"
                      title={column.event.name}
                      aria-label={column.event.name}
                      className="px-0.5 text-base leading-none"
                      onClick={() => setHeaderInfo(column)}
                    >
                      {column.challenge ? "📍" : "🔔"}
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {teams.map((team) => (
              <tr key={team.id}>
                <th className="sticky left-0 z-10 max-w-[8rem] truncate border-b border-border bg-card px-2 py-1 text-left font-medium">
                  {team.name}
                </th>
                {columns.map((column, index) => {
                  const newZone = index > 0 && columns[index - 1]?.zone?.id !== column.zone?.id;
                  const fired = Boolean(triggerFor(column.event.id, team.id));
                  return (
                    <td
                      key={column.event.id}
                      className={`border-b border-border px-1 py-1 text-center ${
                        newZone ? "border-l border-l-border" : ""
                      }`}
                    >
                      <button
                        type="button"
                        aria-label={`${team.name} — ${column.event.name}`}
                        className={`leading-none ${
                          fired ? "text-primary" : "text-muted-foreground/60"
                        }`}
                        onClick={() => setSelected({ team, column })}
                      >
                        {fired ? "●" : "○"}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={Boolean(headerInfo)} onOpenChange={(open) => !open && setHeaderInfo(null)}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle>{headerInfo?.event.name}</DialogTitle>
            <DialogDescription>
              {headerInfo?.zone ? headerInfo.zone.name : "Zonevrij"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1 text-sm">
            {headerInfo?.challenge ? (
              <>
                <p className="font-semibold">📍 {headerInfo.challenge.title}</p>
                {headerInfo.challenge.description ? (
                  <p className="text-muted-foreground">{headerInfo.challenge.description}</p>
                ) : null}
              </>
            ) : (
              <>
                <p className="font-semibold">🔔 Enkel een melding</p>
                <p className="text-muted-foreground">
                  {headerInfo?.event.notification_message ??
                    headerInfo?.event.description ??
                    "Geen berichttekst."}
                </p>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle>{selected?.team.name}</DialogTitle>
            <DialogDescription>
              {selected?.zoneLabel ?? (selected?.column.zone ? selected.column.zone.name : "Zonevrij")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1 text-sm">
            <p>
              <span className="text-muted-foreground">Trigger: </span>
              {selected?.column.event.name}
            </p>
            <p>
              <span className="text-muted-foreground">Opdracht: </span>
              {selected?.column.challenge?.title ?? "Geen opdracht"}
            </p>
            {selectedTrigger ? (
              <p>
                <span className="text-muted-foreground">Getriggerd: </span>
                {timeText(selectedTrigger.created_at)}
              </p>
            ) : (
              <>
                <p>
                  <span className="text-muted-foreground">Afstand: </span>
                  {selected ? distanceText(locationFor(selected.team.id), selected.column.event) : "Onbekend"}
                </p>
                <p>
                  <span className="text-muted-foreground">Laatste GPS-update: </span>
                  {ageText(selected ? locationFor(selected.team.id)?.updated_at : null)}
                </p>
              </>
            )}
          </div>
          {selectedTrigger ? (
            <Button variant="destructive" className="h-11 rounded-2xl" disabled={busy} onClick={handleReset}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : "Trigger resetten"}
            </Button>
          ) : (
            <Button className="h-11 rounded-2xl" disabled={busy} onClick={handleForce}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : "Trigger forceren"}
            </Button>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
