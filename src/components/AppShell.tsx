import type { ReactNode } from "react";
import { BottomNav } from "./BottomNav";
import { OfflineBanner } from "./OfflineBanner";

interface AppShellProps {
  title: string;
  subtitle?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  hideNav?: boolean;
}

export function AppShell({ title, subtitle, action, children, hideNav }: AppShellProps) {
  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="bg-hero px-4 pb-8 pt-[calc(env(safe-area-inset-top)+1.25rem)] text-primary-foreground">
        <div className="mx-auto grid max-w-lg grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-3xl leading-none">{title}</h1>
            {subtitle ? <div className="mt-1 text-sm opacity-90">{subtitle}</div> : null}
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>
      </header>

      <main className="mx-auto -mt-5 max-w-lg px-4">
        <OfflineBanner />
        {children}
      </main>

      {hideNav ? null : <BottomNav />}
    </div>
  );
}
