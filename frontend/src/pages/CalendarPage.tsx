import ExamSchedule from "@/components/ExamSchedule";
import { getExamSchedule } from "@/lib/examSchedule";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useEffect, useMemo, useRef, useState } from "react";
import { SavedScheduleShelf } from "@/components/schedule/SavedScheduleShelf";
import { SkippedOptions } from "@/components/schedule/SkippedOptions";
import {
  SavedPlanToolbar,
  SavePlanButton,
} from "@/components/schedule/SavedPlanToolbar";
import { useScheduleLibrary } from "@/hooks/useScheduleLibrary";
import {
  MAX_SAVED,
  captureOptions,
  validateOptions,
  validateSavedPlan,
  currentSnapshot,
  planFingerprint,
  type PlanSnapshot,
  type SavedPlan,
} from "@/lib/savedSchedules";
import { hasScheduleConflict } from "@/lib/scheduleConflicts";
import "@/components/schedule/savedSchedules.css";
import {
  AlertTriangle,
  CalendarPlus,
  CalendarDays,
  ClipboardList,
  Eraser,
  Check,
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  Loader2,
  RefreshCw,
  Undo2,
  ArrowDownWideNarrow,
  X,
} from "lucide-react";
import { useCalendar } from "@/context/CalendarContext";
import { WeekCalendar } from "@/components/schedule/WeekCalendar";
import { CourseQuickSearch } from "@/components/schedule/CourseQuickSearch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useLayoutMotion } from "@/hooks/useLayoutMotion";
import { hasPreviewMotionOverride } from "@/lib/scheduleMotion";
import {
  getScheduleOptions,
  getScheduleTerm,
  searchScheduleCourses,
} from "@/lib/scheduleApi";
import { coursePalette, changedMeetings } from "@/lib/schedulePresentation";
import { getCourseCode } from "@/lib/courseLabels";
import type { CalendarEvent } from "@/types/calendar";
import type {
  GeneratedSchedule,
  ScheduleCourse,
  ScheduleWorkerResponse,
} from "@/types/generation";

const seenCoursesKey = (term: string) => `scheduleSeenCourses:v1:${term}`;
const savedCourseIds = (events: CalendarEvent[], term: string) => [
  ...new Set(
    events
      .filter((e) => e.isCourse && (!e.term || e.term === term))
      .map((e) => e.courseId || e.id),
  ),
];
const selectionKey = (term: string) => `scheduleSelections:v1:${term}`;
function readSelections(term: string): ScheduleCourse[] {
  try {
    const data = JSON.parse(localStorage.getItem(selectionKey(term)) || "[]");
    if (!Array.isArray(data)) return [];
    const seen = new Set<string>();
    return data
      .filter((course): course is ScheduleCourse => {
        if (
          !course ||
          typeof course.key !== "string" ||
          !course.key ||
          course.term !== term ||
          typeof course.code !== "string" ||
          typeof course.title !== "string" ||
          seen.has(course.key)
        )
          return false;
        seen.add(course.key);
        return true;
      })
      .slice(0, 12)
      .map((course) => ({ ...course, options: [], issues: [] }));
  } catch {
    return [];
  }
}
type Phase =
  | "idle"
  | "loading"
  | "running"
  | "paused"
  | "complete"
  | "stopped"
  | "error";

