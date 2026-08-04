-- ============================================================
-- BOW in Tanzania — upgrade 5
-- Eigen bericht per opdracht dat na het nakijken naar het team gaat.
-- Voer dit uit in de Supabase SQL Editor.
-- ============================================================

alter table public.challenges
  add column if not exists approval_message text default null;
