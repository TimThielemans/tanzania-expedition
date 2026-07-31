-- ============================================================
-- BOW in Tanzania — voorbeelddata (seed)
-- Voer dit uit NA supabase/schema.sql.
-- ============================================================

-- ---------- game_settings ----------
insert into public.game_settings (key, value) values
  ('app_title',                 'BOW in Tanzania'),
  ('welcome_message',           'Welkom bij Expeditie Tanzania'),
  ('zone_unlock_mode',          'password'),
  ('show_scoreboard',           'true'),
  ('show_statistics',           'true'),
  ('show_gallery',              'true'),
  ('location_tracking_enabled', 'false'),
  ('finale_latitude',           '-3.386925'),
  ('finale_longitude',          '36.682995'),
  ('finale_label',              'Finale — Arusha')
on conflict (key) do update set value = excluded.value;

-- ---------- admin_settings ----------
insert into public.admin_settings (key, value) values
  ('admin_password', 'kilimanjaro2026')
on conflict (key) do update set value = excluded.value;

-- ---------- point_actions ----------
insert into public.point_actions (label, points, sort_order) values
  ('+3', 3, 1),
  ('+5', 5, 2),
  ('-3', -3, 3),
  ('-5', -5, 4);

-- ---------- teams ----------
insert into public.teams (name, password, sort_order) values
  ('Team Simba', 'simba', 1),
  ('Team Twiga', 'twiga', 2),
  ('Team Tembo', 'tembo', 3),
  ('Team Chui',  'chui',  4)
on conflict (name) do nothing;

insert into public.scores (team_id, points, regular_points, bonus_points, creativity_points)
select id, 0, 0, 0, 0 from public.teams
on conflict (team_id) do nothing;

-- ---------- zones ----------
-- Leeg unlock_password = zone opent automatisch zodra de vorige zone af is.
insert into public.zones (name, description, tagline, icon, order_index, unlock_type, unlock_password)
values
  ('MTB Adventure', 'Trap je een weg door de heuvels van Arusha.', 'Niet iedereen die dwaalt is verdwaald.', '🚵', 1, 'open',     null),
  ('Mt Meru',       'De klim naar 4.562 meter. Adem diep in.',     'Samen naar de top.',                    '⛰️', 2, 'password', 'MERU2026'),
  ('Safari',        'Big Five spotten in de Serengeti.',           'Ogen open voor avontuur.',              '🦁', 3, 'password', 'SERENGETI'),
  ('Zanzibar',      'Wit zand, blauw water, welverdiende rust.',   'De finish is een paradijs.',            '🌴', 4, 'open',     null);

-- ---------- zoneopdrachten ----------
-- creativity_bonus_points > 0 → de reisleider kan ⭐ Uitstekend geven.
insert into public.challenges
  (zone_id, title, description, challenge_type, options, correct_answer, points, creativity_bonus_points, sort_order)
select z.id, c.title, c.description, c.challenge_type, c.options::jsonb, c.correct_answer, c.points, c.creativity, c.sort_order
from public.zones z
join (values
  ('MTB Adventure', 'Bandenspanning',       'Hoeveel bar pompen jullie in de achterband? Geef een getal.', 'numeric_answer',  '[]', '2',     10,  0, 1),
  ('MTB Adventure', 'Teamfoto op de fiets', 'Maak een foto van het volledige team op de fiets.',           'photo_upload',    '[]', null,    20, 10, 2),
  ('Mt Meru',       'Hoogte van Mt Meru',   'Hoe hoog is Mt Meru in meters?',                              'numeric_answer',  '[]', '4562',  15,  0, 1),
  ('Mt Meru',       'Bergnaam',             'Welke berg zie je vanaf de top van Mt Meru?',                 'text_answer',     '[]', null,    10,  0, 2),
  ('Safari',        'Big Five',             'Welk dier hoort NIET bij de Big Five?',                       'multiple_choice', '["Leeuw","Neushoorn","Giraf","Buffel"]', 'Giraf', 15, 0, 1),
  ('Safari',        'Spot een dier',        'Upload een foto van jullie mooiste spot.',                    'photo_upload',    '[]', null,    20, 10, 2),
  ('Zanzibar',      'Specerijeneiland',     'Welke specerij maakte Zanzibar wereldberoemd?',               'text_answer',     '[]', null,    10,  0, 1),
  ('Zanzibar',      'Strandpiramide',       'Bouw een menselijke piramide op het strand en fotografeer.',  'photo_upload',    '[]', null,    25, 15, 2)
) as c(zone_name, title, description, challenge_type, options, correct_answer, points, creativity, sort_order)
  on c.zone_name = z.name;

-- ---------- bonusopdrachten (los van een zone, standaard uit) ----------
insert into public.challenges
  (zone_id, title, description, challenge_type, is_bonus, notification_message,
   duration_minutes, points, creativity_bonus_points, active, bonus_active, sort_order)
values
  (null, 'Giraf-gespot', 'Maak een foto van iets dat op een giraf lijkt.', 'bonus_photo_upload', true,
   E'📢 BONUSOPDRACHT\n\nZoek iets dat op een giraf lijkt.\n\nJullie hebben 15 minuten.',
   15, 20, 10, false, false, 1),
  (null, 'Kilimanjaro-pose', 'Maak een foto waarop het team samen de hoogste berg vormt.', 'bonus_photo_upload', true,
   E'📢 BONUSOPDRACHT\n\nVorm samen de hoogste berg.\n\nJullie hebben 10 minuten.',
   10, 15, 10, false, false, 2);

-- ---------- locatie-events ----------
insert into public.location_events
  (name, description, latitude, longitude, radius_meters, trigger_mode, notification_target, notification_message, zone_id, active)
values
  ('Bibliotheek-checkpoint', 'Eerste team dat de bibliotheek bereikt krijgt een exclusieve opdracht.',
   -3.366700, 36.680000, 60, 'first', 'team', 'Jullie zijn er als eerste! Er staat een opdracht klaar.', null, false),
  ('Marktplein', 'Elk team dat het marktplein bereikt maakt een teamfoto.',
   -3.370000, 36.690000, 75, 'every', 'team', 'Welkom op het marktplein — er staat een opdracht klaar.',
   (select id from public.zones where name = 'Safari'), false),
  ('Aankomst finale', 'Melding aan de reisleider zodra een team de finale bereikt.',
   -3.386925, 36.682995, 100, 'every', 'admin', 'Een team is aangekomen op de finalelocatie.', null, false);

-- ---------- locatieopdrachten (één-op-één aan een event gekoppeld) ----------
insert into public.challenges
  (zone_id, title, description, challenge_type, points, creativity_bonus_points,
   is_location, location_event_id, active, sort_order)
values
  (null, 'Torens tellen', 'Hoeveel torens zie je vanaf dit punt? Geef een getal.',
   'numeric_answer', 20, 0, true,
   (select id from public.location_events where name = 'Bibliotheek-checkpoint'), true, 1),
  (null, 'Teamfoto op de markt', 'Maak hier een foto van het volledige team.',
   'photo_upload', 15, 10, true,
   (select id from public.location_events where name = 'Marktplein'), true, 2);

-- ---------- team_progress: eerste zone open voor iedereen ----------
insert into public.team_progress (team_id, zone_id, unlocked, unlocked_at)
select t.id, z.id, (z.order_index = 1), case when z.order_index = 1 then now() end
from public.teams t cross join public.zones z
on conflict (team_id, zone_id) do nothing;
