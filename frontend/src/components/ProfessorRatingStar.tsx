import { Star } from "lucide-react";

export function ProfessorRatingStar({ rating, className }: { rating: number; className: string }) {
  const score = Number(rating.toFixed(1));
  let color = "text-red-600 dark:text-red-400";
  if (score >= 4) color = "text-emerald-600 dark:text-emerald-400";
  else if (score >= 3) color = "text-orange-600 dark:text-orange-400";

  return <Star aria-hidden="true" className={`${className} fill-current ${color}`} />;
}
