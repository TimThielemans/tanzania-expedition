import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

interface ImageLightboxProps {
  src: string;
  alt: string;
  open: boolean;
  onClose: () => void;
}

/** Volledig scherm foto met pinch-to-zoom (mobiel) en scroll-zoom (desktop). */
export function ImageLightbox({ src, alt, open, onClose }: ImageLightboxProps) {
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const gesture = useRef<{ dist: number; scale: number } | null>(null);
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    setScale(1);
    setOffset({ x: 0, y: 0 });
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;

  const distance = (touches: React.TouchList) => {
    const [a, b] = [touches[0], touches[1]];
    return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  };

  const clamp = (value: number) => Math.min(5, Math.max(1, value));

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 touch-none"
      role="dialog"
      aria-modal="true"
      aria-label={alt}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Sluiten"
        className="absolute right-4 top-[calc(env(safe-area-inset-top)+1rem)] z-10 grid size-12 place-items-center rounded-full bg-white/15 text-white backdrop-blur transition-colors active:bg-white/30"
      >
        <X className="size-6" />
      </button>

      <p className="absolute bottom-[calc(env(safe-area-inset-bottom)+1rem)] left-0 right-0 px-6 text-center text-xs text-white/70">
        Knijp om in te zoomen · dubbeltik om te herstellen
      </p>

      <img
        src={src}
        alt={alt}
        draggable={false}
        className="max-h-[85vh] max-w-[95vw] select-none object-contain"
        style={{
          transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
          transition: gesture.current || drag.current ? "none" : "transform 150ms ease-out",
        }}
        onDoubleClick={() => {
          setScale((s) => (s > 1 ? 1 : 2));
          setOffset({ x: 0, y: 0 });
        }}
        onWheel={(e) => setScale((s) => clamp(s - e.deltaY * 0.003))}
        onTouchStart={(e) => {
          if (e.touches.length === 2) {
            gesture.current = { dist: distance(e.touches), scale };
          } else if (e.touches.length === 1 && scale > 1) {
            drag.current = {
              x: e.touches[0].clientX,
              y: e.touches[0].clientY,
              ox: offset.x,
              oy: offset.y,
            };
          }
        }}
        onTouchMove={(e) => {
          if (e.touches.length === 2 && gesture.current) {
            const next = clamp((distance(e.touches) / gesture.current.dist) * gesture.current.scale);
            setScale(next);
            if (next === 1) setOffset({ x: 0, y: 0 });
          } else if (e.touches.length === 1 && drag.current) {
            setOffset({
              x: drag.current.ox + (e.touches[0].clientX - drag.current.x),
              y: drag.current.oy + (e.touches[0].clientY - drag.current.y),
            });
          }
        }}
        onTouchEnd={() => {
          gesture.current = null;
          drag.current = null;
        }}
      />
    </div>
  );
}
