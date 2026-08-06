import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ARRIVAL_SCRIPT } from "@/lib/arrival";

const { airline, route, lines, checkpoints, arrivalLabel, buttonLabel, timing } = ARRIVAL_SCRIPT;

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const listener = () => setReduced(mq.matches);
    mq.addEventListener("change", listener);
    return () => mq.removeEventListener("change", listener);
  }, []);
  return reduced;
}

/**
 * Fullscreen aankomstscherm in BOW Airlines-stijl.
 * Inhoud en tempo staan in ARRIVAL_SCRIPT (src/lib/arrival.ts).
 */
export function ArrivalScreen({ teamName, onDone }: { teamName: string; onDone: () => void }) {
  const reduced = usePrefersReducedMotion();

  // Aantal volledig getoonde aankondigingsregels + aantal getypte tekens in de huidige.
  const [lineIndex, setLineIndex] = useState(0);
  const [chars, setChars] = useState(0);
  const [checks, setChecks] = useState(0);
  const [landed, setLanded] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const announcementDone = lineIndex >= lines.length;

  // Typewriter voor de aankondiging.
  useEffect(() => {
    if (reduced || announcementDone) return;
    const line = lines[lineIndex];
    const delay = lineIndex === 0 && chars === 0 ? timing.initialDelay : timing.charDelay;
    if (chars < line.length) {
      const t = window.setTimeout(() => setChars((c) => c + 1), timing.charDelay);
      return () => window.clearTimeout(t);
    }
    const t = window.setTimeout(() => {
      setLineIndex((i) => i + 1);
      setChars(0);
    }, timing.linePause);
    return () => window.clearTimeout(t);
  }, [reduced, announcementDone, lineIndex, chars]);

  // Checkpoints één per één.
  useEffect(() => {
    if (reduced) return;
    if (!announcementDone || checks >= checkpoints.length) return;
    const t = window.setTimeout(() => setChecks((c) => c + 1), timing.checkpointPause);
    return () => window.clearTimeout(t);
  }, [reduced, announcementDone, checks]);

  // Slot.
  useEffect(() => {
    if (reduced) {
      setLineIndex(lines.length);
      setChecks(checkpoints.length);
      setLanded(true);
      return;
    }
    if (!announcementDone || checks < checkpoints.length) return;
    const t = window.setTimeout(() => setLanded(true), timing.checkpointPause);
    return () => window.clearTimeout(t);
  }, [reduced, announcementDone, checks]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [lineIndex, chars, checks, landed]);

  const visibleLines = useMemo(() => {
    const shown: string[] = lines.slice(0, lineIndex);
    if (!announcementDone && !reduced) shown.push(lines[lineIndex].slice(0, chars));
    return shown;
  }, [lineIndex, chars, announcementDone, reduced]);

  function skipAhead() {
    setLineIndex(lines.length);
    setChars(0);
    setChecks(checkpoints.length);
    setLanded(true);
  }

  return (
    <div className="relative min-h-[100dvh] overflow-hidden bg-foreground text-background">
      {/* Cabinelicht */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          background:
            "radial-gradient(120% 60% at 50% -10%, color-mix(in oklab, var(--gold) 45%, transparent), transparent 70%)",
        }}
      />

      <div
        className="relative mx-auto flex min-h-[100dvh] max-w-lg flex-col px-5"
        style={{
          paddingTop: "calc(env(safe-area-inset-top) + 2.5rem)",
          paddingBottom: "calc(env(safe-area-inset-bottom) + 2.5rem)",
        }}
      >
        <header className="border-b border-background/20 pb-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-3xl leading-none tracking-[0.28em]" style={{ color: "var(--gold)" }}>
                {airline}
              </p>
              <p className="mt-3 text-2xl leading-none tracking-[0.35em] opacity-90">{route}</p>
              <p className="mt-2 text-[0.7rem] uppercase tracking-[0.25em] opacity-60">Flight BOWDA26 · {teamName}</p>
            </div>
            {!landed ? (
              <button
                type="button"
                onClick={skipAhead}
                className="shrink-0 text-[0.65rem] font-semibold uppercase tracking-widest opacity-60 underline"
              >
                Overslaan
              </button>
            ) : null}
          </div>
        </header>

        <div className="flex-1 space-y-4 pt-6">
          {visibleLines.map((text, i) => (
            <p key={i} className="text-sm leading-relaxed opacity-90">
              {text}
              {i === visibleLines.length - 1 && !announcementDone && !reduced ? (
                <span className="ml-0.5 inline-block animate-pulse">▌</span>
              ) : null}
            </p>
          ))}

          {checks > 0 ? (
            <ul className="mt-8 space-y-2 border-t border-background/20 pt-6">
              {checkpoints.slice(0, checks).map((c) => (
                <li key={c} className="animate-fade-in text-xs uppercase tracking-[0.18em] opacity-85">
                  <span style={{ color: "var(--gold)" }}>✓</span> {c}
                </li>
              ))}
            </ul>
          ) : null}

          {landed ? (
            <p className="animate-scale-in pt-8 text-2xl leading-tight" style={{ color: "var(--gold)" }}>
              {arrivalLabel}
            </p>
          ) : null}
        </div>

        <div className="pt-8" ref={bottomRef}>
          <Button
            size="lg"
            disabled={!landed}
            onClick={onDone}
            className="h-16 w-full rounded-2xl text-lg tracking-[0.2em] transition-opacity disabled:opacity-30"
          >
            {buttonLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
