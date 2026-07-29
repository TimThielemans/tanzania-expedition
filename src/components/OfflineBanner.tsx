import { useEffect, useState } from "react";
import { CloudOff, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { queueSize, syncQueue } from "@/lib/offline";
import { useQueryClient } from "@tanstack/react-query";

export function OfflineBanner() {
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);
  const queryClient = useQueryClient();

  useEffect(() => {
    const update = () => setPending(queueSize());
    update();
    setOnline(navigator.onLine);

    const onOnline = async () => {
      setOnline(true);
      const synced = await syncQueue();
      update();
      if (synced > 0) {
        toast.success(`${synced} bewaarde inzending(en) verstuurd.`);
        void queryClient.invalidateQueries();
      }
    };
    const onOffline = () => setOnline(false);

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    window.addEventListener("bow-queue-changed", update);
    void onOnlineIfNeeded();

    async function onOnlineIfNeeded() {
      if (navigator.onLine && queueSize() > 0) await onOnline();
    }

    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("bow-queue-changed", update);
    };
  }, [queryClient]);

  if (online && pending === 0) return null;

  return (
    <div className="mb-3 flex items-center gap-2 rounded-2xl border border-accent bg-accent/20 px-4 py-3 text-sm font-medium text-accent-foreground">
      {online ? <RefreshCw className="size-4 shrink-0" /> : <CloudOff className="size-4 shrink-0" />}
      <span className="min-w-0">
        {online
          ? `${pending} inzending(en) worden gesynchroniseerd…`
          : `Offline — ${pending} inzending(en) lokaal bewaard.`}
      </span>
    </div>
  );
}
