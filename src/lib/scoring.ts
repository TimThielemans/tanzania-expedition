import type { RankedTeam } from "./types";

/**
 * ============================================================
 *  TIEBREAKREGELS — hier pas je de rangschikking aan
 * ============================================================
 *
 * Teams worden eerst gerangschikt op TOTAALSCORE (hoog → laag).
 * Bij een gelijke stand worden de regels hieronder in volgorde toegepast:
 * de eerste regel die een verschil oplevert, bepaalt wie voorgaat.
 *
 * Wil je een andere volgorde? Verplaats de regels in de array.
 * Wil je een regel uitschakelen? Zet die in commentaar.
 * Een nieuwe regel voeg je toe als `{ label, compare }` — `compare`
 * geeft een negatief getal als team `a` vóór team `b` komt.
 *
 * Zie ook README → "Tiebreakregels aanpassen".
 */
export interface Tiebreaker {
  label: string;
  compare: (a: RankedTeam, b: RankedTeam) => number;
}

export const TIEBREAKERS: Tiebreaker[] = [
  { label: "Meeste creativiteitspunten", compare: (a, b) => b.creativityPoints - a.creativityPoints },
  { label: "Meeste gewone punten", compare: (a, b) => b.regularPoints - a.regularPoints },
  { label: "Meeste bonuspunten", compare: (a, b) => b.bonusPoints - a.bonusPoints },
  // Altijd als laatste: wie het snelst aan die stand raakte.
  { label: "Snelst aan die stand", compare: (a, b) => a.lastScoredAt.localeCompare(b.lastScoredAt) },
];

/** Sorteert op totaalscore en daarna op de tiebreakregels hierboven. */
export function compareTeams(a: RankedTeam, b: RankedTeam): number {
  if (b.points !== a.points) return b.points - a.points;
  for (const rule of TIEBREAKERS) {
    const result = rule.compare(a, b);
    if (result !== 0) return result;
  }
  return a.team.name.localeCompare(b.team.name);
}
