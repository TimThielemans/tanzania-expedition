import { Link } from "@tanstack/react-router";
import { Lock, Check, ChevronRight } from "lucide-react";
import type { Zone } from "@/lib/types";
import { cn } from "@/lib/utils";

interface ZoneCardProps {
  zone: Zone;
  unlocked: boolean;
  completed: number;
  total: number;
}

export function ZoneCard({ zone, unlocked, completed, total }: ZoneCardProps) {
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  const done = total > 0 && completed === total;

  const content = (
    <div
      className={cn(
        "flex w-full items-center gap-4 rounded-3xl border border-border bg-card p-4 text-left shadow-card transition-transform active:scale-[0.98]",
        !unlocked && "opacity-70",
      )}
    >
      <div
        className={cn(
          "grid size-14 shrink-0 place-items-center rounded-2xl text-3xl",
          done ? "bg-gold-gradient" : "bg-secondary",
        )}
      >
        {zone.icon}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="truncate text-xl leading-tight">{zone.name}</h3>
          {done ? <Check className="size-4 shrink-0 text-primary" /> : null}
          {!unlocked ? <Lock className="size-4 shrink-0 text-muted-foreground" /> : null}
        </div>
        <p className="truncate text-sm text-muted-foreground">
          {total} opdracht{total === 1 ? "" : "en"} · {completed} voltooid
        </p>
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
    </div>
  );

  return (
    <Link to="/zone/$zoneId" params={{ zoneId: zone.id }} className="block">
      {content}
    </Link>
  );
}
