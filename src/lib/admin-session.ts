import { useEffect, useState } from "react";

const KEY = "bow-admin-session";

const listeners = new Set<(v: boolean) => void>();

export function readAdminSession(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.sessionStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function saveAdminSession() {
  window.sessionStorage.setItem(KEY, "1");
  listeners.forEach((l) => l(true));
}

export function clearAdminSession() {
  window.sessionStorage.removeItem(KEY);
  listeners.forEach((l) => l(false));
}

/** Adminstatus uit Session Storage, reactief binnen de app. */
export function useAdminSession() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setIsAdmin(readAdminSession());
    setHydrated(true);
    const listener = (v: boolean) => setIsAdmin(v);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  return { isAdmin, hydrated };
}
