import { useEffect, useLayoutEffect, useState } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { useTeamSession } from "@/lib/session";
import { useOnboarding } from "@/lib/onboarding";
import { useArrival } from "@/lib/arrival";
import { enableLocationSharing } from "@/hooks/useLocationTracking";
import { toast } from "sonner";

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

function findTarget(target: string | null): HTMLElement | null {
  if (!target || typeof document === "undefined") return null;
  return document.querySelector<HTMLElement>(`[data-tour="${target}"]`);
}

/** Eenmalige coach-mark tour. Stappen staan in src/lib/onboarding.ts. */
export function OnboardingTour() {
  const { session, hydrated: sessionReady } = useTeamSession();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const { step, hydrated, next, skip } = useOnboarding(session?.teamId ?? null);
  const arrival = useArrival(session?.teamId ?? null);
  const [rect, setRect] = useState<Rect | null>(null);
  // Na het aankomstscherm 1 seconde wachten voor de tour begint.
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!arrival.hydrated || !arrival.done) {
      setReady(false);
      return;
    }
    const timer = window.setTimeout(() => setReady(true), 1000);
    return () => window.clearTimeout(timer);
  }, [arrival.hydrated, arrival.done]);

  const onRoute = !!step && step.route === pathname;

  useLayoutEffect(() => {
    if (!onRoute || !step) {
      setRect(null);
      return;
    }
    const measure = () => {
      const el = findTarget(step.target);
      if (el) {
        const r = el.getBoundingClientRect();
        setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
      } else {
        setRect(null);
      }
    };
    measure();
    const timer = window.setInterval(measure, 250);
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
    };
  }, [onRoute, step]);

  // Optionele stap overslaan wanneer het element niet op het scherm staat.
  useEffect(() => {
    if (!onRoute || !step?.optional) return;
    const timer = window.setTimeout(() => {
      if (!findTarget(step.target)) next();
    }, 400);
    return () => window.clearTimeout(timer);
  }, [onRoute, step, next]);

  useEffect(() => {
    if (!onRoute || !step?.target) return;
    findTarget(step.target)?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [onRoute, step]);

  if (!sessionReady || !hydrated || !session || !step || !onRoute) return null;
  if (!ready) return null;
  if (step.optional && !rect) return null;

  const team = session.teamName;
  const title = step.title.replace("{team}", team);
  const body = step.body.replace("{team}", team);
  const cardAbove = step.placement === "top";

  return (
    <div className="fixed inset-0 z-[99999]">
      {/* Volledig scherm: vangt alle klikken */}
      <div className="absolute inset-0 bg-transparent pointer-events-auto" />

      {/* Achtergrond en highlight */}
      {rect ? (
        <div
          className="pointer-events-none absolute rounded-2xl ring-4 ring-primary ring-offset-2 ring-offset-transparent"
          style={{
            top: rect.top - 6,
            left: rect.left - 6,
            width: rect.width + 12,
            height: rect.height + 12,
            boxShadow: "0 0 0 9999px rgba(0,0,0,0.45)",
          }}
        />
      ) : (
        <div className="pointer-events-none absolute inset-0 bg-black/45" />
      )}

      {/* Positionering van de kaart */}
      <div
        className="pointer-events-none absolute inset-x-0 px-4"
        style={
          rect
            ? cardAbove
              ? { bottom: `calc(100dvh - ${Math.max(rect.top - 20, 140)}px)` }
              : { top: Math.min(rect.top + rect.height + 20, window.innerHeight - 260) }
            : { bottom: "calc(env(safe-area-inset-bottom) + 6rem)" }
        }
      >
        {/* ENIGE klikbare element */}
        <div className="pointer-events-auto mx-auto max-w-lg rounded-3xl bg-card p-5 shadow-raised">
          <div className="flex items-start gap-3">
            <h2 className="min-w-0 flex-1 text-xl leading-snug">{title}</h2>

            <button
              type="button"
              onClick={skip}
              className="shrink-0 text-xs font-semibold text-muted-foreground underline"
            >
              Overslaan
            </button>
          </div>

          <p className="mt-2 text-sm text-muted-foreground">{body}</p>

          {step.action ? (
            <Button
              size="lg"
              className="mt-4 h-12 w-full rounded-2xl text-base"
              onClick={async () => {
                if (step.id === "home-location") {
                  await enableLocationSharing();
                }

                toast.info(`step = ${step.id}`);
                const goTo = step.action?.goTo;

                next();

                if (goTo) {
                  void navigate({ to: goTo });
                }
              }}
            >
              {step.action.label}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
