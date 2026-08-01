import { useEffect, useRef } from "react";
import type { LocationEvent, Team, TeamLocation } from "@/lib/types";

interface Props {
  teams: Team[];
  locations: TeamLocation[];
  events: LocationEvent[];
  /** Finale-/reisleiderlocatie. */
  finale: { latitude: number; longitude: number } | null;
}

const TEAM_COLORS = ["#2563eb", "#dc2626", "#16a34a", "#d97706", "#7c3aed", "#0891b2", "#db2777"];

/**
 * Live kaart met alle teamposities. Leaflet raakt `window` aan, dus dit
 * onderdeel wordt enkel na hydratatie geladen (zie AdminMapPanel).
 */
export default function AdminMap({ teams, locations, events, finale }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const layerRef = useRef<import("leaflet").LayerGroup | null>(null);
  const leafletRef = useRef<typeof import("leaflet") | null>(null);
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const L = await import("leaflet");
      await import("leaflet/dist/leaflet.css");
      if (cancelled || !containerRef.current || mapRef.current) return;
      leafletRef.current = L;
      const map = L.map(containerRef.current).setView(
        finale ? [finale.latitude, finale.longitude] : [50.8754, 4.6919],
        finale ? 13 : 10,
      );
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "© OpenStreetMap",
      }).addTo(map);
      layerRef.current = L.layerGroup().addTo(map);
      mapRef.current = map;
      setMapReady(true);
      // Eerste tekening meteen na het initialiseren.
      map.invalidateSize();

      setTimeout(() => map.invalidateSize(), 100);
    })();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const L = leafletRef.current;
    const layer = layerRef.current;
    const map = mapRef.current;
    if (!L || !layer || !map) return;
    layer.clearLayers();

    const points: [number, number][] = [];

    teams.forEach((team, index) => {
      const loc = locations.find((l) => l.team_id === team.id);
      if (!loc) return;
      const color = team.color ?? TEAM_COLORS[index % TEAM_COLORS.length];
      points.push([loc.latitude, loc.longitude]);
      L.circleMarker([loc.latitude, loc.longitude], {
        radius: 10,
        color: "#ffffff",
        weight: 3,
        fillColor: color,
        fillOpacity: 1,
      })
        .bindPopup(
          `<strong>${team.name}</strong><br/>Laatste update: ${new Date(loc.updated_at).toLocaleTimeString("nl-BE")}`,
        )
        .addTo(layer);
    });

    events.forEach((event) => {
      if (!event.active) return;
      points.push([event.latitude, event.longitude]);
      L.circle([event.latitude, event.longitude], {
        radius: event.radius_meters,
        color: "#d97706",
        fillOpacity: 0.1,
      })
        .bindPopup(`<strong>${event.name}</strong><br/>${event.radius_meters} m`)
        .addTo(layer);
    });

    if (finale) {
      points.push([finale.latitude, finale.longitude]);
      L.marker([finale.latitude, finale.longitude]).bindPopup("🏁 Finale").addTo(layer);
    }

    if (points.length > 0) {
      map.fitBounds(L.latLngBounds(points).pad(0.3), { maxZoom: 16 });
      map.invalidateSize();
    }
  }, [teams, locations, events, finale]);

  return <div ref={containerRef} className="h-80 w-full rounded-2xl" />;
}
