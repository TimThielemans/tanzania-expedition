import { AlertTriangle } from "lucide-react";

export function ConfigNotice() {
  return (
    <div className="min-h-screen bg-background px-4 py-10">
      <div className="mx-auto max-w-lg rounded-3xl border border-border bg-card p-6 shadow-card">
        <AlertTriangle className="size-8 text-accent" />
        <h1 className="mt-3 text-2xl">Supabase nog niet gekoppeld</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Voeg de omgevingsvariabelen toe en herstart de app:
        </p>
        <pre className="mt-4 overflow-x-auto rounded-2xl bg-muted p-4 text-xs">
          {`VITE_SUPABASE_URL=https://<project>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key>`}
        </pre>
        <p className="mt-4 text-sm text-muted-foreground">
          Zie de sectie <strong>SUPABASE SETUP GUIDE</strong> in README.md voor de volledige stappen.
        </p>
      </div>
    </div>
  );
}
