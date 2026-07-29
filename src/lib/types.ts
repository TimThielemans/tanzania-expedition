export type ChallengeType = "text_answer" | "numeric_answer" | "photo_upload" | "multiple_choice";
export type UnlockType = "password" | "automatic_after_completion" | "open";

export interface Team {
  id: string;
  name: string;
  password: string;
  color: string | null;
  sort_order: number;
  active: boolean;
  created_at: string;
}

export interface Zone {
  id: string;
  name: string;
  description: string | null;
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
  zone_id: string;
  title: string;
  description: string | null;
  image_url: string | null;
  challenge_type: ChallengeType;
  options: string[];
  correct_answer: string | null;
  points: number;
  sort_order: number;
  active: boolean;
}

export interface Answer {
  id: string;
  team_id: string;
  zone_id: string;
  challenge_id: string;
  answer: string;
  points_awarded: number;
  created_at: string;
}

export interface QuizAnswer {
  id: string;
  team_id: string;
  zone_id: string;
  challenge_id: string;
  selected_option: string;
  is_correct: boolean | null;
  points_awarded: number;
  created_at: string;
}

export interface Photo {
  id: string;
  team_id: string;
  zone_id: string;
  challenge_id: string;
  photo_url: string;
  storage_path: string | null;
  points_awarded: number;
  created_at: string;
}

export interface Score {
  id: string;
  team_id: string;
  points: number;
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
  lastScoredAt: string;
  rank: number;
}
