import { useEffect, useState } from "react";
import { Timer } from "lucide-react";
import { ChallengeCard } from "@/components/ChallengeCard";
import { bonusRemainingMs } from "@/lib/api";
import type { Challenge, ReviewStatus } from "@/lib/types";

function format(ms: number) {
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

interface BonusChallengeCardProps {
  challenge: Challenge;
  teamId: string;
  submitted: boolean;
  status?: ReviewStatus;
  awardedPoints?: number;
  onSubmitted: () => void;
  onExpired: () => void;
}

/** Bonusopdracht met aftelklok. Verdwijnt automatisch zodra de tijd om is. */
export function BonusChallengeCard({
  challenge,
  teamId,
  submitted,
  status,
  awardedPoints,
  onSubmitted,
  onExpired,
}: BonusChallengeCardProps) {
  const [remaining, setRemaining] = useState(() => bonusRemainingMs(challenge));

  useEffect(() => {
    const tick = () => {
      const left = bonusRemainingMs(challenge);
      setRemaining(left);
      if (left <= 0) onExpired();
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [challenge.id, challenge.bonus_started_at, challenge.duration_minutes]);

  if (remaining <= 0) return null;

  return (
    <div className="rounded-3xl bg-gold-gradient p-1 shadow-raised">
      <div className="flex items-center justify-between px-3 py-1.5 text-xs font-bold text-accent-foreground">
        <span>⭐ BONUSOPDRACHT</span>
        <span className="inline-flex items-center gap-1">
          <Timer className="size-3.5" /> {format(remaining)}
        </span>
      </div>
      <ChallengeCard
        challenge={challenge}
        teamId={teamId}
        submitted={submitted}
        state={submitted ? (status ?? "pending") : "todo"}
        awardedPoints={awardedPoints}
        onSubmitted={onSubmitted}
      />
    </div>
  );
}
