import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  createChallenge,
  deleteChallenge,
  updateChallenge,
  type ChallengeInput,
} from "@/lib/admin";
import type { Challenge, ChallengeType } from "@/lib/types";

const TYPE_LABELS: Record<ChallengeType, string> = {
  text_answer: "Tekstantwoord",
  numeric_answer: "Getal",
  multiple_choice: "Meerkeuze",
  photo_upload: "Foto",
  bonus_photo_upload: "Bonusfoto",
};

export function emptyChallenge(options: {
  zoneId?: string | null;
  isBonus?: boolean;
  isLocation?: boolean;
  sortOrder?: number;
}): ChallengeInput {
  return {
    title: "",
    description: null,
    image_url: null,
    challenge_type: options.isBonus ? "bonus_photo_upload" : "text_answer",
    options: [],
    correct_answer: null,
    points: 10,
    creativity_bonus_points: 0,
    sort_order: options.sortOrder ?? 0,
    active: true,
    zone_id: options.zoneId ?? null,
    is_bonus: options.isBonus ?? false,
    duration_minutes: options.isBonus ? 15 : 0,
    notification_message: null,
    is_location: options.isLocation ?? false,
    approval_message: null,
  };
}

export function toInput(challenge: Challenge): ChallengeInput {
  return {
    title: challenge.title,
    description: challenge.description,
    image_url: challenge.image_url,
    challenge_type: challenge.challenge_type,
    options: challenge.options,
    correct_answer: challenge.correct_answer,
    points: challenge.points,
    creativity_bonus_points: challenge.creativity_bonus_points,
    sort_order: challenge.sort_order,
    active: challenge.active,
    zone_id: challenge.zone_id,
    is_bonus: challenge.is_bonus,
    duration_minutes: challenge.duration_minutes,
    notification_message: challenge.notification_message,
    is_location: challenge.is_location,
    approval_message: challenge.approval_message ?? null,
  };
}

interface Props {
  /** Bestaande opdracht bijwerken, of leeg voor een nieuwe. */
  challengeId?: string;
  value: ChallengeInput;
  onChange: (next: ChallengeInput) => void;
  onSaved: () => void;
  onCancel?: () => void;
}

/**
 * Eén editor voor elk soort opdracht: enkel de velden die bij het gekozen
 * type horen worden getoond (meerkeuze-opties, juist antwoord, bonusduur…).
 */
