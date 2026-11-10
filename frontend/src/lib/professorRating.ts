export type ProfessorRatingTier = "high" | "mid" | "low";

/** Buckets a Rate My Professors score (rounded to one decimal, as displayed). */
export function getProfessorRatingTier(rating: number): ProfessorRatingTier {
  const score = Number(rating.toFixed(1));
  if (score >= 4) return "high";
  if (score >= 3) return "mid";
  return "low";
}

/**
 * Green / yellow / red, chosen so the three tiers stay easy to tell apart at a
 * glance (the old orange and red read as the same color at icon size).
 */
export const professorRatingTones: Record<ProfessorRatingTier, { icon: string; badge: string; text: string }> = {
  high: {
    icon: "text-emerald-500 dark:text-emerald-400",
    badge: "bg-emerald-600 text-white dark:bg-emerald-500 dark:text-emerald-950",
    text: "text-emerald-700 dark:text-emerald-400",
  },
  mid: {
    icon: "text-yellow-400 dark:text-yellow-300",
    badge: "bg-yellow-400 text-yellow-950 dark:bg-yellow-300 dark:text-yellow-950",
    text: "text-yellow-700 dark:text-yellow-300",
  },
  low: {
    icon: "text-rose-600 dark:text-rose-500",
    badge: "bg-rose-600 text-white dark:bg-rose-500 dark:text-rose-950",
    text: "text-rose-700 dark:text-rose-400",
  },
};

export function getProfessorRatingTone(rating: number) {
  return professorRatingTones[getProfessorRatingTier(rating)];
}
