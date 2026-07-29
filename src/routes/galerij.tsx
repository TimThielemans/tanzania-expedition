import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { X } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { ConfigNotice } from "@/components/ConfigNotice";
import { usePhotos, useTeams } from "@/hooks/useGame";
import { isSupabaseConfigured } from "@/lib/supabase";

export const Route = createFileRoute("/galerij")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Fotogalerij — BOW in Tanzania" },
      { name: "description", content: "Alle foto's die de teams tijdens de expeditie uploadden." },
      { property: "og:title", content: "Fotogalerij — BOW in Tanzania" },
      { property: "og:description", content: "Alle foto's van de teams tijdens de expeditie." },
    ],
  }),
  component: GalleryPage,
});

function GalleryPage() {
  const { data: photos } = usePhotos();
  const { data: teams } = useTeams();
  const [active, setActive] = useState<string | null>(null);

  if (!isSupabaseConfigured) return <ConfigNotice />;

  const teamName = (id: string) => teams?.find((t) => t.id === id)?.name ?? "Onbekend team";

  return (
    <AppShell title="Fotogalerij" subtitle={`${photos?.length ?? 0} foto's`}>
      <div className="mt-4 grid grid-cols-2 gap-3">
        {(photos ?? []).map((photo) => (
          <button
            key={photo.id}
            type="button"
            onClick={() => setActive(photo.photo_url)}
            className="overflow-hidden rounded-3xl border border-border bg-card text-left shadow-card"
          >
            <img
              src={photo.photo_url}
              alt={`Foto van ${teamName(photo.team_id)}`}
              loading="lazy"
              className="aspect-square w-full object-cover"
            />
            <p className="truncate px-3 py-2 text-xs font-semibold">{teamName(photo.team_id)}</p>
          </button>
        ))}
      </div>
      {photos && photos.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">Nog geen foto's geüpload.</p>
      ) : null}

      {active ? (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-foreground/90 p-4"
          onClick={() => setActive(null)}
        >
          <img src={active} alt="Foto op volledig scherm" className="max-h-full w-full rounded-2xl object-contain" />
          <button
            type="button"
            className="absolute right-4 top-4 grid size-11 place-items-center rounded-full bg-card"
            onClick={() => setActive(null)}
            aria-label="Sluiten"
          >
            <X className="size-5" />
          </button>
        </div>
      ) : null}
    </AppShell>
  );
}
