export type ChallengeType =
  | "text_answer"
  | "numeric_answer"
  | "photo_upload"
  | "multiple_choice"
  | "bonus_photo_upload";

export type ReviewStatus = "pending" | "approved" | "rejected";
export type UnlockType = "password" | "automatic_after_completion" | "open";

/** De drie puntensoorten. Het totaal is altijd de som van de drie. */
export type PointKind = "regular" | "bonus" | "creativity";

export interface Team {
  id: string;
  name: string;
  password: string;
  color: string | null;
  sort_order: number;
  active: boolean;
  group_photo_url: string | null;
  created_at: string;
}

export interface Zone {
  id: string;
  name: string;
  description: string | null;
  tagline: string | null;
  picture: string | null;
  icon: string;
  order_index: number;
  unlock_type: UnlockType;
  unlock_password: string | null;
  automatic_unlock: boolean;
  active: boolean;
}

export interface Challenge {
  id: string;
  zone_id: string | null;
  title: string;
  description: string | null;
  image_url: string | null;
  challenge_type: ChallengeType;
  options: string[];
  correct_answer: string | null;
  points: number;
  /** > 0 → de reisleider kan ⭐ Uitstekend geven met deze extra creativiteitspunten. */
  creativity_bonus_points: number;
  sort_order: number;
  active: boolean;
  is_bonus: boolean;
  notification_message: string | null;
  duration_minutes: number;
  bonus_active: boolean;
  bonus_started_at: string | null;
  /** Locatieopdracht: strikt één-op-één gekoppeld aan een locatie-event. */
  is_location: boolean;
  location_event_id: string | null;
  /** Bericht dat na het nakijken (goed- of afkeuring) naar het team gaat i.p.v. de standaardmelding. */
  approval_message: string | null;
}


export interface Answer {
  id: string;
  team_id: string;
  zone_id: string | null;
  challenge_id: string;
  answer: string;
  status: ReviewStatus;
  points_awarded: number;
  creativity_points: number;
  created_at: string;
}

export interface QuizAnswer {
  id: string;
  team_id: string;
  zone_id: string | null;
  challenge_id: string;
  selected_option: string;
  is_correct: boolean | null;
  status: ReviewStatus;
  points_awarded: number;
  creativity_points: number;
  created_at: string;
}

export interface Photo {
  id: string;
  team_id: string;
  zone_id: string | null;
  challenge_id: string;
  photo_url: string;
  storage_path: string | null;
  status: ReviewStatus;
  points_awarded: number;
  creativity_points: number;
  is_group_photo: boolean;
  created_at: string;
}

export interface Score {
  id: string;
  team_id: string;
  points: number;
  regular_points: number;
  bonus_points: number;
  creativity_points: number;
  last_scored_at: string;
}

export interface TeamProgress {
  id: string;
  team_id: string;
  zone_id: string;
  unlocked: boolean;
  unlocked_at: string | null;
  completed: boolean;
  completed_at: string | null;
}

export interface PointAction {
  id: string;
  label: string;
  points: number;
  sort_order: number;
  active: boolean;
}

export interface RankedTeam {
  team: Team;
  points: number;
  regularPoints: number;
  bonusPoints: number;
  creativityPoints: number;
  lastScoredAt: string;
  rank: number;
}

export type NotificationAudience = "all" | "team" | "admin";

export interface AppNotification {
  id: string;
  title: string;
  body: string | null;
  audience: NotificationAudience;
  team_id: string | null;
  kind: string;
  active: boolean;
  created_at: string;
}

export interface NotificationRead {
  id: string;
  notification_id: string;
  reader: string;
  read_at: string;
}

export interface ZoneFirstUnlock {
  id: string;
  zone_id: string;
  team_id: string;
  created_at: string;
}

/* ------------------------------ locatie ------------------------------ */

export interface TeamLocation {
  team_id: string;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  updated_at: string;
}

export type LocationTriggerMode = "every" | "first";
/** Wie krijgt de melding wanneer het event vuurt? */
export type NotificationTarget = "team" | "admin" | "all";

export interface LocationEvent {
  id: string;
  name: string;
  description: string | null;
  latitude: number;
  longitude: number;
  radius_meters: number;
  trigger_mode: LocationTriggerMode;
  notification_target: NotificationTarget;
  notification_message: string | null;
  /** null = geldt in alle zones; anders enkel voor teams die in deze zone bezig zijn. */
  zone_id: string | null;
  active: boolean;
  /** Vaste volgorde binnen de zone (kolomvolgorde in de admin-matrix). */
  order_index: number;
  created_at: string;
}

export interface LocationEventTrigger {
  id: string;
  event_id: string;
  team_id: string;
  is_first: boolean;
  created_at: string;
}

/** Per team: staat de locatieopdracht open, is ze ingezonden of afgewezen? */
export type LocationChallengeStateValue = "open" | "submitted" | "dismissed";

export interface LocationChallengeState {
  id: string;
  team_id: string;
  challenge_id: string;
  state: LocationChallengeStateValue;
  created_at: string;
}

/** Het ene toestel per team dat gps-updates mag versturen. */
export interface TeamTrackingDevice {
  team_id: string;
  device_id: string;
  claimed_at: string;
}

