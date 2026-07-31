import { useRef, useState } from "react";
import { toast } from "sonner";
import { Camera, ImageIcon, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ImageLightbox } from "@/components/ImageLightbox";
import { PointsBadge, type ChallengeState } from "@/components/StatusBadge";
import { OfflineQueuedError, submitQuizAnswer, submitTextAnswer, uploadPhoto } from "@/lib/api";
import type { Challenge } from "@/lib/types";
import { cn } from "@/lib/utils";

interface ChallengeCardProps {
  challenge: Challenge;
  teamId: string;
  submitted: boolean;
  submittedValue?: string;
  state?: ChallengeState;
  awardedPoints?: number;
  onSubmitted: () => void;
  /** Locatieopdracht: extra badge en de mogelijkheid om niet deel te nemen. */
  isLocation?: boolean;
  onDismiss?: () => void;
}

const stateHint: Record<ChallengeState, string> = {
  todo: "",
  pending: "Ingezonden — de reisleider kijkt dit na.",
  approved: "Goedgekeurd — punten toegekend.",
  rejected: "Afgekeurd — geen punten.",
};

export function ChallengeCard({
  challenge,
  teamId,
  submitted,
  submittedValue,
  state = "todo",
  awardedPoints,
  onSubmitted,
  isLocation = false,
  onDismiss,
}: ChallengeCardProps) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [lightbox, setLightbox] = useState(false);
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const ctx = { teamId, zoneId: challenge.zone_id, challenge };

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    try {
      await action();
      toast.success("Ingezonden! 🎉");
      onSubmitted();
    } catch (error) {
      if (error instanceof OfflineQueuedError) toast.info(error.message);
      else toast.error(error instanceof Error ? error.message : "Er ging iets mis.");
    } finally {
      setBusy(false);
    }
  }

  function pickFile(file: File) {
    setPendingFile(file);
    setPreview(URL.createObjectURL(file));
  }

  const isPhoto =
    challenge.challenge_type === "photo_upload" || challenge.challenge_type === "bonus_photo_upload";

  return (
    <article className="rounded-3xl border border-border bg-card p-4 shadow-card">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {isLocation ? (
              <span className="rounded-full bg-accent px-2 py-0.5 text-[11px] font-bold text-accent-foreground">
                📍 Locatieopdracht
              </span>
            ) : null}
            {challenge.creativity_bonus_points > 0 ? (
              <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-bold text-secondary-foreground">
                ⭐ Creativiteit
              </span>
            ) : null}
          </div>
          <h3 className="text-xl leading-tight">{challenge.title}</h3>
          {challenge.description ? (
            <p className="mt-1 text-sm text-muted-foreground">{challenge.description}</p>
          ) : null}
        </div>
        <PointsBadge state={state} points={challenge.points} awarded={awardedPoints} />
      </div>

      {challenge.image_url ? (
        <>
          <button
            type="button"
            onClick={() => setLightbox(true)}
            className="mt-3 block w-full overflow-hidden rounded-2xl bg-muted"
            aria-label={`${challenge.title} — foto vergroten`}
          >
            <img
              src={challenge.image_url}
              alt={challenge.title}
              loading="lazy"
              className="max-h-72 w-full object-contain"
            />
          </button>
          <ImageLightbox
            src={challenge.image_url}
            alt={challenge.title}
            open={lightbox}
            onClose={() => setLightbox(false)}
          />
        </>
      ) : null}

      {!submitted && isLocation && onDismiss ? (
        <Button
          variant="ghost"
          className="mt-2 h-9 w-full rounded-xl text-xs text-muted-foreground"
          onClick={onDismiss}
        >
          Niet deelnemen
        </Button>
      ) : null}

      {submitted ? (
        <div className="mt-4 space-y-1 rounded-2xl bg-secondary px-4 py-3 text-sm font-semibold text-secondary-foreground">
          <div className="flex items-center gap-2">
            <Check className="size-4 shrink-0" />
            <span className="min-w-0 truncate">
              Ingezonden{submittedValue ? `: ${submittedValue}` : ""}
            </span>
          </div>
          {state !== "todo" ? (
            <p className="text-xs font-medium opacity-80">{stateHint[state]}</p>
          ) : null}
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {challenge.challenge_type === "text_answer" && (
            <>
              <Textarea
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="Jullie antwoord…"
                rows={3}
                className="rounded-2xl text-base"
              />
              <Button
                size="lg"
                className="h-12 w-full rounded-2xl text-base"
                disabled={busy || value.trim().length === 0}
                onClick={() => run(() => submitTextAnswer(ctx, value.trim()))}
              >
                {busy ? <Loader2 className="size-4 animate-spin" /> : "Versturen"}
              </Button>
            </>
          )}

          {challenge.challenge_type === "numeric_answer" && (
            <>
              <Input
                type="number"
                inputMode="decimal"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="Getal"
                className="h-12 rounded-2xl text-base"
              />
              <Button
                size="lg"
                className="h-12 w-full rounded-2xl text-base"
                disabled={busy || value.trim() === "" || Number.isNaN(Number(value))}
                onClick={() => {
                  if (Number.isNaN(Number(value))) {
                    toast.error("Vul een geldig getal in.");
                    return;
                  }
                  void run(() => submitTextAnswer(ctx, String(Number(value))));
                }}
              >
                {busy ? <Loader2 className="size-4 animate-spin" /> : "Versturen"}
              </Button>
            </>
          )}

          {challenge.challenge_type === "multiple_choice" && (
            <div className="space-y-2">
              {challenge.options.map((option) => (
                <button
                  key={option}
                  type="button"
                  disabled={busy}
                  onClick={() => setValue(option)}
                  className={cn(
                    "min-h-12 w-full rounded-2xl border px-4 py-3 text-left text-base font-medium transition-colors",
                    value === option
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background",
                  )}
                >
                  {option}
                </button>
              ))}
              <Button
                size="lg"
                className="h-12 w-full rounded-2xl text-base"
                disabled={busy || !value}
                onClick={() => run(() => submitQuizAnswer(ctx, value))}
              >
                {busy ? <Loader2 className="size-4 animate-spin" /> : "Versturen"}
              </Button>
            </div>
          )}

          {isPhoto && (
            <>
              {preview ? (
                <img
                  src={preview}
                  alt="Voorbeeld van de gekozen foto"
                  className="max-h-72 w-full rounded-2xl object-contain"
                />
              ) : null}

              <input
                ref={cameraRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) pickFile(file);
                  e.target.value = "";
                }}
              />
              <input
                ref={galleryRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) pickFile(file);
                  e.target.value = "";
                }}
              />

              <div className="grid grid-cols-2 gap-2">
                <Button
                  size="lg"
                  variant="secondary"
                  className="h-12 rounded-2xl text-sm"
                  disabled={busy}
                  onClick={() => cameraRef.current?.click()}
                >
                  <Camera className="size-4" /> Foto maken
                </Button>
                <Button
                  size="lg"
                  variant="secondary"
                  className="h-12 rounded-2xl text-sm"
                  disabled={busy}
                  onClick={() => galleryRef.current?.click()}
                >
                  <ImageIcon className="size-4" /> Uit galerij
                </Button>
              </div>

              <Button
                size="lg"
                className="h-12 w-full rounded-2xl text-base"
                disabled={busy || !pendingFile}
                onClick={() => {
                  if (!pendingFile) return;
                  void run(() => uploadPhoto(ctx, pendingFile));
                }}
              >
                {busy ? <Loader2 className="size-4 animate-spin" /> : "Foto versturen"}
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                Foto's leveren punten op zodra de reisleider ze goedkeurt.
              </p>
            </>
          )}
        </div>
      )}
    </article>
  );
}