export default function CalendarPage() {
  const {
    events,
    examOnlyCourses,
    deleteEvent,
    deleteEventsByCourseId,
    replaceCourseEvents,
    clearSchedule,
    undoScheduleChange,
    canUndoScheduleChange,
  } = useCalendar();
  const [activeTab, setActiveTab] = useState("weekly");
  const initialEvents = useRef(events);
  const [term, setTerm] = useState("");
  const termEvents = useMemo(
    () => events.filter((event) => !term || !event.term || event.term === term),
    [events, term],
  );
  const termExamCourses = examOnlyCourses.filter(
    (course) => !term || !course.term || course.term === term,
  );
  const [searchReset, setSearchReset] = useState(0);
  const [termAttempt, setTermAttempt] = useState(0);
  const [termError, setTermError] = useState("");
  const [selected, setSelected] = useState<ScheduleCourse[]>([]);
  const library = useScheduleLibrary(term);
  const [savedPreviewId, setSavedPreviewId] = useState<string | null>(null);
  const [saveDraft, setSaveDraft] = useState<PlanSnapshot | null>(null);
  const current = useMemo(
    () =>
      currentSnapshot(
        events,
        [...selected, ...library.plans.flatMap((p) => p.courses)],
        term,
      ),
    [events, selected, term, library.plans],
  );
  const activePlan = useMemo(() => {
    const signature = planFingerprint(current.events);
    const matches = library.plans.filter(
      (p) => planFingerprint(p.events) === signature,
    );
    return matches.find((p) => p.id === library.preferredId) || matches[0];
  }, [library.plans, library.preferredId, current]);
  const viewedPlan = library.plans.find((p) => p.id === savedPreviewId);
  const savedPreview =
    viewedPlan?.id === activePlan?.id ? undefined : viewedPlan;
  const visibleCourses = useMemo(
    () =>
      viewedPlan
        ? viewedPlan.courses.map((c) => ({ ...c, options: [], issues: [] }))
        : selected,
    [viewedPlan, selected],
  );
  const [phase, setPhase] = useState<Phase>("idle");
  const [schedules, setSchedules] = useState<GeneratedSchedule[]>([]);
  const [activeScheduleId, setActiveScheduleId] = useState<string | null>(null);
  const resultsRef = useRef<HTMLElement>(null);
  const coursesRef = useRef<HTMLElement>(null);
  const [sort, setSort] = useState("gaps");
  const [coursesExpanded, setCoursesExpanded] = useState(true);
  const [highlightedCourse, setHighlightedCourse] = useState<string | null>(
    null,
  );
  const [changedIds, setChangedIds] = useState<Set<string>>(new Set());
  const previousPreview = useRef<GeneratedSchedule | undefined>();
  const [previewing, setPreviewing] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [applying, setApplying] = useState(false);
  const [sourceSignature, setSourceSignature] = useState("");
  const [sourceCourses, setSourceCourses] = useState<ScheduleCourse[]>([]);
  const worker = useRef<Worker | null>(null);
  const request = useRef<AbortController | null>(null);
  const runId = useRef(0);
  const signature = JSON.stringify([
    term,
    selected.map((c) => c.key).sort(),
    events,
  ]);
  const currentSignature = useRef(signature);
  currentSignature.current = signature;
  const dirty = !!sourceSignature && sourceSignature !== signature;
  const busy = phase === "loading" || phase === "running";

  useEffect(() => {
    const controller = new AbortController();
    setTermError("");
    void (async () => {
      try {
        const active = await getScheduleTerm(controller.signal);
        let choices = readSelections(active);
        let seen: string[] = [];
        try {
          const stored = JSON.parse(
            localStorage.getItem(seenCoursesKey(active)) || "[]",
          );
          if (Array.isArray(stored))
            seen = stored.filter((value) => typeof value === "string");
        } catch {
          /* Resolve saved events again if the tracking value is unavailable. */
        }
        // Import newly saved courses while preserving deliberate removals from the generation list.
        const codes = [
          ...new Set(
            initialEvents.current
              .filter(
                (e) =>
                  e.isCourse &&
                  (!e.term || e.term === active) &&
                  !seen.includes(e.courseId || e.id),
              )
              .map((e) => getCourseCode(e.title)),
          ),
        ];
        const matches = await Promise.allSettled(
          codes
            .slice(0, 12)
            .map((code) =>
              searchScheduleCourses(code, active, controller.signal),
            ),
        );
        let unresolved = codes.length > 12;
        matches.forEach((result, i) => {
          if (result.status !== "fulfilled") {
            unresolved = true;
            return;
          }
          const exact = result.value.filter(
            (c) =>
              c.code.replace(/\s/g, "").toUpperCase() ===
              codes[i].replace(/\s/g, "").toUpperCase(),
          );
          if (exact.length !== 1) {
            unresolved = true;
            return;
          }
          if (!choices.some((course) => course.key === exact[0].key)) {
            if (choices.length < 12) choices = [...choices, exact[0]];
            else unresolved = true;
          }
        });
        if (unresolved && !controller.signal.aborted)
          setNotice(
            "Some saved courses need to be selected again before generating alternatives.",
          );
        if (!controller.signal.aborted) {
          setSelected(choices);
          setTerm(active);
        }
      } catch (err) {
        if (!controller.signal.aborted)
          setTermError(
            err instanceof Error
              ? err.message
              : "The catalog could not be loaded.",
          );
      }
    })();
    return () => controller.abort();
  }, [termAttempt]);

  useEffect(() => {
    if (!term) return;
    try {
      localStorage.setItem(
        selectionKey(term),
        JSON.stringify(
          selected.map(({ key, term, code, title }) => ({
            key,
            term,
            code,
            title,
          })),
        ),
      );
    } catch {
      /* Generation remains usable when storage is full or disabled. */
    }
  }, [selected, term]);

  useEffect(() => {
    if (!term) return;
    try {
      localStorage.setItem(
        seenCoursesKey(term),
        JSON.stringify(savedCourseIds(events, term)),
      );
    } catch {
      /* Saved course tracking is optional when storage is unavailable. */
    }
  }, [events, term]);

  useEffect(
    () => () => {
      worker.current?.terminate();
      request.current?.abort();
    },
    [],
  );
  useEffect(() => {
    if (!dirty) return;
    worker.current?.terminate();
    worker.current = null;
    request.current?.abort();
    runId.current++;
    setPhase((current) =>
      ["running", "loading", "paused"].includes(current) ? "stopped" : current,
    );
    setApplying(false);
  }, [dirty]);

  const sorted = useMemo(
    () =>
      [...schedules].sort(
        (a, b) =>
          (sort === "finish"
            ? a.latestEnd - b.latestEnd
            : sort === "days"
              ? a.days - b.days
              : a.gapMinutes - b.gapMinutes) || a.id.localeCompare(b.id),
      ),
    [schedules, sort],
  );
  const index = Math.max(
    0,
    sorted.findIndex((schedule) => schedule.id === activeScheduleId),
  );
  const shown = sorted[index];
  useLayoutMotion(
    coursesRef,
    `${selected.map((course) => course.key).join(",")}:${coursesExpanded}:${previewing}:${notice}:${canUndoScheduleChange}`,
  );
  useEffect(() => {
    if (shown && activeScheduleId === null) setActiveScheduleId(shown.id);
  }, [shown, activeScheduleId]);
  const resultCount = `${schedules.length} ${schedules.length === 1 ? "schedule" : "schedules"} found${busy ? " so far" : ""}`;
  const searchStatus =
    phase === "complete"
      ? null
      : phase === "paused"
        ? "More combinations remain. Continue to find more schedules."
        : phase === "stopped"
          ? "Search stopped. Results may be incomplete."
          : phase === "error"
            ? "Search incomplete."
            : null;
  function focusResults() {
    setActiveTab("weekly");
    requestAnimationFrame(() => {
      resultsRef.current?.focus({ preventScroll: true });
      resultsRef.current?.scrollIntoView?.({ block: "start" });
    });
  }
  function editCourses() {
    setCoursesExpanded(true);
    setHighlightedCourse(null);
    requestAnimationFrame(() =>
      coursesRef.current
        ?.querySelector<HTMLInputElement>('[role="combobox"]')
        ?.focus(),
    );
  }
  function backToSaved() {
    setSaveDraft(null);
    if (busy) stop();
    setPreviewing(false);
    setHighlightedCourse(null);
    focusResults();
  }
  const previewEvents = shown
    ? [...termEvents.filter((e) => !e.isCourse), ...shown.events]
    : termEvents;

  const colors = useMemo(
    () =>
      coursePalette(
        [
          ...selected,
          ...current.courses,
          ...library.plans.flatMap((p) => p.courses),
        ].map((c) => c.key),
      ),
    [selected, current.courses, library.plans],
  );
  const paintEvents = (items: CalendarEvent[]) =>
    items.map((event) => {
      const key =
        event.courseKey ||
        visibleCourses.find((c) => c.code === getCourseCode(event.title))?.key;
      return key && event.isCourse
        ? { ...event, courseKey: key, color: colors.get(key) || event.color }
        : event;
    });
  useEffect(() => {
    setHighlightedCourse(null);
    const previous = previousPreview.current;
    previousPreview.current = previewing ? shown : undefined;
    setChangedIds(
      previous && shown && previous.id !== shown.id
        ? changedMeetings(previous.events, shown.events)
        : new Set(),
    );
    const timer = window.setTimeout(() => setChangedIds(new Set()), 1800);
    return () => window.clearTimeout(timer);
  }, [shown, previewing]);
  const rangeEvents = useMemo(() => {
    if (!previewing || !schedules.length) return termEvents;
    const meetings = new Map(
      termEvents.filter((e) => !e.isCourse).map((e) => [e.id, e]),
    );
    for (const schedule of schedules)
      for (const event of schedule.events) meetings.set(event.id, event);
    return [...meetings.values()];
  }, [previewing, schedules, termEvents]);

  function closeSavedPreview() {
    setSavedPreviewId(null);
    setSaveDraft(null);
    setHighlightedCourse(null);
    setError("");
  }

  function previewPlan(plan: SavedPlan) {
    if (busy || phase === "paused") stop();
    closeSavedPreview();
    setPreviewing(false);
    setSavedPreviewId(plan.id);
    focusResults();
  }

  const canSavePlan =
    !!term &&
    !applying &&
    !busy &&
    library.plans.length < MAX_SAVED &&
    (previewing
      ? !!shown && !dirty && phase !== "error"
      : !!(savedPreview || current.events.length));

  function openSave() {
    if (!canSavePlan) return;
    if (previewing && shown) {
      setSaveDraft({
        courses: selected.map(({ key, term, code, title }) => ({
          key,
          term,
          code,
          title,
        })),
        events: paintEvents(shown.events),
        options: captureOptions(shown.choices, sourceCourses),
      });
    } else {
      const plan = savedPreview || activePlan || current;
      setSaveDraft({
        courses: plan.courses,
        events: plan.events,
        options: plan.options,
      });
    }
  }

  async function applySavedPlan() {
    if (!savedPreview || applying) return;
    const plan = savedPreview;
    const blocked = termEvents.filter((e) => !e.isCourse);
    if (hasScheduleConflict(plan.events, blocked)) {
      setError(
        "A personal event overlaps this schedule. Move the event or choose another schedule.",
      );
      return;
    }
    const controller = new AbortController();
    request.current = controller;
    setApplying(true);
    setError("");
    const captured = signature;
    try {
      const catalogKeys = [
        ...new Set(
          plan.events.flatMap((e) =>
            e.courseKey && e.term ? [e.courseKey] : [],
          ),
        ),
      ];
      if (catalogKeys.length) {
        const latest = await getScheduleOptions(
          term,
          catalogKeys,
          controller.signal,
        );
        if (controller.signal.aborted || currentSignature.current !== captured)
          return;
        validateSavedPlan(plan, latest);
      }
      if (!library.update((s) => ({ ...s, preferredId: plan.id }))) return;
      replaceCourseEvents(
        [
          ...events.filter((e) => e.isCourse && e.term && e.term !== term),
          ...plan.events,
        ],
        selected,
      );
      setSelected(visibleCourses);
      setSourceSignature("");
      closeSavedPreview();
      setNotice("Schedule applied.");
      focusResults();
    } catch (err) {
      if (!controller.signal.aborted)
        setError(
          err instanceof Error ? err.message : "Could not apply this schedule.",
        );
    } finally {
      setApplying(false);
    }
  }

  function changeCourses(next: ScheduleCourse[]) {
    if (applying) return;
    closeSavedPreview();
    request.current?.abort();
    worker.current?.terminate();
    worker.current = null;
    runId.current++;
    setSelected(next);
    setHighlightedCourse(null);
    setError("");
    setNotice("");
    if (busy || phase === "paused") setPhase("stopped");
  }
  function stop() {
    worker.current?.terminate();
    worker.current = null;
    request.current?.abort();
    runId.current++;
    setPhase("stopped");
  }
  function resetCourseSelection() {
    stop();
    closeSavedPreview();
    setSelected([]);
    setSchedules([]);
    setActiveScheduleId(null);
    setSourceSignature("");
    setSourceCourses([]);
    setPhase("idle");
    setPreviewing(false);
    setSearchReset((value) => value + 1);
    editCourses();
  }

  function clearWorkingSchedule() {
    clearSchedule(term, selected);
    resetCourseSelection();
    setNotice("Schedule cleared.");
    setActiveTab("weekly");
  }

  function removeCourse(key: string) {
    const remaining = visibleCourses.filter((course) => course.key !== key);
    if (remaining.length) {
      void generatePreview(remaining, "removal");
    } else {
      resetCourseSelection();
      setNotice("");
    }
  }

  function generate() {
    return generatePreview(visibleCourses, "manual");
  }

  async function generatePreview(
    generationCourses: ScheduleCourse[],
    trigger: "manual" | "removal",
  ) {
    if (!generationCourses.length || !term || applying) return;
    setSelected(generationCourses);
    closeSavedPreview();
    stop();
    const id = ++runId.current;
    let capturedSignature = JSON.stringify([
      term,
      generationCourses.map((c) => c.key).sort(),
      events,
    ]);
    const controller = new AbortController();
    request.current = controller;
    setSourceSignature(capturedSignature);
    setPhase("loading");
    setError("");
    setNotice("");
    setSchedules([]);
    setActiveScheduleId(null);
    setSourceCourses([]);
    setPreviewing(true);
    setHighlightedCourse(null);
    if (trigger === "manual") {
      setCoursesExpanded(false);
      focusResults();
    }
    try {
      let catalogCourses = generationCourses;
      if (generationCourses.some((c) => c.key === c.code)) {
        catalogCourses = await Promise.all(
          generationCourses.map(async (course) => {
            if (course.key !== course.code) return course;
            const matches = (
              await searchScheduleCourses(course.code, term, controller.signal)
            ).filter((c) => c.code === course.code);
            if (matches.length !== 1)
              throw new Error(
                `Select ${course.code} again to generate schedules for this course.`,
              );
            return matches[0];
          }),
        );
      }
      const courses = await getScheduleOptions(
        term,
        catalogCourses.map((c) => c.key),
        controller.signal,
      );
      if (
        controller.signal.aborted ||
        id !== runId.current ||
        capturedSignature !== currentSignature.current
      )
        return;
      capturedSignature = JSON.stringify([
        term,
        courses.map((c) => c.key).sort(),
        events,
      ]);
      setSourceSignature(capturedSignature);
      setSelected(courses);
      setSourceCourses(courses);
      const nextWorker = new Worker(
        new URL("../workers/scheduleGenerator.worker.ts", import.meta.url),
        { type: "module" },
      );
      worker.current = nextWorker;
      nextWorker.onmessage = (event: MessageEvent<ScheduleWorkerResponse>) => {
        if (
          id !== runId.current ||
          capturedSignature !== currentSignature.current
        )
          return;
        const message = event.data;
        if (message.type === "results")
          setSchedules((current) => [...current, ...message.schedules]);
        else if (message.type === "error") {
          setError(message.message);
          setPhase("error");
          nextWorker.terminate();
        } else {
          setPhase(message.type);
          if (message.type === "complete") {
            nextWorker.terminate();
            worker.current = null;
          }
        }
      };
      nextWorker.onerror = () => {
        if (id === runId.current) {
          setError("Generation stopped unexpectedly. Please try again.");
          setPhase("error");
          nextWorker.terminate();
        }
      };
      setPhase("running");
      nextWorker.postMessage({
        type: "start",
        courses,
        blockedEvents: termEvents.filter((e) => !e.isCourse),
      });
    } catch (err) {
      if (controller.signal.aborted || id !== runId.current) return;
      setError(
        err instanceof Error
          ? err.message
          : "Generation failed. Please try again.",
      );
      setPhase("error");
    }
  }
  async function keepSchedule() {
    if (!shown || dirty || busy || applying) return;
    setSaveDraft(null);
    setApplying(true);
    setError("");
    const capturedSignature = signature;
    const controller = new AbortController();
    request.current = controller;
    try {
      const latest = await getScheduleOptions(
        term,
        selected.map((c) => c.key),
        controller.signal,
      );
      if (
        capturedSignature !== currentSignature.current ||
        controller.signal.aborted
      )
        return;
      validateOptions(captureOptions(shown.choices, sourceCourses), latest);
      const keptEvents = [
        ...events.filter((e) => e.isCourse && e.term && e.term !== term),
        ...paintEvents(shown.events),
      ];
      replaceCourseEvents(keptEvents);
      // Keeping this preview does not invalidate the alternatives from the same search.
      setSourceSignature(
        JSON.stringify([
          term,
          selected.map((c) => c.key).sort(),
          [...events.filter((e) => !e.isCourse), ...keptEvents],
        ]),
      );
      worker.current?.terminate();
      worker.current = null;
      runId.current++;
      if (phase === "paused") setPhase("stopped");
      setPreviewing(false);
      setNotice("Schedule applied.");
      focusResults();
    } catch (err) {
      if (!controller.signal.aborted)
        setError(
          err instanceof Error
            ? err.message
            : "This schedule could not be saved.",
        );
    } finally {
      setApplying(false);
    }
  }
  function removeSavedEvent(event: CalendarEvent) {
    if (event.isCourse && event.courseId)
      deleteEventsByCourseId(event.courseId);
    else deleteEvent(event.id);
    setNotice("");
  }

  const displayedEvents = savedPreview
    ? [...termEvents.filter((event) => !event.isCourse), ...savedPreview.events]
    : previewing && shown
      ? previewEvents
      : termEvents;
  const calendarEvents = paintEvents(displayedEvents);
  const examSchedule = getExamSchedule(calendarEvents, termExamCourses);
  const courseCount = new Set([
    ...displayedEvents.filter((e) => e.isCourse).map((e) => e.courseId || e.id),
    ...termExamCourses.map((course) => course.id),
  ]).size;

  const conflictCount = examSchedule.conflicts.length;
  const waitingForFirstResult = previewing && busy && !shown;
  const generationProgress = previewing && busy && (
    <div
      className={
        waitingForFirstResult
          ? "schedule-generation-placeholder flex flex-col items-center justify-center gap-1 px-4 py-6 text-center"
          : "flex flex-wrap items-center gap-x-4 px-3 py-1 sm:px-5"
      }
    >
      <div
        role="status"
        className={`flex items-center text-sm font-medium ${waitingForFirstResult ? "flex-col gap-4" : "gap-2"}`}
      >
        <span
          aria-hidden="true"
          className={`schedule-generation-ring text-primary motion-safe:animate-spin ${waitingForFirstResult ? "size-10 border-[3px]" : "size-4 border-2"}`}
        />
        {phase === "loading" ? "Loading course options…" : "Finding schedules…"}
      </div>
      <button
        type="button"
        onClick={stop}
        className="plan-button quiet text-muted-foreground"
      >
        Cancel generation
      </button>
    </div>
  );
  const outdatedPreview = dirty && (
    <p role="status" className="text-xs leading-4 text-muted-foreground">
      Preview out of date
    </p>
  );
  const updatePreviewAction = dirty && (
    <button
      type="button"
      className="plan-button"
      disabled={applying || busy}
      onClick={generate}
    >
      <RefreshCw aria-hidden="true" size={16} />
      Update preview
    </button>
  );
  const viewSwitcher = (
    <TabsList aria-label="Schedule views" className="schedule-view-switch">
      <TabsTrigger value="weekly">
        <CalendarDays aria-hidden="true" size={15} /> Weekly classes
      </TabsTrigger>
      <TabsTrigger value="exams">
        <ClipboardList aria-hidden="true" size={15} /> Exams
        {conflictCount > 0 && (
          <span className="exam-conflict-count">
            <AlertTriangle aria-hidden="true" size={12} />
            {conflictCount}
            <span className="sr-only">
              {" "}
              {conflictCount === 1 ? "conflict" : "conflicts"}
            </span>
          </span>
        )}
      </TabsTrigger>
    </TabsList>
  );

  return (
    <div
      data-preview-motion={hasPreviewMotionOverride() ? "full" : undefined}
      className="schedule-workspace min-h-[calc(100vh-72px)] bg-[#fcfdff] dark:bg-background px-4 py-4 sm:px-6 sm:py-5"
    >
      <h1 className="sr-only">Schedule</h1>
      <div className="plan-workspace grid w-full items-stretch bg-card lg:grid-cols-[minmax(280px,328px)_minmax(0,1fr)]">
        <aside
          ref={coursesRef}
          className="plan-sidebar min-w-0 border-b border-border bg-muted/30 px-4 py-3 lg:border-b-0 lg:border-r lg:px-5"
          aria-label="Courses to schedule"
        >
          <button
            type="button"
            onClick={() => {
              setCoursesExpanded((open) => !open);
              setHighlightedCourse(null);
            }}
            aria-expanded={coursesExpanded}
            aria-controls="schedule-course-controls"
            className="mb-3 flex min-h-11 w-full items-center justify-between rounded-md border border-border bg-card px-3 text-sm font-medium lg:hidden"
          >
            <span>
              {visibleCourses.length}{" "}
              {visibleCourses.length === 1 ? "course" : "courses"}
            </span>
            <span className="flex items-center gap-2 text-primary">
              {coursesExpanded ? "Hide" : "Edit"}
              <ChevronDown
                className={`h-4 w-4 transition-transform motion-reduce:transition-none ${coursesExpanded ? "rotate-180" : ""}`}
              />
            </span>
          </button>
          <div
            id="schedule-course-controls"
            className={`${coursesExpanded ? "flex schedule-panel-open" : "hidden lg:flex"} flex-col`}
          >
            <div className="mb-3 flex min-h-11 shrink-0 items-center justify-between gap-2">
              <h2 className="text-base font-semibold">Your courses</h2>
              <span className="text-xs text-muted-foreground">
                {visibleCourses.length} selected
              </span>
            </div>
            <div className="shrink-0">
              <CourseQuickSearch
                key={searchReset}
                term={term}
                selectedKeys={visibleCourses.map((c) => c.key)}
                onAdd={(course) => changeCourses([...visibleCourses, course])}
                disabled={!term || applying || visibleCourses.length >= 12}
              />
            </div>
            {termError && (
              <div role="alert" className="mt-3 text-sm text-destructive">
                {termError}
                <button
                  onClick={() => setTermAttempt((n) => n + 1)}
                  className="ml-2 underline"
                >
                  Retry
                </button>
              </div>
            )}
            <ul className="mt-2 min-h-0 divide-y divide-border empty:hidden lg:max-h-[50dvh] lg:overflow-y-auto lg:overscroll-contain">
              {visibleCourses.map((course) => (
                <li
                  key={course.key}
                  data-motion-key={`course:${course.key}`}
                  className="py-1"
                  onMouseEnter={() => setHighlightedCourse(course.key)}
                  onMouseLeave={() => setHighlightedCourse(null)}
                  onFocus={() => setHighlightedCourse(course.key)}
                  onBlur={(event) => {
                    if (!event.currentTarget.contains(event.relatedTarget))
                      setHighlightedCourse(null);
                  }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      aria-label={`Highlight ${course.code}`}
                      onClick={() =>
                        setHighlightedCourse((current) =>
                          current === course.key ? null : course.key,
                        )
                      }
                      className="flex min-h-11 items-center gap-2 rounded text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                    >
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ background: colors.get(course.key) }}
                      />
                      {course.code}
                    </button>
                    <button
                      type="button"
                      disabled={applying}
                      onClick={() => removeCourse(course.key)}
                      aria-label={`Remove ${course.code}`}
                      className="rounded p-2 text-muted-foreground hover:bg-muted hover:text-destructive"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
            <div
              data-motion-key="course-actions"
              className={`mt-4 shrink-0 ${visibleCourses.length ? "border-t border-border pt-4" : ""}`}
            >
              {visibleCourses.length === 12 && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Up to 12 courses per search.
                </p>
              )}
              <button
                type="button"
                onClick={clearWorkingSchedule}
                disabled={
                  applying ||
                  !term ||
                  !(
                    visibleCourses.length ||
                    termEvents.length ||
                    termExamCourses.length
                  )
                }
                className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md border border-primary/25 bg-card px-3 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25 disabled:opacity-50"
              >
                <Eraser aria-hidden="true" className="h-4 w-4" />
                Clear Schedule
              </button>
              <button
                type="button"
                onClick={generate}
                disabled={!visibleCourses.length || !term || applying || busy}
                className={`mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium focus-visible:ring-2 focus-visible:ring-primary/30 disabled:opacity-50 ${previewing ? "border border-border bg-card text-primary hover:bg-primary/5" : "bg-primary text-primary-foreground hover:bg-primary/90"}`}
              >
                <CalendarPlus aria-hidden="true" className="h-4 w-4" />
                {busy
                  ? "Finding schedules…"
                  : schedules.length
                    ? "Generate again"
                    : "Generate schedules"}
              </button>
            </div>
          </div>
          {!savedPreview &&
            !previewing &&
            (notice || canUndoScheduleChange) && (
              <div
                data-motion-key="schedule-feedback"
                className="mt-3 space-y-2"
              >
                {(notice || canUndoScheduleChange) && (
                  <div className="flex flex-wrap items-center gap-x-2 text-sm">
                    <p
                      role="status"
                      key={notice}
                      className="schedule-feedback min-w-0 flex-1 text-muted-foreground"
                    >
                      {notice}
                    </p>
                    {canUndoScheduleChange && (
                      <button
                        type="button"
                        disabled={applying || !term}
                        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-3 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/30 disabled:opacity-40"
                        onClick={() => {
                          const previousSelection = undoScheduleChange();
                          if (previousSelection) setSelected(previousSelection);
                          setPreviewing(false);
                          setNotice("Previous schedule restored.");
                        }}
                      >
                        <Undo2 aria-hidden="true" className="h-4 w-4" />
                        Undo
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          <SavedScheduleShelf
            key={term}
            plans={library.plans}
            activeId={activePlan?.id}
            previewId={previewing ? "generated" : savedPreview?.id}
            colors={colors}
            draft={saveDraft}
            canSave={canSavePlan}
            applying={applying}
            error={library.error}
            update={library.update}
            onOpen={openSave}
            onCancel={() => setSaveDraft(null)}
            onPreview={previewPlan}
            onSaved={(plan) => {
              setSaveDraft(null);
              previewPlan(plan);
            }}
          />
        </aside>
        <section
          ref={resultsRef}
          tabIndex={-1}
          className="plan-calendar min-w-0 scroll-mt-24 overflow-hidden focus:outline-none"
          aria-label="Calendar"
        >
          {waitingForFirstResult && generationProgress}
          <Tabs
            value={activeTab}
            onValueChange={setActiveTab}
            hidden={waitingForFirstResult}
          >
            <header>
              {!previewing && (
                <SavedPlanToolbar
                  active={activePlan}
                  preview={savedPreview}
                  onBack={closeSavedPreview}
                  onUse={applySavedPlan}
                  onSave={openSave}
                  canSave={canSavePlan}
                  applying={applying}
                >
                  {viewSwitcher}
                </SavedPlanToolbar>
              )}
              <div
                className={
                  error || previewing
                    ? "border-b border-border px-3 py-3 sm:px-5"
                    : undefined
                }
              >
                {error && (
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/25 bg-card p-4">
                    <p role="alert" className="text-sm text-destructive">
                      {error}
                    </p>
                    <button
                      type="button"
                      onClick={savedPreview ? applySavedPlan : generate}
                      disabled={busy || applying || !visibleCourses.length}
                      className="min-h-11 rounded-md border border-border px-4 text-sm font-medium hover:bg-muted"
                    >
                      Try again
                    </button>
                  </div>
                )}
                {previewing && (
                  <>
                    {!shown && (
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        {viewSwitcher}
                        <button
                          type="button"
                          onClick={backToSaved}
                          disabled={applying}
                          aria-label="Back to saved schedule"
                          className="plan-button quiet"
                        >
                          <ChevronLeft aria-hidden="true" size={16} />
                          Back
                        </button>
                      </div>
                    )}
                    {!shown && !busy && (
                      <div className="mb-3" aria-live="polite">
                        <div className="flex flex-wrap items-center gap-x-3">
                          <div>
                            <h2 className="text-base font-semibold">{resultCount}</h2>
                            {outdatedPreview}
                          </div>
                          <SkippedOptions courses={sourceCourses} />
                          {updatePreviewAction}
                        </div>
                        {searchStatus && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            {searchStatus}
                          </p>
                        )}
                      </div>
                    )}
                    {phase === "paused" && !dirty && (
                      <button
                        className="mb-4 rounded-md border border-border bg-card px-3 py-2 text-sm"
                        onClick={() => {
                          setPhase("running");
                          worker.current?.postMessage({ type: "more" });
                        }}
                      >
                        Find more schedules
                      </button>
                    )}
                    {shown && (
                      <div
                        aria-label="Schedule results"
                        className="schedule-toolbar-enter"
                      >
                        <span className="sr-only" aria-live="polite">
                          {resultCount}
                        </span>
                        <div className="schedule-controls">
                          <div className="flex min-w-0 items-center gap-1.5 sm:gap-3">
                            <button
                              type="button"
                              aria-label="Back to saved schedule"
                              title="Back to saved schedule"
                              disabled={applying}
                              onClick={backToSaved}
                              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/30 disabled:opacity-40 sm:h-11 sm:w-11"
                            >
                              <X aria-hidden="true" className="h-4 w-4" />
                            </button>
                            <div>
                              <h2
                                aria-live="polite"
                                className="whitespace-nowrap text-base font-semibold tabular-nums"
                              >
                                Schedule {index + 1}{" "}
                                <span className="font-normal text-muted-foreground">
                                  of {sorted.length}
                                </span>
                              </h2>
                              {outdatedPreview}
                            </div>
                            <div
                              role="group"
                              aria-label="Choose a schedule"
                              className="flex shrink-0 divide-x divide-border overflow-hidden rounded-md border border-border bg-card"
                            >
                              <button
                                type="button"
                                aria-label="Previous schedule"
                                disabled={applying || index === 0}
                                onClick={() => {
                                  setSaveDraft(null);
                                  setActiveScheduleId(sorted[index - 1].id);
                                }}
                                className="flex h-9 w-9 items-center justify-center hover:bg-muted focus-visible:bg-primary/10 focus-visible:outline-none disabled:opacity-35 sm:h-11 sm:w-11"
                              >
                                <ChevronLeft
                                  aria-hidden="true"
                                  className="h-4 w-4"
                                />
                              </button>
                              <button
                                type="button"
                                aria-label="Next schedule"
                                disabled={
                                  applying || index >= sorted.length - 1
                                }
                                onClick={() => {
                                  setSaveDraft(null);
                                  setActiveScheduleId(sorted[index + 1].id);
                                }}
                                className="flex h-9 w-9 items-center justify-center hover:bg-muted focus-visible:bg-primary/10 focus-visible:outline-none disabled:opacity-35 sm:h-11 sm:w-11"
                              >
                                <ChevronRight
                                  aria-hidden="true"
                                  className="h-4 w-4"
                                />
                              </button>
                            </div>
                            <SkippedOptions courses={sourceCourses} />
                          </div>
                          {viewSwitcher}
                          <div className="schedule-result-actions flex flex-wrap items-center gap-2">
                            <div className="min-w-40 flex-1 sm:flex-none">
                              <Select
                                disabled={applying}
                                value={sort}
                                onValueChange={(value) => {
                                  setSaveDraft(null);
                                  setSort(value);
                                  setActiveScheduleId(null);
                                }}
                              >
                                <SelectTrigger
                                  aria-label="Sort by"
                                  className="h-11 gap-2 border-border bg-card text-sm font-medium text-foreground hover:bg-muted focus:ring-primary/30 focus:ring-offset-0 data-[state=open]:bg-muted"
                                >
                                  <ArrowDownWideNarrow
                                    aria-hidden="true"
                                    className="h-4 w-4 shrink-0 text-muted-foreground"
                                  />
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent
                                  align="end"
                                  className="border-0 bg-card shadow-[0_8px_28px_#16223824] motion-reduce:animate-none"
                                >
                                  <SelectItem
                                    value="gaps"
                                    className="min-h-11 rounded-md text-sm font-medium focus:bg-muted data-[state=checked]:text-primary"
                                  >
                                    Fewest gaps
                                  </SelectItem>
                                  <SelectItem
                                    value="finish"
                                    className="min-h-11 rounded-md text-sm font-medium focus:bg-muted data-[state=checked]:text-primary"
                                  >
                                    Earliest finish
                                  </SelectItem>
                                  <SelectItem
                                    value="days"
                                    className="min-h-11 rounded-md text-sm font-medium focus:bg-muted data-[state=checked]:text-primary"
                                  >
                                    Fewest days
                                  </SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <SavePlanButton
                              onClick={openSave}
                              disabled={!canSavePlan}
                            />
                            {dirty ? updatePreviewAction : (
                              <button
                                type="button"
                                disabled={
                                  busy || applying || phase === "error"
                                }
                                onClick={keepSchedule}
                                className="inline-flex min-h-11 flex-1 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-primary/30 disabled:opacity-50 sm:flex-none"
                              >
                                {applying ? (
                                  <Loader2
                                    aria-hidden="true"
                                    className="h-4 w-4 motion-safe:animate-spin"
                                  />
                                ) : (
                                  <Check aria-hidden="true" className="h-4 w-4" />
                                )}
                                {applying ? "Applying…" : "Use schedule"}
                              </button>
                            )}
                          </div>
                        </div>
                        {searchStatus && (
                          <p
                            role="status"
                            className="mt-2 text-xs text-muted-foreground"
                          >
                            {searchStatus}
                          </p>
                        )}
                      </div>
                    )}
                    {!shown && phase === "complete" && !dirty && (
                      <div className="mb-4 rounded-md border border-border bg-card p-8 text-center">
                        <h2 className="text-base font-semibold">
                          No schedules fit these courses
                        </h2>
                        <p className="mt-2 text-sm text-muted-foreground">
                          {sourceCourses.some((course) => course.issues.length)
                            ? "Check the skipped options or try a different course combination."
                            : "Their meeting times conflict with each other or with your personal events. Try changing the course list."}
                        </p>
                        <button
                          type="button"
                          onClick={editCourses}
                          className="mt-4 min-h-11 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
                        >
                          Edit courses
                        </button>
                      </div>
                    )}
                    {!shown && phase === "stopped" && !dirty && (
                      <button
                        type="button"
                        onClick={generate}
                        className="mb-3 mr-4 min-h-11 rounded-md border border-border px-4 text-sm font-medium hover:bg-muted"
                      >
                        Start again
                      </button>
                    )}
                  </>
                )}
              </div>
            </header>
            {shown && generationProgress}
            <TabsContent value="weekly" className="mt-0">
              {!waitingForFirstResult && (
                <WeekCalendar
                  className="rounded-none border-0"
                  events={calendarEvents}
                  rangeEvents={savedPreview ? displayedEvents : rangeEvents}
                  focusHours={true}
                  highlightedCourse={highlightedCourse}
                  changedIds={changedIds}
                  onRemove={
                    previewing || savedPreview ? undefined : removeSavedEvent
                  }
                />
              )}
            </TabsContent>
            <TabsContent value="exams" className="mt-0">
              {!waitingForFirstResult && (
                <ExamSchedule
                  {...examSchedule}
                  courseCount={courseCount}
                  hasDraftCourses={visibleCourses.length > 0}
                  examOnlyCourses={termExamCourses}
                  onRemoveCourse={deleteEventsByCourseId}
                />
              )}
            </TabsContent>
          </Tabs>
        </section>
      </div>
    </div>
  );
}
