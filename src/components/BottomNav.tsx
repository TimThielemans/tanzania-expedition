import { Link, useRouterState } from "@tanstack/react-router";
import { Home, Trophy, BarChart3, Images, Shield } from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { to: "/", label: "Home", icon: Home },
  { to: "/scorebord", label: "Score", icon: Trophy },
  { to: "/statistieken", label: "Stats", icon: BarChart3 },
  { to: "/galerij", label: "Foto's", icon: Images },
  { to: "/admin", label: "Admin", icon: Shield },
] as const;

export function BottomNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <ul className="mx-auto grid max-w-lg grid-cols-5">
        {items.map(({ to, label, icon: Icon }) => {
          const active = to === "/" ? pathname === "/" : pathname.startsWith(to);
          return (
            <li key={to}>
              <Link
                to={to}
                className={cn(
                  "flex min-h-16 flex-col items-center justify-center gap-1 text-[11px] font-semibold transition-colors",
                  active ? "text-primary" : "text-muted-foreground",
                )}
              >
                <Icon className="size-5 shrink-0" />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