export function ChallengeEditor({ challengeId, value, onChange, onSaved, onCancel }: Props) {
  const [busy, setBusy] = useState(false);

  const type = value.challenge_type;
  const isPhoto = type === "photo_upload" || type === "bonus_photo_upload";
  const isChoice = type === "multiple_choice";
  const hasCorrectAnswer = type === "text_answer" || type === "numeric_answer" || isChoice;

  async function save() {
    if (!value.title.trim()) {
      toast.error("Geef de opdracht een titel.");
      return;
    }
    setBusy(true);
    try {
      const payload: ChallengeInput = {
        ...value,
        title: value.title.trim(),
        options: isChoice ? value.options.filter((o) => o.trim().length > 0) : [],
        correct_answer: hasCorrectAnswer ? value.correct_answer : null,
        duration_minutes: value.is_bonus ? value.duration_minutes : 0,
      };
      if (challengeId) await updateChallenge(challengeId, payload);
      else await createChallenge(payload);
      toast.success(challengeId ? "Opdracht bijgewerkt." : "Opdracht toegevoegd.");
      onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Opslaan mislukt.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-2">
      <Input
        value={value.title}
        onChange={(e) => onChange({ ...value, title: e.target.value })}
        placeholder="Titel van de opdracht"
        className="h-11 rounded-xl"
      />
      <Textarea
        value={value.description ?? ""}
        onChange={(e) => onChange({ ...value, description: e.target.value || null })}
        placeholder="Omschrijving voor de teams"
        rows={3}
        className="rounded-xl"
      />

      <label className="text-[11px] font-semibold">
        Soort opdracht
        <Select
          value={type}
          onValueChange={(v) => onChange({ ...value, challenge_type: v as ChallengeType })}
        >
          <SelectTrigger className="h-11 rounded-xl">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(TYPE_LABELS).map(([key, label]) => (
              <SelectItem key={key} value={key}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>

      {isChoice ? (
        <div className="grid gap-2">
          <Textarea
            value={value.options.join("\n")}
            onChange={(e) =>
              onChange({ ...value, options: e.target.value.split("\n").map((o) => o.trimStart()) })
            }
            placeholder={"Eén antwoordoptie per regel"}
            rows={4}
            className="rounded-xl"
          />
        </div>
      ) : null}

      {hasCorrectAnswer ? (
        <Input
          value={value.correct_answer ?? ""}
          onChange={(e) => onChange({ ...value, correct_answer: e.target.value || null })}
          placeholder="Juist antwoord (leeg = de reisleider kijkt na)"
          className="h-11 rounded-xl"
          inputMode={type === "numeric_answer" ? "numeric" : "text"}
        />
      ) : null}

      {isPhoto ? (
        <Input
          value={value.image_url ?? ""}
          onChange={(e) => onChange({ ...value, image_url: e.target.value || null })}
          placeholder="Voorbeeldfoto (URL, optioneel)"
          className="h-11 rounded-xl"
        />
      ) : null}

      <div className="grid grid-cols-3 gap-2">
        <label className="text-[11px] font-semibold">
          Punten
          <Input
            value={String(value.points)}
            onChange={(e) => onChange({ ...value, points: Number(e.target.value) || 0 })}
            inputMode="numeric"
            className="h-11 rounded-xl"
          />
        </label>
        <label className="text-[11px] font-semibold">
          ⭐ Creatief
          <Input
            value={String(value.creativity_bonus_points)}
            onChange={(e) =>
              onChange({ ...value, creativity_bonus_points: Number(e.target.value) || 0 })
            }
            inputMode="numeric"
            className="h-11 rounded-xl"
          />
        </label>
        <label className="text-[11px] font-semibold">
          Volgorde
          <Input
            value={String(value.sort_order)}
            onChange={(e) => onChange({ ...value, sort_order: Number(e.target.value) || 0 })}
            inputMode="numeric"
            className="h-11 rounded-xl"
          />
        </label>
      </div>

      {value.is_bonus ? (
        <>
          <label className="text-[11px] font-semibold">
            Duur in minuten
            <Input
              value={String(value.duration_minutes)}
              onChange={(e) => onChange({ ...value, duration_minutes: Number(e.target.value) || 0 })}
              inputMode="numeric"
              className="h-11 rounded-xl"
            />
          </label>
          <Textarea
            value={value.notification_message ?? ""}
            onChange={(e) => onChange({ ...value, notification_message: e.target.value || null })}
            placeholder="Melding bij het starten van de bonusopdracht"
            rows={2}
            className="rounded-xl"
          />
        </>
      ) : null}

      <label className="text-[11px] font-semibold">
        Bericht na nakijken (optioneel)
        <Textarea
          value={value.approval_message ?? ""}
          onChange={(e) => onChange({ ...value, approval_message: e.target.value || null })}
          placeholder="Bv. de volgende instructie voor het team"
          rows={3}
          className="rounded-xl"
        />
        <span className="mt-1 block font-normal text-muted-foreground">
          Wordt na goed- of afkeuring naar het team gestuurd en vervangt de standaardmelding. Leeg
          laten = standaardgedrag.
        </span>
      </label>


      <div className="flex gap-2">
        <Button className="h-11 flex-1 rounded-2xl" disabled={busy} onClick={save}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : challengeId ? "Opslaan" : "Toevoegen"}
        </Button>
        {onCancel ? (
          <Button variant="secondary" className="h-11 rounded-2xl" onClick={onCancel}>
            Sluiten
          </Button>
        ) : null}
        {challengeId ? (
          <Button
            size="icon"
            variant="destructive"
            className="size-11 rounded-2xl"
            aria-label="Opdracht verwijderen"
            onClick={async () => {
              if (!window.confirm("Deze opdracht definitief verwijderen?")) return;
              await deleteChallenge(challengeId);
              toast.success("Opdracht verwijderd.");
              onSaved();
            }}
          >
            <Trash2 className="size-4" />
          </Button>
        ) : null}
      </div>
    </div>
  );
}
