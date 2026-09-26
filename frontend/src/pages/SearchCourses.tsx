import { useState, useMemo, useEffect } from "react";
import {
  AlertTriangle,
  CalendarDays,
  Check,
  ChevronDown,
  Clock3,
  ExternalLink,
  Loader2,
  MapPin,
  Search,
  Star,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useSearchParams } from "react-router-dom";
import { Course, CourseExamSection, DiscussionSection } from "@/data/sampleCourses";
import { useCalendar } from "@/context/CalendarContext";
import { CalendarEvent, Weekday } from "@/types/calendar";
import { getCourseCode } from "@/lib/courseLabels";
import { getCourseExams } from "@/lib/examSchedule";
import { cn } from "@/lib/utils";
import { getProfessorProfileUrl, normalizeProfessorProfileUrl } from "@/lib/professorProfile";
import { findConflictingEvents, hasScheduleConflict } from "@/lib/scheduleConflicts";
import { resolveTssBookingUrl } from "@/lib/tssBooking";
import { toast } from "sonner";

const API_KEY =
  [import.meta.env.VITE_API_KEY, import.meta.env.API_KEY]
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .find((value) => value.length > 0) ?? "";

// Log the missing production configuration during initialization.
if (!import.meta.env.DEV && !API_KEY) {
  console.error("VITE_API_KEY is not set. Set VITE_API_KEY in your environment variables.");
}
const API_BASE = normalizeApiBase(import.meta.env.VITE_API_BASE_URL ?? (import.meta.env.DEV ? "/api" : ""));
const API_BASE_FALLBACK = normalizeApiBase(import.meta.env.VITE_API_BASE_FALLBACK_URL ?? "");

