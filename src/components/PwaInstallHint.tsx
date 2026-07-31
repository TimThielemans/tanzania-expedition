import { useEffect, useState } from "react";
import { Share, SquarePlus } from "lucide-react";

/** Korte uitleg om de app op het startscherm te zetten (enkel op mobiel, niet als PWA). */
export function PwaInstallHint() {
  const [show, setShow] = useState(false);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as { standalone?: boolean }).standalone === true;
    const mobile = /iphone|ipad|ipod|android/i.test(window.navigator.userAgent);
    setIos(/iphone|ipad|ipod/i.test(window.navigator.userAgent));
    setShow(mobile && !standalone);
  }, []);

  if (!show) return null;

  return (
    <div className="rounded-2xl bg-secondary px-4 py-3 text-xs text-secondary-foreground">
      <p className="font-semibold">Zet de app op je startscherm</p>
      <p className="mt-1 flex items-center gap-1 opacity-90">
        {ios ? (
          <>
            Tik op <Share className="inline size-3.5" /> en kies “Zet op beginscherm”.
          </>
        ) : (
          <>
            Open het menu <SquarePlus className="inline size-3.5" /> en kies “App installeren”.
          </>
        )}
      </p>
    </div>
  );
}
