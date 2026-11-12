import type { Course } from "@/data/sampleCourses";

export const SEARCH_RESULTS_CACHE_KEY = "searchCourseResultsCache:v5";
export const SEARCH_RESULTS_CACHE_TTL_MS = 5 * 60 * 1000;

export type CachedSearch = {
  query: string;
  term: string;
  results: Course[];
  searchState: "success" | "not_found";
  cachedAt?: number;
};

export function readCachedSearch(query: string): CachedSearch | null {
  if (!query) return null;
  try {
    const stored = sessionStorage.getItem(SEARCH_RESULTS_CACHE_KEY);
    const cache = stored ? JSON.parse(stored) as CachedSearch : null;
    return cache?.query === query && typeof cache.term === "string" &&
      Array.isArray(cache.results) &&
      cache.searchState === (cache.results.length ? "success" : "not_found")
      ? cache : null;
  } catch {
    return null;
  }
}

export function isSearchCacheFresh(cache: CachedSearch, now: number): boolean {
  return typeof cache.cachedAt === "number" && now - cache.cachedAt < SEARCH_RESULTS_CACHE_TTL_MS;
}

export function writeCachedSearch(cache: CachedSearch): void {
  sessionStorage.setItem(SEARCH_RESULTS_CACHE_KEY, JSON.stringify(cache));
}
