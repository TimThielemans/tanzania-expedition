/**
 * Foutmeldingen van Supabase zijn gewone objecten (geen Error), waardoor de UI
 * ze anders als "Actie mislukt." toont. Hier maken we er leesbare Errors van
 * en loggen we alles wat nodig is om de oorzaak te vinden.
 */

interface SupabaseLikeError {
  message?: string;
  code?: string;
  details?: string;
  hint?: string;
  status?: number;
  name?: string;
}

export function describeError(error: unknown): string {
  if (!error) return "Onbekende fout.";
  if (typeof error === "string") return error;
  const e = error as SupabaseLikeError;
  return [
    e.message ?? "Onbekende fout.",
    e.code ? `(code ${e.code})` : "",
    e.details ? `· ${e.details}` : "",
    e.hint ? `· tip: ${e.hint}` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

/** Logt de volledige respons van een RPC-call en gooit een echte Error bij fouten. */
export function logRpc(name: string, result: { data?: unknown; error?: unknown; status?: number }) {
  const error = result.error as SupabaseLikeError | null | undefined;
  // eslint-disable-next-line no-console
  console.info(`[rpc:${name}]`, {
    ok: !error,
    status: result.status ?? (error?.status ?? null),
    data: result.data ?? null,
    errorName: error?.name ?? null,
    errorCode: error?.code ?? null,
    errorMessage: error?.message ?? null,
    errorDetails: error?.details ?? null,
    errorHint: error?.hint ?? null,
    raw: error ? JSON.stringify(error) : null,
  });
  if (error) {
    throw new Error(`${name}: ${describeError(error)}`);
  }
}