function buildApiUrl(path: string, base = API_BASE): string {
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

function normalizeApiBase(rawBase: string): string {
  const trimmedBase = rawBase.trim().replace(/\/+$/, "");
  if (!trimmedBase) {
    return "";
  }

  if (trimmedBase.startsWith("/")) {
    return trimmedBase;
  }

  try {
    const url = new URL(trimmedBase);
    const pathname = url.pathname.replace(/\/+$/, "");
    if (!pathname) {
      return url.origin;
    }
    return trimmedBase;
  } catch {
    return trimmedBase;
  }
}

async function fetchApi(path: string, init: RequestInit): Promise<Response> {
  const primaryBase = API_BASE.length > 0 ? API_BASE : API_BASE_FALLBACK;

  if (primaryBase.length === 0) {
    throw new Error("Missing API base URL. Set VITE_API_BASE_URL for production deployments.");
  }

  const primaryResponse = await fetch(buildApiUrl(path, primaryBase), init);

  if (
    !shouldTryFallback(primaryResponse) ||
    API_BASE_FALLBACK.length === 0 ||
    API_BASE_FALLBACK === primaryBase ||
    init.signal?.aborted
  ) {
    return primaryResponse;
  }

  return fetch(buildApiUrl(path, API_BASE_FALLBACK), init);
}

function shouldTryFallback(response: Response): boolean {
  if (response.status === 404 || response.status === 502 || response.status === 503 || response.status === 504) {
    return true;
  }

  const contentType = response.headers.get("content-type") ?? "";
  return contentType.includes("text/html");
}

function createApiRequestInit(signal: AbortSignal): RequestInit {
  if (!API_KEY) {
    // Without a key, send no authorization header and let the API reject the request.
    return { signal };
  }

  return {
    signal,
    headers: {
      Authorization: `Bearer ${API_KEY}`,
    },
  };
}

export default function SearchCourses() {
  const SEARCH_RESULTS_CACHE_KEY = "searchCourseResultsCache:v5";
  const [searchParams] = useSearchParams();
  const initialQuery = searchParams.get("q") ?? sessionStorage.getItem("searchCoursesQuery") ?? "";
  const [searchQuery, setSearchQuery] = useState(() =>
    initialQuery
  );
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState(() =>
    initialQuery
  );
  const [coursesFromBackend, setCoursesFromBackend] = useState<Course[]>(() => {
    const stored = sessionStorage.getItem(SEARCH_RESULTS_CACHE_KEY);
    if (!stored) return [];

    try {
      const parsed = JSON.parse(stored) as { results?: Course[] };
      return Array.isArray(parsed.results) ? parsed.results : [];
    } catch {
      return [];
    }
  });
  const [isBackendLoading, setIsBackendLoading] = useState(false);
  const [searchState, setSearchState] = useState<"idle" | "loading" | "success" | "not_found" | "error">(() => {
    const stored = sessionStorage.getItem(SEARCH_RESULTS_CACHE_KEY);
    if (!stored) return "idle";

    try {
      const parsed = JSON.parse(stored) as { searchState?: string };
      return parsed.searchState === "success" || parsed.searchState === "not_found"
        ? parsed.searchState
        : "idle";
    } catch {
      return "idle";
    }
  });
  const [activeTerm, setActiveTerm] = useState<string>("");
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [isMobileDetailsOpen, setIsMobileDetailsOpen] = useState(false);
  const [selectedDiscussionIds, setSelectedDiscussionIds] = useState<Record<string, string>>({});
  const [selectedLabIds, setSelectedLabIds] = useState<Record<string, string>>({});
  const { events, addEvent } = useCalendar();

  useEffect(() => {
    sessionStorage.setItem("searchCoursesQuery", searchQuery);
  }, [searchQuery]);

  useEffect(() => {
    const controller = new AbortController();

    const loadActiveTerm = async () => {
      try {
        const response = await fetchApi("/term", createApiRequestInit(controller.signal));
        if (!response.ok) {
          return;
        }

        const payload = (await response.json()) as {
          Term?: { Term?: string } | string;
        };

        const resolvedTerm =
          typeof payload.Term === "string"
            ? payload.Term
            : payload.Term?.Term;

        if (typeof resolvedTerm === "string") {
          setActiveTerm(resolvedTerm);
        }
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          setActiveTerm("");
        }
      }
    };

    void loadActiveTerm();

    return () => {
      controller.abort();
    };
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 300);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [searchQuery]);

  useEffect(() => {
    const query = debouncedSearchQuery.trim();
    const normalizedTerm = activeTerm.trim();

    if (!query) {
      setCoursesFromBackend([]);
      setSearchState("idle");
      setIsBackendLoading(false);
      return;
    }

    const controller = new AbortController();

    const fetchCourses = async () => {
      setIsBackendLoading(true);
      setSearchState("loading");
      setCoursesFromBackend([]);
      try {
        const backendCourses = await searchBackendCourses(query, controller.signal, activeTerm);
        const mappedCourses = backendCourses.map(mapBackendCourseToCourse);
        setCoursesFromBackend(mappedCourses);
        const resolvedSearchState = mappedCourses.length > 0 ? "success" : "not_found";
        setSearchState(resolvedSearchState);
        sessionStorage.setItem(
          SEARCH_RESULTS_CACHE_KEY,
          JSON.stringify({
            query,
            term: normalizedTerm,
            results: mappedCourses,
            searchState: resolvedSearchState,
          })
        );
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          setCoursesFromBackend([]);
          setSearchState("error");
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsBackendLoading(false);
        }
      }
    };

    void fetchCourses();

    return () => {
      controller.abort();
    };
  }, [debouncedSearchQuery, activeTerm]);

  const displayedCourses = coursesFromBackend;
  const isDebouncingSearch =
    searchQuery.trim().length > 0 &&
    searchQuery.trim() !== debouncedSearchQuery.trim();

  const addedCourseIds = useMemo(() => {
    return new Set(
      events
        .filter((e) => e.isCourse)
        .map((e) => e.courseId || e.id)
    );
  }, [events]);

  const selectedCourse = useMemo(
    () => displayedCourses.find((course) => course.id === selectedCourseId) ?? displayedCourses[0] ?? null,
    [displayedCourses, selectedCourseId]
  );

  const scheduledEvents = useMemo(
    () => events.filter((event) => !selectedCourse || event.courseId !== selectedCourse.id),
    [events, selectedCourse]
  );

  const candidateLectureEvents = useMemo(
    () => selectedCourse ? courseScheduleToEvents(selectedCourse, generateCalendarColor(selectedCourse.id)) : [],
    [selectedCourse]
  );

  const availableDiscussionSections = useMemo(
    () => filterConflictFreeSections(
      selectedCourse,
      selectedCourse?.discussionSections,
      [...scheduledEvents, ...candidateLectureEvents],
      "Discussion"
    ),
    [selectedCourse, scheduledEvents, candidateLectureEvents]
  );

  const selectedDiscussion = useMemo(
    () => resolveSelectedSection(selectedCourse?.id, selectedDiscussionIds, availableDiscussionSections),
    [selectedCourse, selectedDiscussionIds, availableDiscussionSections]
  );

  const candidateDiscussionEvents = useMemo(
    () => selectedCourse && selectedDiscussion
      ? sectionScheduleToEvents(
          selectedCourse,
          selectedDiscussion,
          "Discussion",
          generateCalendarColor(selectedCourse.id)
        )
      : [],
    [selectedCourse, selectedDiscussion]
  );

  const availableLabSections = useMemo(
    () => filterConflictFreeSections(
      selectedCourse,
      selectedCourse?.labSections,
      [...scheduledEvents, ...candidateLectureEvents, ...candidateDiscussionEvents],
      "Lab"
    ),
    [selectedCourse, scheduledEvents, candidateLectureEvents, candidateDiscussionEvents]
  );

  const selectedLab = useMemo(
    () => resolveSelectedSection(selectedCourse?.id, selectedLabIds, availableLabSections),
    [selectedCourse, selectedLabIds, availableLabSections]
  );

  const selectedTssUrl = useMemo(
    () => selectedCourse
      ? resolveTssBookingUrl(selectedCourse, selectedDiscussion, selectedLab)
      : undefined,
    [selectedCourse, selectedDiscussion, selectedLab]
  );

  const candidateLabEvents = useMemo(
    () => selectedCourse && selectedLab
      ? sectionScheduleToEvents(
          selectedCourse,
          selectedLab,
          "Lab",
          generateCalendarColor(selectedCourse.id)
        )
      : [],
    [selectedCourse, selectedLab]
  );

  const candidateScheduleEvents = useMemo(
    () => [...candidateLectureEvents, ...candidateDiscussionEvents, ...candidateLabEvents],
    [candidateLectureEvents, candidateDiscussionEvents, candidateLabEvents]
  );

  const conflictingScheduledEvents = useMemo(
    () => findConflictingEvents(candidateScheduleEvents, scheduledEvents),
    [candidateScheduleEvents, scheduledEvents]
  );

  const conflictingCandidateEventIds = useMemo(
    () => new Set(
      candidateScheduleEvents
        .filter((candidateEvent) => hasScheduleConflict([candidateEvent], scheduledEvents))
        .map((candidateEvent) => candidateEvent.id)
    ),
    [candidateScheduleEvents, scheduledEvents]
  );

  const handleAddToCalendar = (
    course: Course,
    selectedDiscussion?: DiscussionSection,
    selectedLab?: DiscussionSection
  ) => {
    const calendarColor = generateCalendarColor(course.id);
    const eventsToAdd = [
      ...courseScheduleToEvents(course, calendarColor),
      ...(selectedDiscussion
        ? sectionScheduleToEvents(course, selectedDiscussion, "Discussion", calendarColor)
        : []),
      ...(selectedLab ? sectionScheduleToEvents(course, selectedLab, "Lab", calendarColor) : []),
    ];
    const otherScheduledEvents = events.filter((event) => event.courseId !== course.id);

    if (eventsToAdd.length === 0) {
      toast.error("Could not parse this course schedule for calendar placement.");
      return;
    }

    if (hasScheduleConflict(eventsToAdd, otherScheduledEvents)) {
      toast.error("This selection conflicts with your existing schedule.");
      return;
    }

    const exams = getCourseExams(course, selectedDiscussion, selectedLab);
    eventsToAdd.forEach((event) => addEvent({ ...event, courseTitle: course.name, exams }));

    const selectedSections = [selectedDiscussion?.name, selectedLab?.name].filter(
      (name): name is string => Boolean(name)
    );
    const sectionInfo = selectedSections.length > 0 ? ` (${selectedSections.join(", ")})` : "";
    toast.success(`${course.name}${sectionInfo} added to your calendar!`);
  };

  const setSelectedDiscussionForCourse = (courseId: string, discussionId: string) => {
    setSelectedDiscussionIds((previous) => ({
      ...previous,
      [courseId]: discussionId,
    }));
  };

  const setSelectedLabForCourse = (courseId: string, labId: string) => {
    setSelectedLabIds((previous) => ({
      ...previous,
      [courseId]: labId,
    }));
  };

  return (
    <div className="min-h-[calc(100vh-72px)] bg-white">
      <div className="grid min-h-[calc(100vh-72px)] xl:grid-cols-[minmax(0,1.55fr)_minmax(390px,0.95fr)]">
        <section className="min-w-0 px-4 pb-8 pt-9 sm:px-8 xl:border-r xl:border-border">
          <div className="mx-auto w-full max-w-[880px]">
            <div className="relative mb-6 pr-0 sm:pr-28">
              <h1 className="text-[42px] font-extrabold leading-none tracking-[-0.05em] text-black sm:text-[52px]">
                Find your{" "}
                <span className="inline-block rounded-xl bg-[#eaf2ff] px-2.5 pb-1.5 pt-1">
                  classes.
                </span>
              </h1>
              <p className="mt-4 text-base text-slate-600 sm:text-lg">
                Search the catalog and build a conflict-free quarter.
              </p>
              <img
                src="/illustrations/trident-doodle.png"
                alt=""
                className="pointer-events-none absolute right-3 top-[-24px] hidden h-28 w-28 select-none object-contain mix-blend-multiply sm:block"
              />
            </div>

            <div className="relative">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
              <Input
                aria-label="Search courses"
                placeholder="Course, instructor, or keyword"
                value={searchQuery}
                onChange={(event) => {
                  setSearchQuery(event.target.value);
                  setIsMobileDetailsOpen(false);
                }}
                className="h-16 rounded-lg border-border bg-white pl-12 pr-12 text-base shadow-none placeholder:text-muted-foreground/80 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/15"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery("");
                    setIsMobileDetailsOpen(false);
                  }}
                  className="absolute right-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  aria-label="Clear search"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            <div className="mt-6 flex min-h-7 items-center justify-between gap-3">
              {(isBackendLoading || isDebouncingSearch || searchQuery.trim()) && (
                <p className="text-sm font-semibold text-foreground">
                  {isBackendLoading || isDebouncingSearch
                    ? "Searching"
                    : displayedCourses.length > 0
                      ? `${displayedCourses.length} section${displayedCourses.length === 1 ? "" : "s"}`
                      : "No results"}
                </p>
              )}
              {activeTerm && <p className="ml-auto text-xs font-medium text-muted-foreground">{formatTerm(activeTerm)}</p>}
            </div>

            <div className="mt-4 overflow-hidden border-y border-border">
              {displayedCourses.length > 0 && !isBackendLoading && !isDebouncingSearch && (
                <div className="hidden grid-cols-[1.25fr_1.15fr_1.15fr_.65fr] gap-5 border-b border-border px-5 py-4 text-xs font-medium text-muted-foreground md:grid">
                  <span>Class</span>
                  <span>Instructor</span>
                  <span>Meeting</span>
                  <span>Location</span>
                </div>
              )}

              {isBackendLoading || isDebouncingSearch ? (
                <div className="flex min-h-40 items-center justify-center gap-3 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Searching
                </div>
              ) : searchState === "error" ? (
                <SearchState
                  title="Search unavailable"
                  description="Try again shortly."
                />
              ) : searchQuery.trim().length === 0 ? (
                <SearchState title="Search courses" />
              ) : displayedCourses.length === 0 ? (
                <SearchState
                  title="No results"
                  description="Try another search."
                />
              ) : (
                <div className="divide-y divide-border">
                  {displayedCourses.map((course) => {
                    const isSelected = selectedCourse?.id === course.id;
                    const meetingGroups = getCourseScheduleParts(course);
                    return (
                      <div
                        key={course.id}
                        className={cn(
                          "group relative grid min-h-[108px] w-full gap-3 px-5 py-5 text-left md:grid-cols-[1.25fr_1.15fr_1.15fr_.65fr] md:items-center md:gap-5",
                          isSelected && "bg-primary/[0.055] before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-primary"
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedCourseId(course.id);
                            setIsMobileDetailsOpen(true);
                          }}
                          className="absolute inset-0 z-0 w-full cursor-pointer transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/30"
                          aria-label={`Select ${course.name} with ${course.instructor}`}
                          aria-pressed={isSelected}
                        />
                        <span className="pointer-events-none relative z-[1] grid min-w-0 grid-rows-[1.75rem_1.25rem] content-center gap-2">
                          <span className="flex items-center truncate text-sm font-semibold text-foreground">
                            {getCourseCode(course.name)}
                          </span>
                          <span className="flex items-center truncate text-xs text-foreground/70">
                            {getCourseTitle(course.name)}
                          </span>
                        </span>
                        <span className="pointer-events-none relative z-[1] grid min-w-0 grid-rows-[1.75rem_1.25rem] content-center gap-2 text-sm text-foreground/80">
                          <span className="flex items-center truncate">{course.instructor}</span>
                          <a
                            href={getProfessorProfileUrl(course.rmpProfileUrl, course.instructor)}
                            target="_blank"
                            rel="noreferrer"
                            className="pointer-events-auto inline-flex h-5 w-fit items-center gap-1.5 rounded-sm text-xs transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25"
                            aria-label={`View ${course.instructor} on Rate My Professors`}
                          >
                            {course.rmpRating && (
                              <>
                                <Star className="h-3.5 w-3.5 fill-emerald-600 text-emerald-600" aria-hidden="true" />
                                <span>{course.rmpRating.toFixed(1)}</span>
                                <span className="text-muted-foreground" aria-hidden="true">·</span>
                              </>
                            )}
                            <span className="font-medium text-primary">View on RMP</span>
                            <ExternalLink className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                          </a>
                        </span>
                        <span className="pointer-events-none relative z-[1] flex flex-col justify-center gap-2 text-sm text-foreground/80">
                          {meetingGroups.map(({ days, time }, meetingIndex) => (
                            <span
                              key={`${days.join("-")}-${time}-${meetingIndex}`}
                              className="grid grid-rows-[1.75rem_1.25rem] gap-2"
                            >
                              <span className="flex flex-wrap items-center gap-1.5">
                                {days.map((day) => (
                                  <span
                                    key={day}
                                    className="rounded-md bg-primary/[0.09] px-2 py-1 font-medium text-primary"
                                  >
                                    {day}
                                  </span>
                                ))}
                              </span>
                              <span className="flex items-center">{time}</span>
                            </span>
                          ))}
                        </span>
                        <span className="pointer-events-none relative z-[1] truncate text-sm text-foreground/80">
                          {course.lectureLocation || "TBA"}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

          </div>
        </section>

        <aside
          className={cn(
            "min-w-0 overflow-hidden bg-[#fefefe] px-5 py-7 sm:px-7 lg:px-8",
            isMobileDetailsOpen
              ? "fixed inset-x-0 bottom-0 top-[72px] z-40 xl:sticky xl:top-[72px] xl:z-auto xl:block xl:h-[calc(100vh-72px)] xl:self-start"
              : "hidden xl:sticky xl:top-[72px] xl:block xl:h-[calc(100vh-72px)] xl:self-start"
          )}
          aria-label="Selected course details"
        >
          {selectedCourse ? (
            <div className="relative mx-auto flex h-full min-h-0 w-full max-w-[520px] flex-col">
              <button
                type="button"
                onClick={() => setIsMobileDetailsOpen(false)}
                className="absolute right-0 top-0 flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground xl:hidden"
                aria-label="Close course details"
              >
                <X className="h-5 w-5" />
              </button>
              <div className="min-h-0 flex-1 overflow-y-auto pb-5">
                <div>
                  <p className="pr-12 text-sm font-semibold text-primary">
                    {getCourseCode(selectedCourse.name)}
                  </p>
                  <h2 className="mt-1 text-2xl font-semibold tracking-[-0.025em] text-foreground">
                    {getCourseTitle(selectedCourse.name)}
                  </h2>
                </div>

                <dl className="mt-6 space-y-3.5 border-b border-border pb-6 text-sm">
                  <DetailRow icon={UserRound} label="Instructor" value={selectedCourse.instructor} />
                  <DetailRow icon={Clock3} label="Time" value={formatCourseScheduleDisplay(selectedCourse)} />
                  <DetailRow icon={MapPin} label="Location" value={formatCourseLocations(selectedCourse)} />
                  <DetailRow icon={UsersRound} label="Enrollment" value="Not listed" />
                </dl>

                <section className="border-b border-border py-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h2 className="text-sm font-semibold text-foreground">Rate My Professor</h2>
                      {selectedCourse.rmpRating ? (
                        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                          <span className="rounded bg-emerald-600 px-2 py-1 font-semibold text-white">
                            {selectedCourse.rmpRating.toFixed(1)}
                          </span>
                          <span className="font-medium text-emerald-700">
                            {ratingLabel(selectedCourse.rmpRating)}
                          </span>
                          {selectedCourse.rmpTakeAgain !== undefined && (
                            <span className="text-muted-foreground">· {Math.round(selectedCourse.rmpTakeAgain)}% would take again</span>
                          )}
                        </div>
                      ) : (
                        <p className="mt-2 text-sm text-muted-foreground">No professor rating available.</p>
                      )}
                    </div>
                    <a
                      href={getProfessorProfileUrl(selectedCourse.rmpProfileUrl, selectedCourse.instructor)}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      aria-label="Open Rate My Professors"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </div>
                </section>

                <section className="border-b border-border py-5">
                  <SectionPicker
                    label="Discussion"
                    sections={availableDiscussionSections}
                    totalCount={selectedCourse.discussionSections?.length ?? 0}
                    selectedId={selectedDiscussion?.id}
                    onChange={(sectionId) => setSelectedDiscussionForCourse(selectedCourse.id, sectionId)}
                  />
                  {selectedCourse.labSections && selectedCourse.labSections.length > 0 && (
                    <div className="mt-4">
                      <SectionPicker
                        label="Lab"
                        sections={availableLabSections}
                        totalCount={selectedCourse.labSections.length}
                        selectedId={selectedLab?.id}
                        onChange={(sectionId) => setSelectedLabForCourse(selectedCourse.id, sectionId)}
                      />
                    </div>
                  )}
                </section>

                <section className="py-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <CalendarDays className="h-4 w-4 text-muted-foreground" />
                      <h2 className="text-sm font-semibold text-foreground">Weekly schedule preview</h2>
                    </div>
                    <span
                      className={cn(
                        "text-xs font-medium",
                        conflictingScheduledEvents.length > 0 ? "text-rose-700" : "text-emerald-700"
                      )}
                    >
                      {conflictingScheduledEvents.length > 0
                        ? `${conflictingScheduledEvents.length} ${conflictingScheduledEvents.length === 1 ? "conflict" : "conflicts"}`
                        : "No conflicts"}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">Current schedule + this selection</p>
                  {conflictingScheduledEvents.length > 0 && (
                    <div className="mt-3 flex gap-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs leading-5 text-rose-800">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                      <p>{formatConflictMessage(conflictingScheduledEvents)}</p>
                    </div>
                  )}
                  <CourseSchedulePreview
                    existingEvents={scheduledEvents}
                    candidateEvents={candidateScheduleEvents}
                    conflictingCandidateEventIds={conflictingCandidateEventIds}
                  />
                </section>
              </div>

              <div className="-mx-5 shrink-0 border-t border-border bg-[#fefefe] px-5 pb-6 pt-4 sm:-mx-7 sm:px-7 lg:-mx-8 lg:px-8 xl:mx-0 xl:px-0 xl:pb-0">
                <div className="grid gap-2 sm:grid-cols-2">
                  {selectedTssUrl ? (
                    <a
                      href={selectedTssUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex h-12 items-center justify-center gap-2 rounded-md border border-border bg-white px-5 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
                    >
                      <ExternalLink className="h-4 w-4" />
                      Open in TSS
                    </a>
                  ) : (
                    <button
                      type="button"
                      disabled
                      className="inline-flex h-12 items-center justify-center gap-2 rounded-md border border-border bg-muted px-5 text-sm font-semibold text-muted-foreground"
                    >
                      <ExternalLink className="h-4 w-4" />
                      TSS link unavailable
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={
                      addedCourseIds.has(selectedCourse.id) ||
                      conflictingScheduledEvents.length > 0 ||
                      candidateScheduleEvents.length === 0
                    }
                    onClick={() =>
                      handleAddToCalendar(
                        selectedCourse,
                        selectedDiscussion,
                        selectedLab
                      )
                    }
                    className="h-12 w-full rounded-md bg-primary px-5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
                  >
                    {addedCourseIds.has(selectedCourse.id)
                      ? "Added to schedule"
                      : conflictingScheduledEvents.length > 0
                        ? "Resolve schedule conflict"
                        : "Add section"}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="mx-auto flex min-h-[420px] max-w-sm flex-col items-center justify-center text-center">
              <CalendarDays className="h-6 w-6 text-muted-foreground" />
              <h2 className="mt-4 text-base font-semibold text-foreground">Choose a section</h2>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function SearchState({ title, description }: { title: string; description?: string }) {
  return (
    <div className="flex min-h-44 flex-col items-center justify-center px-6 text-center">
      <Search className="h-5 w-5 text-muted-foreground" />
      <p className="mt-3 text-sm font-semibold text-foreground">{title}</p>
      {description && (
        <p className="mt-1 max-w-sm text-sm leading-6 text-muted-foreground">{description}</p>
      )}
    </div>
  );
}

function DetailRow({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof UserRound;
  label: string;
  value: string;
}) {
  return (
    <div className="grid grid-cols-[20px_96px_minmax(0,1fr)] items-start gap-3">
      <Icon className="mt-0.5 h-4 w-4 text-muted-foreground" />
      <dt className="font-medium text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-foreground/80">{value}</dd>
    </div>
  );
}

function SectionPicker({
  label,
  sections,
  totalCount = sections?.length ?? 0,
  selectedId,
  onChange,
}: {
  label: string;
  sections?: DiscussionSection[];
  totalCount?: number;
  selectedId?: string;
  onChange: (sectionId: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const hiddenCount = Math.max(totalCount - (sections?.length ?? 0), 0);
  const selectedSection = sections?.find((section) => section.id === selectedId) ?? sections?.[0];

  return (
    <div>
      <label className="text-sm font-semibold text-foreground" htmlFor={`${label.toLowerCase()}-section`}>
        {label}
      </label>
      {sections && sections.length > 0 && selectedSection ? (
        <Popover open={isOpen} onOpenChange={setIsOpen}>
          <PopoverTrigger asChild>
            <button
              id={`${label.toLowerCase()}-section`}
              type="button"
              role="combobox"
              aria-expanded={isOpen}
              aria-label={`Choose ${label.toLowerCase()} section`}
              className="mt-2 flex min-h-16 w-full items-center gap-3 rounded-md border border-border bg-white px-3.5 py-2.5 text-left outline-none transition-colors hover:border-slate-300 hover:bg-slate-50/60 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/15"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-foreground">{selectedSection.name}</span>
                <span className="mt-1 flex min-w-0 items-center gap-3 text-xs text-muted-foreground">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <Clock3 className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{formatScheduleDisplay(selectedSection.time)}</span>
                  </span>
                  <span className="flex min-w-0 items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{selectedSection.location}</span>
                  </span>
                </span>
              </span>
              <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", isOpen && "rotate-180")} />
            </button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            sideOffset={6}
            className="w-[var(--radix-popover-trigger-width)] rounded-md border-border bg-white p-1.5 shadow-[0_12px_30px_rgba(15,23,42,0.12)]"
          >
            <div role="listbox" aria-label={`${label} sections`} className="max-h-72 space-y-1 overflow-y-auto">
              {sections.map((section) => {
                const isSelected = section.id === selectedSection.id;
                return (
                  <button
                    key={section.id}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => {
                      onChange(section.id);
                      setIsOpen(false);
                    }}
                    className={cn(
                      "flex w-full items-start gap-3 rounded-md px-3 py-2.5 text-left outline-none transition-colors hover:bg-muted focus-visible:bg-muted",
                      isSelected && "bg-primary/[0.055]"
                    )}
                  >
                    <span className="min-w-0 flex-1">
                      <span className={cn("block text-sm font-semibold", isSelected ? "text-primary" : "text-foreground")}>{section.name}</span>
                      <span className="mt-1 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
                        <span className="flex min-w-0 items-center gap-1.5">
                          <Clock3 className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">{formatScheduleDisplay(section.time)}</span>
                        </span>
                        <span className="flex min-w-0 items-center gap-1.5">
                          <MapPin className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">{section.location}</span>
                        </span>
                      </span>
                    </span>
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center">
                      {isSelected && <Check className="h-4 w-4 text-primary" />}
                    </span>
                  </button>
                );
              })}
            </div>
          </PopoverContent>
        </Popover>
      ) : totalCount > 0 ? (
        <div className="mt-2 flex gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>No conflict-free {label.toLowerCase()} sections are available.</span>
        </div>
      ) : (
        <p className="mt-2 rounded-md border border-border bg-white px-3 py-3 text-sm text-muted-foreground">
          No {label.toLowerCase()} required
        </p>
      )}
      {hiddenCount > 0 && sections && sections.length > 0 && (
        <p className="mt-2 text-xs text-muted-foreground">
          {hiddenCount} conflicting {label.toLowerCase()} section{hiddenCount === 1 ? "" : "s"} hidden
        </p>
      )}
    </div>
  );
}

const PREVIEW_DAYS: Weekday[] = ["Mon", "Tue", "Wed", "Thu", "Fri"];

function CourseSchedulePreview({
  existingEvents,
  candidateEvents,
  conflictingCandidateEventIds,
}: {
  existingEvents: CalendarEvent[];
  candidateEvents: CalendarEvent[];
  conflictingCandidateEventIds: Set<string>;
}) {
  const allEvents = [...existingEvents, ...candidateEvents];
  const { startMinutes, endMinutes, hours } = getPreviewRange(allEvents);

  const items = [
    ...existingEvents.map((event) => ({
      event,
      label: getPreviewLabel(event),
      tone: "existing",
      conflicting: hasScheduleConflict(candidateEvents, [event]),
    })),
    ...candidateEvents.map((event) => ({
      event,
      label: getPreviewLabel(event),
      tone: event.eventType === "Lecture" ? "lecture" : "section",
      conflicting: conflictingCandidateEventIds.has(event.id),
    })),
  ];

  return (
    <div className="mt-4 overflow-hidden rounded-md border border-border bg-white">
      <div className="grid grid-cols-[38px_repeat(5,minmax(0,1fr))] border-b border-border bg-muted/35">
        <div />
        {PREVIEW_DAYS.map((day) => (
          <div key={day} className="border-l border-border px-1 py-2 text-center text-[10px] font-semibold text-muted-foreground">
            {day}
          </div>
        ))}
      </div>
      <div className="relative grid h-64 grid-cols-[38px_repeat(5,minmax(0,1fr))]">
        <div className="relative">
          {hours.map((hour) => (
            <span
              key={hour}
              className="absolute right-1.5 -translate-y-1/2 text-[9px] font-medium text-muted-foreground"
              style={{ top: `${((hour * 60 - startMinutes) / (endMinutes - startMinutes)) * 100}%` }}
            >
              {hour > 12 ? `${hour - 12} PM` : hour === 12 ? "12 PM" : `${hour} AM`}
            </span>
          ))}
        </div>
        {PREVIEW_DAYS.map((day) => (
          <div key={day} className="relative border-l border-border">
            {hours.map((hour) => (
              <div
                key={hour}
                className="absolute inset-x-0 border-t border-border/70"
                style={{ top: `${((hour * 60 - startMinutes) / (endMinutes - startMinutes)) * 100}%` }}
              />
            ))}
            {items
              .filter(({ event }) => event.dayOfWeek === day)
              .map(({ event, label, tone, conflicting }) => (
                <PreviewBlock
                  key={event.id}
                  label={label}
                  startTime={event.startTime}
                  endTime={event.endTime}
                  tone={tone}
                  conflicting={conflicting}
                  startMinutes={startMinutes}
                  endMinutes={endMinutes}
                />
              ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function PreviewBlock({
  label,
  startTime,
  endTime,
  tone,
  conflicting,
  startMinutes,
  endMinutes,
}: {
  label: string;
  startTime: string;
  endTime: string;
  tone: string;
  conflicting: boolean;
  startMinutes: number;
  endMinutes: number;
}) {
  const start = timeToMinutes(startTime);
  const end = timeToMinutes(endTime);
  const visibleStart = Math.max(start, startMinutes);
  const visibleEnd = Math.min(end, endMinutes);

  if (visibleEnd <= visibleStart) {
    return null;
  }

  const top = ((visibleStart - startMinutes) / (endMinutes - startMinutes)) * 100;
  const height = Math.max(((visibleEnd - visibleStart) / (endMinutes - startMinutes)) * 100, 7);

  return (
    <div
      className={cn(
        "absolute z-10 overflow-hidden rounded-[4px] border px-1 py-1 text-[9px] font-semibold leading-tight",
        conflicting && tone === "existing" && "left-1 right-[51%] border-rose-300 bg-rose-50 text-rose-700",
        conflicting && tone !== "existing" && "left-[51%] right-1 border-rose-500 bg-rose-100 text-rose-800",
        !conflicting && "inset-x-1",
        !conflicting && tone === "lecture" && "border-primary bg-primary text-primary-foreground",
        !conflicting && tone === "section" && "border-sky-300 bg-sky-50 text-sky-700",
        !conflicting && tone === "existing" && "border-slate-300 bg-slate-100 text-slate-600"
      )}
      style={{ top: `${Math.max(top, 0)}%`, height: `${Math.min(height, 100 - Math.max(top, 0))}%` }}
      title={`${label}, ${formatClockTime(startTime)}-${formatClockTime(endTime)}${conflicting ? ", conflict" : ""}`}
    >
      <span className="block truncate">{label}</span>
      <span className="mt-0.5 block truncate font-normal opacity-85">{formatClockTime(startTime)}</span>
    </div>
  );
}

function resolveSelectedSection(
  courseId: string | undefined,
  selections: Record<string, string>,
  availableSections: DiscussionSection[]
): DiscussionSection | undefined {
  if (!courseId) {
    return undefined;
  }

  const selectedId = selections[courseId];
  return availableSections.find((section) => section.id === selectedId) ?? availableSections[0];
}

function filterConflictFreeSections(
  course: Course | null,
  sections: DiscussionSection[] | undefined,
  scheduledEvents: CalendarEvent[],
  eventType: "Discussion" | "Lab"
): DiscussionSection[] {
  if (!course || !sections) {
    return [];
  }

  const color = generateCalendarColor(course.id);
  return sections.filter((section) => {
    const sectionEvents = sectionScheduleToEvents(course, section, eventType, color);
    return sectionEvents.length > 0 && !hasScheduleConflict(sectionEvents, scheduledEvents);
  });
}

function courseScheduleToEvents(course: Course, color: string): CalendarEvent[] {
  const meetings = course.lectureMeetings?.length
    ? course.lectureMeetings
    : [{ id: "primary", name: "Lecture", time: course.schedule, location: course.lectureLocation ?? "TBA" }];

  return meetings.flatMap((meeting) => {
    const schedule = parseCourseSchedule(meeting.time);
    if (!schedule || schedule.days.length === 0) {
      return [];
    }

    return schedule.days.map((day) => ({
      id: `${course.id}-lecture-${meeting.id}-${day}`,
      title: course.name,
      dayOfWeek: day,
      startTime: schedule.startTime,
      endTime: schedule.endTime,
      color,
      isCourse: true,
      courseId: course.id,
      eventType: "Lecture",
      location: meeting.location?.trim() || "TBA",
    }));
  });
}

function sectionScheduleToEvents(
  course: Course,
  section: DiscussionSection,
  eventType: "Discussion" | "Lab",
  color: string
): CalendarEvent[] {
  const schedule = parseCourseSchedule(section.time);
  if (!schedule || schedule.days.length === 0) {
    return [];
  }

  return schedule.days.map((day) => ({
    id: `${course.id}-${section.id}-${day}`,
    title: `${course.name} (${section.name})`,
    dayOfWeek: day,
    startTime: schedule.startTime,
    endTime: schedule.endTime,
    color,
    isCourse: true,
    courseId: course.id,
    eventType,
    location: section.location?.trim() || "TBA",
  }));
}

function getPreviewLabel(event: CalendarEvent): string {
  const sectionName = event.title.match(/\(([^)]+)\)/)?.[1];
  return sectionName ?? getCourseCode(event.title);
}

function getPreviewRange(events: CalendarEvent[]): {
  startMinutes: number;
  endMinutes: number;
  hours: number[];
} {
  if (events.length === 0) {
    return { startMinutes: 8 * 60, endMinutes: 18 * 60, hours: [9, 11, 13, 15, 17] };
  }

  const starts = events.map((event) => timeToMinutes(event.startTime));
  const ends = events.map((event) => timeToMinutes(event.endTime));
  let startMinutes = Math.max(Math.floor(Math.min(...starts) / 60) * 60 - 60, 0);
  let endMinutes = Math.min(Math.ceil(Math.max(...ends) / 60) * 60 + 60, 24 * 60);

  if (endMinutes - startMinutes < 6 * 60) {
    const midpoint = (startMinutes + endMinutes) / 2;
    startMinutes = Math.max(Math.floor((midpoint - 3 * 60) / 60) * 60, 0);
    endMinutes = Math.min(startMinutes + 6 * 60, 24 * 60);
    startMinutes = Math.max(endMinutes - 6 * 60, 0);
  }

  const firstHour = Math.floor(startMinutes / 60) + 1;
  const hours: number[] = [];
  for (let hour = firstHour; hour * 60 < endMinutes; hour += 2) {
    hours.push(hour);
  }

  return { startMinutes, endMinutes, hours };
}

function formatConflictMessage(conflicts: CalendarEvent[]): string {
  const dayOrder: Weekday[] = ["Mon", "Tue", "Wed", "Thu", "Fri"];
  const uniqueConflicts = Array.from(new Map(conflicts.map((event) => [event.id, event])).values())
    .sort((first, second) => {
      const dayDifference = dayOrder.indexOf(first.dayOfWeek) - dayOrder.indexOf(second.dayOfWeek);
      return dayDifference || timeToMinutes(first.startTime) - timeToMinutes(second.startTime);
    });
  const details = uniqueConflicts.slice(0, 2).map((event) =>
    `${getCourseCode(event.title)} on ${event.dayOfWeek} ${formatClockTime(event.startTime)}-${formatClockTime(event.endTime)}`
  );
  const remainingCount = uniqueConflicts.length - details.length;
  const remaining = remainingCount > 0 ? ` and ${remainingCount} more` : "";
  return `Conflicts with ${details.join(" and ")}${remaining}.`;
}

function convertTo24Hour(time: string): string {
  const match = time.trim().match(/^(\d{1,2}):(\d{2})\s*([AaPp][Mm]?|[AaPp])?$/);

  if (!match) {
    return "09:00";
  }

  const [, rawHours, rawMinutes, rawPeriod] = match;
  const period = rawPeriod
    ? rawPeriod.toUpperCase().startsWith("P")
      ? "PM"
      : "AM"
    : null;
  const minutes = Number(rawMinutes);
  const parsedHours = Number(rawHours);
  let hours = parsedHours;

  if (period === "PM" && hours !== 12) {
    hours += 12;
  } else if (period === "AM" && hours === 12) {
    hours = 0;
  }

  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
}

function parseCourseSchedule(schedule: string): { days: Weekday[]; startTime: string; endTime: string } | null {
  const days = extractWeekdays(schedule);
  const timeRange = extractTimeRange(schedule);

  if (!timeRange) {
    return null;
  }

  return {
    days,
    startTime: timeRange.start,
    endTime: timeRange.end,
  };
}

function extractTimeRange(schedule: string): { start: string; end: string } | null {
  const match = schedule.match(
    /(\d{1,2}:\d{2})\s*([AaPp][Mm]?|[AaPp])?\s*-\s*(\d{1,2}:\d{2})\s*([AaPp][Mm]?|[AaPp])?/i
  );

  if (!match) {
    return null;
  }

  const [, startBase, startPeriodRaw, endBase, endPeriodRaw] = match;
  const inferredPeriod = endPeriodRaw ?? startPeriodRaw;
  const startPeriod = startPeriodRaw ?? inferredPeriod;
  const endPeriod = endPeriodRaw ?? startPeriodRaw;

  if (!startPeriod || !endPeriod) {
    return null;
  }

  return {
    start: convertTo24Hour(`${startBase} ${startPeriod}`),
    end: convertTo24Hour(`${endBase} ${endPeriod}`),
  };
}

function extractWeekdays(schedule: string): Weekday[] {
  if (/\b(TBA|TBD|ARRANGED|ARR)\b/i.test(schedule)) {
    return [];
  }

  const normalized = schedule
    .replace(/Monday/gi, "Mon")
    .replace(/Tuesday/gi, "Tue")
    .replace(/Wednesday/gi, "Wed")
    .replace(/Thursday/gi, "Thu")
    .replace(/Friday/gi, "Fri");

  const directMatches = normalized.match(/Mon|Tue|Wed|Thu|Fri/gi) ?? [];
  const mapped = directMatches
    .map((value) => toWeekday(value))
    .filter((value): value is Weekday => Boolean(value));

  if (mapped.length > 0) {
    return Array.from(new Set(mapped));
  }

  const compact = normalized.replace(/[^A-Za-z]/g, "");
  const compactDays: Weekday[] = [];

  for (let i = 0; i < compact.length; ) {
    const pair = compact.slice(i, i + 2).toLowerCase();
    if (pair === "th") {
      compactDays.push("Thu");
      i += 2;
      continue;
    }
    if (pair === "tu") {
      compactDays.push("Tue");
      i += 2;
      continue;
    }

    const current = compact[i].toLowerCase();
    if (current === "m") compactDays.push("Mon");
    if (current === "w") compactDays.push("Wed");
    if (current === "f") compactDays.push("Fri");
    if (current === "t") compactDays.push("Tue");

    i += 1;
  }

  return Array.from(new Set(compactDays));
}

function toWeekday(value: string): Weekday | null {
  const normalized = value.slice(0, 3).toLowerCase();
  if (normalized === "mon") return "Mon";
  if (normalized === "tue") return "Tue";
  if (normalized === "wed") return "Wed";
  if (normalized === "thu") return "Thu";
  if (normalized === "fri") return "Fri";
  return null;
}

function formatScheduleDisplay(schedule: string): string {
  const parsed = parseCourseSchedule(schedule);
  if (!parsed || parsed.days.length === 0) {
    return "Days and time TBA";
  }

  return `${sortWeekdays(parsed.days).join(", ")} - ${formatClockTime(parsed.startTime)}-${formatClockTime(parsed.endTime)}`;
}

function getScheduleParts(schedule: string): { days: string[]; time: string } {
  const parsed = parseCourseSchedule(schedule);
  if (!parsed || parsed.days.length === 0) {
    return { days: [schedule.trim() || "TBA"], time: "Time TBA" };
  }

  return {
    days: sortWeekdays(parsed.days),
    time: `${formatClockTime(parsed.startTime)}-${formatClockTime(parsed.endTime)}`,
  };
}

function getCourseScheduleParts(course: Course): Array<{ days: string[]; time: string }> {
  return course.lectureMeetings?.length
    ? course.lectureMeetings.map(({ time }) => getScheduleParts(time))
    : [getScheduleParts(course.schedule)];
}

function formatCourseScheduleDisplay(course: Course): string {
  const schedules = course.lectureMeetings?.length
    ? course.lectureMeetings.map(({ time }) => formatScheduleDisplay(time))
    : [formatScheduleDisplay(course.schedule)];
  return schedules.join("; ");
}

function formatCourseLocations(course: Course): string {
  const locations = course.lectureMeetings?.length
    ? course.lectureMeetings.map(({ location }) => location).filter(Boolean)
    : [course.lectureLocation || "TBA"];
  return Array.from(new Set(locations)).join("; ");
}

function sortWeekdays(days: Weekday[]): Weekday[] {
  const order: Weekday[] = ["Mon", "Tue", "Wed", "Thu", "Fri"];
  return order.filter((day) => days.includes(day));
}

function getCourseTitle(name: string): string {
  const code = name.match(/\b[A-Z]{2,5}\s*\d{1,3}[A-Z]?\b/i)?.[0];
  const title = code ? name.replace(code, "").replace(/^\s*[-:]\s*/, "").trim() : name.trim();
  return title || getCourseCode(name);
}

function formatTerm(term: string): string {
  const match = term.match(/(?:(\d{2})(FA|WI|SP|SU)|(FA|WI|SP|SU)(\d{2}))/i);
  if (!match) return term;
  const shortYear = match[1] ?? match[4];
  const quarter = match[2] ?? match[3];
  const quarterNames: Record<string, string> = {
    FA: "Fall",
    WI: "Winter",
    SP: "Spring",
    SU: "Summer",
  };
  return `${quarterNames[quarter.toUpperCase()]} 20${shortYear}`;
}

function ratingLabel(rating: number): string {
  if (rating >= 4.5) return "Excellent";
  if (rating >= 4) return "Very good";
  if (rating >= 3) return "Good";
  return "Mixed";
}

function timeToMinutes(value: string): number {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function formatClockTime(value: string): string {
  const [hours, minutes] = value.split(":").map(Number);
  const suffix = hours >= 12 ? "PM" : "AM";
  return `${hours % 12 || 12}:${String(minutes).padStart(2, "0")} ${suffix}`;
}

function generateCalendarColor(seed: string): string {
  const palette = ["#2563EB", "#7C3AED", "#059669", "#D97706", "#DC2626", "#0891B2"];
  const hash = Array.from(seed).reduce((total, character) => total + character.charCodeAt(0), 0);
  return palette[hash % palette.length];
}

async function searchBackendCourses(query: string, signal: AbortSignal, term: string): Promise<BackendCourse[]> {
  const encodedQuery = encodeURIComponent(query);
  const encodedTerm = encodeURIComponent(term || "");
  const response = await fetchApi(
    `/course?course=${encodedQuery}&term=${encodedTerm}`,
    createApiRequestInit(signal)
  );

  if (response.status === 404 || response.status === 400) {
    return [];
  }

  if (!response.ok) {
    throw new Error(`Failed with status ${response.status}`);
  }

  const payload = (await response.json()) as BackendResponse;

  return Array.isArray(payload)
    ? payload
    : Array.isArray(payload.data)
      ? payload.data
      : [];
}

type BackendSection = {
  Days?: string;
  Time?: string;
  Location?: string;
  SectionId?: string;
  SectionRef?: string;
  SectionCode?: string;
  EventPackageIds?: string[];
  Exams?: Array<{ Type: "midterm" | "final"; Days?: string; Time?: string; Location?: string }>;
};

function mapSectionExams(section: BackendSection, sectionId: string) {
  return (section.Exams ?? []).map((exam, index) => ({
    id: `${sectionId}-exam-${index}`,
    name: exam.Type === "final" ? "Final" : "Midterm",
    type: exam.Type,
    time: `${exam.Days ?? ""} ${exam.Time ?? ""}`.trim() || "TBA",
    location: exam.Location?.trim() || "TBA",
  }));
}

type BackendCourse = {
  id?: string | number;
  Name?: string;
  Term?: string;
  Teacher?: string;
  Rating?: string;
  rmp?: BackendRmpRecord | null;
  name?: string;
  term?: string;
  teacher?: string;
  rating?: string;
  Lecture?: BackendSection | null;
  Lectures?: BackendSection[];
  SectionCode?: string;
  lecture?: BackendSection | BackendSection[] | null;
  Discussions?: BackendSection[];
  discussions?: BackendSection[];
  Labs?: BackendSection[];
  labs?: BackendSection[];
  Midterms?: BackendSection[];
  midterms?: BackendSection[];
  Final?: BackendSection | null;
  final?: BackendSection | null;
  TssPackageUrls?: Record<string, string>;
  TssFallbackUrl?: string;
};

type BackendResponse = BackendCourse[] | { data?: BackendCourse[] };

type BackendRmpRecord = {
  avgRating?: number | string;
  avgDiff?: number | string;
  takeAgainPercent?: number | string;
  profileUrl?: string;
};

function mapBackendCourseToCourse(course: BackendCourse, index: number): Course {
  const lecture = Array.isArray(course.lecture)
    ? course.lecture[0]
    : (course.Lecture ?? course.lecture ?? null);
  const discussions = course.Discussions ?? course.discussions ?? [];
  const labs = course.Labs ?? course.labs ?? [];
  const midterms = course.Midterms ?? course.midterms ?? [];
  const finalExam = course.Final ?? course.final ?? null;
  const lectures = course.Lectures?.length
    ? course.Lectures
    : lecture
      ? [lecture]
      : [];
  const lectureDays = lecture?.Days?.trim() ?? "";
  const lectureTime = lecture?.Time?.trim() ?? "";
  const lectureSchedule = `${lectureDays} ${lectureTime}`.trim();
  const name = course.Name ?? course.name ?? "Untitled Course";
  const term = course.Term ?? course.term ?? "Unknown";
  const teacher = course.Teacher ?? course.teacher ?? "Instructor TBA";
  const rmp = course.rmp ?? null;
  const avgRating = Number(rmp?.avgRating);
  const avgDiff = Number(rmp?.avgDiff);
  const takeAgain = Number(rmp?.takeAgainPercent);
  const fallbackRating = Number(course.Rating ?? course.rating ?? "");

  return {
    id: course.id !== undefined ? String(course.id) : `${name}-${term}-${index}`,
    name,
    instructor: teacher,
    schedule: lectureSchedule || "Schedule TBA",
    description: `Term: ${term}`,
    color: "hsl(210, 70%, 52%)",
    lectureLocation: lecture?.Location?.trim() || "TBA",
    lectureMeetings: lectures.map((meeting, meetingIndex) => ({
      id: `${course.id ?? index}-lecture-${meetingIndex}`,
      name: `Lecture meeting ${meetingIndex + 1}`,
      time: `${meeting.Days ?? ""} ${meeting.Time ?? ""}`.trim() || "TBA",
      location: meeting.Location?.trim() || "TBA",
      sectionRef: meeting.SectionRef,
      sectionCode: meeting.SectionCode,
      eventPackageIds: meeting.EventPackageIds,
    })),
    lectureSectionRef: lecture?.SectionRef,
    lectureEventPackageIds: lecture?.EventPackageIds,
    sectionCode: course.SectionCode,
    tssPackageUrls: course.TssPackageUrls,
    tssFallbackUrl: course.TssFallbackUrl,
    rmpRating:
      Number.isFinite(avgRating) && avgRating > 0
        ? avgRating
        : Number.isFinite(fallbackRating) && fallbackRating > 0
          ? fallbackRating
          : undefined,
    rmpTakeAgain: Number.isFinite(takeAgain) && takeAgain >= 0 ? takeAgain : undefined,
    rmpAvgDifficulty: Number.isFinite(avgDiff) && avgDiff > 0 ? avgDiff : undefined,
    rmpProfileUrl: normalizeProfessorProfileUrl(rmp?.profileUrl),
    discussionSections: discussions.map((section, sectionIndex) => ({
      id: `${index}-${sectionIndex}`,
      name: section.SectionCode ?? `Discussion ${sectionIndex + 1}`,
      time: `${section.Days ?? ""} ${section.Time ?? ""}`.trim() || "TBA",
      location: section.Location?.trim() || "TBA",
      sectionRef: section.SectionRef,
      sectionCode: section.SectionCode,
      eventPackageIds: section.EventPackageIds,
      exams: mapSectionExams(section, `${course.id ?? index}-discussion-${sectionIndex}`),
    })),
    labSections: labs.map((section, sectionIndex) => ({
      id: `${index}-lab-${sectionIndex}`,
      name: section.SectionCode ?? `Lab ${sectionIndex + 1}`,
      time: `${section.Days ?? ""} ${section.Time ?? ""}`.trim() || "TBA",
      location: section.Location?.trim() || "TBA",
      sectionRef: section.SectionRef,
      sectionCode: section.SectionCode,
      eventPackageIds: section.EventPackageIds,
      exams: mapSectionExams(section, `${course.id ?? index}-lab-${sectionIndex}`),
    })),
    midtermSections: midterms
      .filter((midterm) => {
        const days = midterm.Days?.trim() ?? "";
        const time = midterm.Time?.trim() ?? "";
        const location = midterm.Location?.trim() ?? "";
        return days.length > 0 || time.length > 0 || location.length > 0;
      })
      .map((midterm, midtermIndex): CourseExamSection => ({
        id: `${index}-midterm-${midtermIndex}`,
        name: `Midterm ${midtermIndex + 1}`,
        time: `${midterm.Days ?? ""} ${midterm.Time ?? ""}`.trim() || "TBA",
        location: midterm.Location?.trim() || "TBA",
      })),
    finalSection:
      finalExam &&
      ((finalExam.Days?.trim() ?? "").length > 0 ||
        (finalExam.Time?.trim() ?? "").length > 0 ||
        (finalExam.Location?.trim() ?? "").length > 0)
        ? {
            id: `${index}-final`,
            name: "Final Exam",
            time: `${finalExam.Days ?? ""} ${finalExam.Time ?? ""}`.trim() || "TBA",
            location: finalExam.Location?.trim() || "TBA",
          }
        : null,
  };
}
