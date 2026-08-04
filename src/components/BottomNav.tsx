import { Link, useRouterState } from "@tanstack/react-router";
import { Home, Dices, MapPinned, Images, Bell, Shield } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAdminSession } from "@/lib/admin-session";
import { useNotificationCenter } from "@/hooks/useNotificationCenter";

const baseItems = [
  { to: "/", label: "Home", icon: Home },
  { to: "/info", label: "Info", icon: Dices },
  { to: "/statistieken", label: "Map", icon: MapPinned },
  { to: "/galerij", label: "Foto's", icon: Images },
  { to: "/meldingen", label: "Meldingen", icon: Bell },
] as const;

export function BottomNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { isAdmin } = useAdminSession();
  const { unread } = useNotificationCenter();

  const items = isAdmin ? [...baseItems, { to: "/admin", label: "Admin", icon: Shield } as const] : baseItems;

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <ul className={cn("mx-auto grid max-w-lg", isAdmin ? "grid-cols-6" : "grid-cols-5")}>
        {items.map(({ to, label, icon: Icon }) => {
          const active = to === "/" ? pathname === "/" : pathname.startsWith(to);
          return (
            <li
              key={to}
              data-tour={
                to === "/meldingen"
                  ? "nav-meldingen"
                  : to === "/info"
                    ? "nav-info"
                    : to === "/statistieken"
                      ? "nav-map"
                      : undefined
              }
            >
              <Link
                to={to}
                className={cn(
                  "flex min-h-16 flex-col items-center justify-center gap-1 text-[11px] font-semibold transition-colors",
                  active ? "text-primary" : "text-muted-foreground",
                )}
              >
                <span className="relative">
                  <Icon className="size-5 shrink-0" />
                  {to === "/meldingen" && unread > 0 ? (
                    <span className="absolute -right-2 -top-1.5 grid min-w-4 animate-pulse place-items-center rounded-full bg-destructive px-1 text-[10px] font-bold leading-4 text-destructive-foreground">
                      {unread > 9 ? "9+" : unread}
                    </span>
                  ) : null}
                </span>
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
