import { useEffect, useState } from "react";

const KEY = "bow-team-session";

export interface TeamSession {
  teamId: string;
  teamName: string;
}

const listeners = new Set<(s: TeamSession | null) => void>();

export function readSession(): TeamSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as TeamSession) : null;
  } catch {
    return null;
  }
}

export function saveSession(session: TeamSession) {
  window.localStorage.setItem(KEY, JSON.stringify(session));
  listeners.forEach((l) => l(session));
}

export function clearSession() {
  window.localStorage.removeItem(KEY);
  listeners.forEach((l) => l(null));
}

/** Team-sessie uit Local Storage; blijft ingelogd na refresh. */
export function useTeamSession() {
  const [session, setSession] = useState<TeamSession | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setSession(readSession());
    setHydrated(true);
    const listener = (s: TeamSession | null) => setSession(s);
    listeners.add(listener);
    const onStorage = () => setSession(readSession());
    window.addEventListener("storage", onStorage);
    return () => {
      listeners.delete(listener);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  return { session, hydrated };
}
