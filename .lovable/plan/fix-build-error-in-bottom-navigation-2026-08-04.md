# Fix build error in bottom navigation

## What's wrong

The only build error is in `src/components/BottomNav.tsx` line 34. The tour-target lookup table only lists three routes (`/meldingen`, `/info`, `/statistieken`), but it is indexed with every nav route (`/`, `/galerij`, `/admin` too), so TypeScript refuses the lookup (TS7053).

There is also a stray no-op statement (an empty backtick string) just above the return in the same block that should be removed.

The onboarding tour logic itself is fine — nothing to change in `src/lib/onboarding.ts`.

## Fix

In `src/components/BottomNav.tsx`:

1. Move the `tourTargets` map out of the `.map()` callback to module scope (it never changes per item).
2. Type it as `Record<string, string | undefined>` so any route can be looked up safely, leaving `data-tour` undefined for routes without a tour step.
3. Delete the stray `` `` ``; statement.

No other files, styling, or behaviour change; the tour spotlight targets stay exactly as they are.
