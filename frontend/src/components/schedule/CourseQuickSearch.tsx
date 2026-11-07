import { useEffect, useId, useRef, useState } from "react";
import { Check, Loader2, Plus, Search, X } from "lucide-react";
import { searchScheduleCourses } from "@/lib/scheduleApi";
import type { ScheduleCourse } from "@/types/generation";
import { cn } from "@/lib/utils";

interface CourseQuickSearchProps {
  term: string;
  selectedKeys: string[];
  onAdd: (course: ScheduleCourse) => void;
  disabled?: boolean;
}

type SearchResult = {
  query: string;
  term: string;
  courses: ScheduleCourse[];
  status: "loading" | "ready" | "error";
  error?: string;
};

export function CourseQuickSearch({
  term,
  selectedKeys,
  onAdd,
  disabled = false,
}: CourseQuickSearchProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [retry, setRetry] = useState(0);
  const [announcement, setAnnouncement] = useState("");
  const [result, setResult] = useState<SearchResult | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const normalizedQuery = query.trim();
  const enabled = !disabled && Boolean(term);
  const matchesCurrentQuery =
    result?.query === normalizedQuery && result?.term === term;
  const courses =
    matchesCurrentQuery && result?.status === "ready" ? result.courses : [];
  const loading =
    Boolean(normalizedQuery) &&
    (!matchesCurrentQuery || result?.status === "loading");
  const error =
    matchesCurrentQuery && result?.status === "error" ? result.error : null;
  const visible = open && enabled && Boolean(normalizedQuery);

  useEffect(() => {
    if (!normalizedQuery || !enabled) {
      setResult(null);
      return;
    }
    const controller = new AbortController();
    let current = true;
    setResult({ query: normalizedQuery, term, courses: [], status: "loading" });
    const timer = window.setTimeout(() => {
      searchScheduleCourses(normalizedQuery, term, controller.signal)
        .then((found) => {
          if (!current) return;
          setResult({
            query: normalizedQuery,
            term,
            courses: found,
            status: "ready",
          });
          setAnnouncement(`${found.length} matching courses.`);
        })
        .catch((cause: unknown) => {
          if (!current || controller.signal.aborted) return;
          setResult({
            query: normalizedQuery,
            term,
            courses: [],
            status: "error",
            error:
              cause instanceof Error
                ? cause.message
                : "Search unavailable. Try again.",
          });
        });
    }, 200);
    return () => {
      current = false;
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [normalizedQuery, term, retry, enabled]);

  useEffect(() => {
    const dismiss = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setActiveIndex(-1);
      }
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, []);

  useEffect(() => {
    if (activeIndex >= 0)
      document
        .getElementById(`${listId}-${activeIndex}`)
        ?.scrollIntoView?.({ block: "nearest" });
  }, [activeIndex, listId]);

  function add(course: ScheduleCourse) {
    if (selectedKeys.includes(course.key)) return;
    onAdd(course);
    setAnnouncement(`${course.code} added to your courses.`);
    inputRef.current?.focus();
  }

  return (
    <div
      ref={rootRef}
      className="relative mb-2"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setOpen(false);
          setActiveIndex(-1);
        }
      }}
    >
      <div className="relative">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-muted-foreground"
        />
        <input
          ref={inputRef}
          type="search"
          role="combobox"
          aria-label="Quick course search"
          aria-autocomplete="list"
          aria-expanded={visible}
          aria-controls={visible ? listId : undefined}
          aria-activedescendant={
            visible && courses[activeIndex]
              ? `${listId}-${activeIndex}`
              : undefined
          }
          autoComplete="off"
          placeholder="Find a course…"
          disabled={!enabled}
          value={query}
          className="h-11 w-full rounded-[7px] border border-border bg-card pl-9 pr-10 text-sm text-foreground transition-colors placeholder:text-muted-foreground focus:border-primary focus:bg-primary/[0.025] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/25 disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none [&::-webkit-search-cancel-button]:hidden"
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
            setActiveIndex(-1);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              setOpen(false);
              setActiveIndex(-1);
            }
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              setOpen(true);
              if (courses.length)
                setActiveIndex((index) =>
                  index < 0
                    ? event.key === "ArrowDown"
                      ? 0
                      : courses.length - 1
                    : (index +
                        (event.key === "ArrowDown" ? 1 : -1) +
                        courses.length) %
                      courses.length,
                );
            }
            if (event.key === "Enter" && visible && courses.length) {
              event.preventDefault();
              const course = courses[activeIndex < 0 ? 0 : activeIndex];
              if (course) add(course);
            }
          }}
        />
        {query && (
          <button
            type="button"
            aria-label="Clear course search"
            className="absolute right-0 top-0 flex h-11 w-10 items-center justify-center rounded-md text-muted-foreground hover:text-foreground focus-visible:outline-primary"
            onClick={() => {
              setQuery("");
              setActiveIndex(-1);
              inputRef.current?.focus();
              setOpen(true);
            }}
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      {visible && (
        <div className="schedule-search-enter absolute left-0 top-[calc(100%+6px)] z-50 w-full origin-top-left rounded-lg bg-card p-1 shadow-[0_8px_28px_#16223824] lg:min-w-[286px]">
          <div
            id={listId}
            role="listbox"
            aria-label="Matching courses"
            aria-busy={loading}
            className="max-h-80 overflow-y-auto overscroll-contain"
          >
            {courses.map((course, index) => {
              const added = selectedKeys.includes(course.key);
              return (
                <button
                  key={course.key}
                  id={`${listId}-${index}`}
                  type="button"
                  role="option"
                  aria-selected={activeIndex === index}
                  aria-disabled={added}
                  aria-label={`${added ? "Added" : "Add"} ${course.code}`}
                  className={cn(
                    "flex min-h-14 w-full items-center justify-between gap-3 rounded-md bg-card px-2.5 py-3 text-left transition-colors hover:bg-primary/[0.065] focus-visible:outline-primary motion-reduce:transition-none",
                    activeIndex === index && "bg-primary/[0.065]",
                  )}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => add(course)}
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-foreground">
                      {course.code}
                    </span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {course.title}
                    </span>
                  </span>
                  <span
                    className={cn(
                      "flex shrink-0 items-center gap-1 text-sm font-medium",
                      added ? "text-green-700" : "text-primary",
                    )}
                  >
                    {added ? (
                      <Check className="schedule-added-icon h-3.5 w-3.5" />
                    ) : (
                      <Plus className="h-3.5 w-3.5" />
                    )}
                    {added ? "Added" : "Add"}
                  </span>
                </button>
              );
            })}
          </div>
          {loading && (
            <p
              role="status"
              className="flex items-center gap-2 px-2.5 py-3 text-xs text-muted-foreground"
            >
              <Loader2
                aria-hidden="true"
                className="h-4 w-4 motion-safe:animate-spin"
              />
              Searching courses…
            </p>
          )}
          {error && (
            <div className="px-2.5 py-3 text-xs">
              <p role="alert" className="text-destructive">
                {error}
              </p>
              <button
                type="button"
                className="mt-2 min-h-9 font-medium text-primary underline underline-offset-2"
                onClick={() => setRetry((value) => value + 1)}
              >
                Try again
              </button>
            </div>
          )}
          {normalizedQuery && !loading && !error && !courses.length && (
            <p
              role="status"
              className="px-2.5 py-3 text-xs text-muted-foreground"
            >
              No courses found. Try a code or title.
            </p>
          )}
        </div>
      )}
      <span role="status" className="sr-only">
        {announcement}
      </span>
    </div>
  );
}

export default CourseQuickSearch;
