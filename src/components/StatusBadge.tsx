import type { ReviewStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

export type ChallengeState = "todo" | ReviewStatus;

const styles: Record<ChallengeState, { className: string; icon: string; label: string }> = {
  todo: { className: "bg-gold-gradient text-accent-foreground", icon: "", label: "Nog te doen" },
  pending: { className: "bg-warning text-warning-foreground", icon: "⏳", label: "Wacht op nakijken" },
  approved: { className: "bg-success text-success-foreground", icon: "✅", label: "Goedgekeurd" },
  rejected: { className: "bg-destructive text-destructive-foreground", icon: "❌", label: "Afgekeurd" },
};

/** Puntenbadge met kleurcode voor de status van de inzending. */
export function PointsBadge({
  state,
  points,
  awarded,
  className,
}: {
  state: ChallengeState;
  points: number;
  awarded?: number;
  className?: string;
}) {
  const style = styles[state];
  const value = state === "approved" ? (awarded ?? points) : state === "rejected" ? 0 : points;
  return (
    <span
      title={style.label}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-1 text-xs font-bold",
        style.className,
        className,
      )}
    >
      {style.icon ? <span aria-hidden>{style.icon}</span> : null}
      {value} pt
    </span>
  );
}

export function StatusPill({ status }: { status: ReviewStatus }) {
  const style = styles[status];
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold",
        style.className,
      )}
    >
      {style.icon} {style.label}
    </span>
  );
}

export const statusLabels = styles;
