# Plan: Add `.env` file for Supabase credentials

## What will be built
Create a new `.env` file at the project root with the Supabase client credentials the user has already shared. This file will be used by Vite at build time for `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.

## Files changed
- `/.env` (new)

## Contents
```env
VITE_SUPABASE_URL=https://gqxixhompbcuafxyfaez.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_h4VaW3gJnFEDL6oZS9f3pw__5PNlV2g
```

## Notes
- `VITE_` prefixed variables are client-side build variables and belong in `.env`, not in Lovable Secrets.
- The existing `.env.example` will remain as a template.
- The user can edit the `.env` file in the Code Editor afterwards if they need to change the values.
