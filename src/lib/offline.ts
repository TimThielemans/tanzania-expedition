import { supabase } from "./supabase";

const QUEUE_KEY = "bow-offline-queue";

export interface QueuedAnswer {
  id: string;
  kind: "answer" | "quiz";
  payload: Record<string, unknown>;
  points: number;
  teamId: string;
  createdAt: string;
}

function read(): QueuedAnswer[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(window.localStorage.getItem(QUEUE_KEY) ?? "[]") as QueuedAnswer[];
  } catch {
    return [];
  }
}

function write(items: QueuedAnswer[]) {
  window.localStorage.setItem(QUEUE_KEY, JSON.stringify(items));
  window.dispatchEvent(new CustomEvent("bow-queue-changed"));
}

export function enqueue(item: Omit<QueuedAnswer, "id" | "createdAt">) {
  write([...read(), { ...item, id: crypto.randomUUID(), createdAt: new Date().toISOString() }]);
}

export function queueSize() {
  return read().length;
}

/** Verstuurt lokaal bewaarde antwoorden zodra er weer verbinding is. */
export async function syncQueue(): Promise<number> {
  const items = read();
  if (items.length === 0) return 0;
  const remaining: QueuedAnswer[] = [];
  let synced = 0;

  for (const item of items) {
    try {
      const table = item.kind === "answer" ? "answers" : "quiz_answers";
      const { error } = await supabase.from(table).upsert(item.payload, { onConflict: "team_id,challenge_id" });
      if (error) throw error;
      if (item.points !== 0) {
        await supabase.rpc("add_points", { p_team_id: item.teamId, p_points: item.points });
      }
      synced += 1;
    } catch {
      remaining.push(item);
    }
  }
  write(remaining);
  return synced;
}
