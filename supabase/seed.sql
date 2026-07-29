-- ============================================================
-- BOW in Tanzania — voorbeelddata (seed)
-- Voer dit uit NA schema.sql, in de Supabase SQL Editor.
-- ============================================================

-- ---------- game_settings ----------
insert into public.game_settings (key, value) values
  ('app_title',        'BOW in Tanzania'),
  ('welcome_message',  'Welkom bij Expeditie Tanzania'),
  ('zone_unlock_mode', 'password'),
  ('show_scoreboard',  'true'),
  ('show_statistics',  'true'),
  ('show_gallery',     'true')
on conflict (key) do update set value = excluded.value;

-- ---------- admin_settings ----------
insert into public.admin_settings (key, value) values
  ('admin_password', 'kilimanjaro2026')
on conflict (key) do update set value = excluded.value;

-- ---------- point_actions (standaard 4 knoppen) ----------
insert into public.point_actions (label, points, sort_order) values
  ('+3', 3, 1),
  ('+5', 5, 2),
  ('-3', -3, 3),
  ('-5', -5, 4)
on conflict do nothing;

-- ---------- teams ----------
insert into public.teams (name, password, sort_order) values
  ('Team Simba',    'simba',    1),
  ('Team Twiga',    'twiga',    2),
  ('Team Tembo',    'tembo',    3),
  ('Team Chui',     'chui',     4)
on conflict (name) do nothing;

-- score-rij voor elk team
insert into public.scores (team_id, points)
select id, 0 from public.teams
on conflict (team_id) do nothing;

-- ---------- zones ----------
insert into public.zones (name, description, icon, order_index, unlock_type, unlock_password, automatic_unlock)
values
  ('MTB Adventure', 'Trap je een weg door de heuvels van Arusha.', '🚵', 1, 'open', null, false),
  ('Mt Meru',       'De klim naar 4.562 meter. Adem diep in.',      '⛰️', 2, 'password', 'meru', false),
  ('Safari',        'Big Five spotten in de Serengeti.',            '🦁', 3, 'password', 'serengeti', false),
  ('Zanzibar',      'Wit zand, blauw water, welverdiende rust.',    '🌴', 4, 'automatic_after_completion', null, true)
on conflict do nothing;

-- ---------- challenges ----------
insert into public.challenges (zone_id, title, description, challenge_type, options, correct_answer, points, sort_order)
select z.id, c.title, c.description, c.challenge_type, c.options::jsonb, c.correct_answer, c.points, c.sort_order
from public.zones z
join (values
  ('MTB Adventure', 'Bandenspanning',      'Hoeveel bar pompen jullie in de achterband? Geef een getal.', 'numeric_answer', '[]', '2', 10, 1),
  ('MTB Adventure', 'Teamfoto op de fiets','Maak een foto van het volledige team op de fiets.',           'photo_upload',   '[]', null, 20, 2),
  ('Mt Meru',       'Hoogte van Mt Meru',  'Hoe hoog is Mt Meru in meters?',                              'numeric_answer', '[]', '4562', 15, 1),
  ('Mt Meru',       'Bergnaam',            'Welke berg zie je vanaf de top van Mt Meru?',                 'text_answer',    '[]', null, 10, 2),
  ('Safari',        'Big Five',            'Welk dier hoort NIET bij de Big Five?',                       'multiple_choice','["Leeuw","Neushoorn","Giraf","Buffel"]', 'Giraf', 15, 1),
  ('Safari',        'Spot een dier',       'Upload een foto van jullie mooiste ''spot''.',                'photo_upload',   '[]', null, 20, 2),
  ('Zanzibar',      'Specerijeneiland',    'Welke specerij maakte Zanzibar wereldberoemd?',               'text_answer',    '[]', null, 10, 1),
  ('Zanzibar',      'Strandpiramide',      'Bouw een menselijke piramide op het strand en fotografeer.',  'photo_upload',   '[]', null, 25, 2)
) as c(zone_name, title, description, challenge_type, options, correct_answer, points, sort_order)
  on c.zone_name = z.name
on conflict do nothing;

-- ---------- team_progress: eerste zone open voor iedereen ----------
insert into public.team_progress (team_id, zone_id, unlocked, unlocked_at)
select t.id, z.id, (z.unlock_type = 'open'), case when z.unlock_type = 'open' then now() end
from public.teams t cross join public.zones z
on conflict (team_id, zone_id) do nothing;
