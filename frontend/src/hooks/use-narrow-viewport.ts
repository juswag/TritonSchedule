import { useEffect, useState } from "react";

/** True below the `xl` breakpoint, where the course sheet overlays the page. */
export function useNarrowViewport(query = "(max-width: 1279px)") {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const media = window.matchMedia(query);
    const update = () => setMatches(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [query]);

  return matches;
}
