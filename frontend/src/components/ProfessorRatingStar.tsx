import { Star } from "lucide-react";
import { getProfessorRatingTier, professorRatingTones } from "@/lib/professorRating";

export function ProfessorRatingStar({ rating, className }: { rating: number; className: string }) {
  const tier = getProfessorRatingTier(rating);

  return (
    <Star
      aria-hidden="true"
      data-rating-tier={tier}
      className={`${className} fill-current ${professorRatingTones[tier].icon}`}
    />
  );
}
