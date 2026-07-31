import { useEffect, useRef, useState } from "react";
import { Crosshair } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  value: { latitude: number; longitude: number };
  /** Middelpunt bij het openen wanneer er nog geen locatie gekozen is. */
  center: { latitude: number; longitude: number } | null;
  radiusMeters: number;
  onChange: (value: { latitude: number; longitude: number }) => void;
}

const FALLBACK: [number, number] = [50.8754, 4.6919];

/**
 * Kleine kaart om een locatie te prikken. Leaflet raakt `window` aan, dus dit
 * onderdeel wordt lazy geladen achter <ClientOnly>.
 */
export default function MapLocationPicker({ value, center, radiusMeters, onChange }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const markerRef = useRef<import("leaflet").CircleMarker | null>(null);
  const circleRef = useRef<import("leaflet").Circle | null>(null);
  const leafletRef = useRef<typeof import("leaflet") | null>(null);
  const changeRef = useRef(onChange);
  changeRef.current = onChange;
  const [ready, setReady] = useState(false);

  const hasValue = Boolean(value.latitude || value.longitude);
  const start: [number, number] = hasValue
    ? [value.latitude, value.longitude]
    : center
      ? [center.latitude, center.longitude]
      : FALLBACK;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const L = await import("leaflet");
      await import("leaflet/dist/leaflet.css");
      if (cancelled || !containerRef.current || mapRef.current) return;
      leafletRef.current = L;
      const map = L.map(containerRef.current).setView(start, hasValue || center ? 15 : 10);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "© OpenStreetMap",
      }).addTo(map);
      map.on("click", (e: import("leaflet").LeafletMouseEvent) => {
        changeRef.current({
          latitude: Number(e.latlng.lat.toFixed(6)),
          longitude: Number(e.latlng.lng.toFixed(6)),
        });
      });
      mapRef.current = map;
      map.invalidateSize();
      setReady(true);
    })();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      markerRef.current = null;
      circleRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    if (!ready || !L || !map || !hasValue) return;
    const latlng: [number, number] = [value.latitude, value.longitude];
    if (!markerRef.current) {
      markerRef.current = L.circleMarker(latlng, {
        radius: 8,
        color: "#ffffff",
        weight: 3,
        fillColor: "#d97706",
        fillOpacity: 1,
      }).addTo(map);
      circleRef.current = L.circle(latlng, {
        radius: radiusMeters,
        color: "#d97706",
        fillOpacity: 0.12,
      }).addTo(map);
      map.setView(latlng, Math.max(map.getZoom(), 15));
    } else {
      markerRef.current.setLatLng(latlng);
      circleRef.current?.setLatLng(latlng);
    }
    circleRef.current?.setRadius(radiusMeters);
  }, [ready, value.latitude, value.longitude, radiusMeters, hasValue]);

  return (
    <div className="space-y-2">
      <div ref={containerRef} className="h-56 w-full overflow-hidden rounded-2xl" />
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] text-muted-foreground">
          Tik op de kaart om de locatie te kiezen.
        </p>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="rounded-xl"
          onClick={() =>
            navigator.geolocation?.getCurrentPosition((pos) =>
              onChange({
                latitude: Number(pos.coords.latitude.toFixed(6)),
                longitude: Number(pos.coords.longitude.toFixed(6)),
              }),
            )
          }
        >
          <Crosshair className="mr-1 size-4" /> Mijn positie
        </Button>
      </div>
    </div>
  );
}
