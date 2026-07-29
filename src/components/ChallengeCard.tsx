import { useRef, useState } from "react";
import { toast } from "sonner";
import { Camera, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ImageLightbox } from "@/components/ImageLightbox";
import { OfflineQueuedError, submitQuizAnswer, submitTextAnswer, uploadPhoto } from "@/lib/api";
import type { Challenge } from "@/lib/types";
import { cn } from "@/lib/utils";

interface ChallengeCardProps {
  challenge: Challenge;
  teamId: string;
  submitted: boolean;
  submittedValue?: string;
  onSubmitted: () => void;
}

export function ChallengeCard({
  challenge,
  teamId,
  submitted,
  submittedValue,
  onSubmitted,
}: ChallengeCardProps) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
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

  async function handleFile(file: File) {
    setPreview(URL.createObjectURL(file));
    await run(() => uploadPhoto(ctx, file));
  }

  return (
    <article className="rounded-3xl border border-border bg-card p-4 shadow-card">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
        <div className="min-w-0">
          <h3 className="text-xl leading-tight">{challenge.title}</h3>
          {challenge.description ? (
            <p className="mt-1 text-sm text-muted-foreground">{challenge.description}</p>
          ) : null}
        </div>
        <span className="shrink-0 rounded-full bg-gold-gradient px-3 py-1 text-xs font-bold text-accent-foreground">
          {challenge.points} pt
        </span>
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


      {submitted ? (
        <div className="mt-4 flex items-center gap-2 rounded-2xl bg-secondary px-4 py-3 text-sm font-semibold text-secondary-foreground">
          <Check className="size-4 shrink-0" />
          <span className="min-w-0 truncate">Ingezonden{submittedValue ? `: ${submittedValue}` : ""}</span>
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

          {challenge.challenge_type === "photo_upload" && (
            <>
              {preview ? (
                <img src={preview} alt="Voorbeeld" className="w-full rounded-2xl object-cover" />
              ) : null}
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleFile(file);
                }}
              />
              <Button
                size="lg"
                variant="secondary"
                className="h-12 w-full rounded-2xl text-base"
                disabled={busy}
                onClick={() => fileRef.current?.click()}
              >
                {busy ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <>
                    <Camera className="size-4" /> Foto maken of kiezen
                  </>
                )}
              </Button>
            </>
          )}
        </div>
      )}
    </article>
  );
}
