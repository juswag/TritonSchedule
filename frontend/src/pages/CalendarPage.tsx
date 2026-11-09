import { type CSSProperties, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, MapPin, Plus, Trash2 } from "lucide-react";
import { useCalendar } from "@/context/CalendarContext";
import { CalendarEvent, Weekday } from "@/types/calendar";
import { cn } from "@/lib/utils";
import { getCourseCode } from "@/lib/courseLabels";
import { eventsOverlap } from "@/lib/scheduleConflicts";
import { getExamSchedule } from "@/lib/examSchedule";
import ExamSchedule from "@/components/ExamSchedule";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const HOUR_HEIGHT = 64;
const GRID_TOP_GUTTER = 16;
const START_HOUR = 7;
const END_HOUR = 22;
const HOURS = Array.from({ length: END_HOUR - START_HOUR }, (_, index) => START_HOUR + index);
const WEEK_DAYS: Array<{ key: Weekday; label: string; shortLabel: string }> = [
  { key: "Mon", label: "Monday", shortLabel: "Mon" },
  { key: "Tue", label: "Tuesday", shortLabel: "Tue" },
  { key: "Wed", label: "Wednesday", shortLabel: "Wed" },
  { key: "Thu", label: "Thursday", shortLabel: "Thu" },
  { key: "Fri", label: "Friday", shortLabel: "Fri" },
];

function parseTime(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours + minutes / 60;
}

function getEventStyle(event: CalendarEvent, columnCount: number, column: number) {
  const startTime = parseTime(event.startTime);
  const endTime = parseTime(event.endTime);
  const duration = endTime - startTime;
  const top = GRID_TOP_GUTTER + (startTime - START_HOUR) * HOUR_HEIGHT;
  const height = Math.max(duration * HOUR_HEIGHT, 34);
  const width = `${100 / columnCount}%`;
  const left = `${(column * 100) / columnCount}%`;

  return { top, height, width, left };
}

function layoutDay(events: CalendarEvent[]) {
  const ordered = [...events].sort((a, b) => parseTime(a.startTime) - parseTime(b.startTime));
  const groups: { columnEnds: number[]; items: { event: CalendarEvent; column: number }[] }[] = [];
  for (const event of ordered) {
    const start = parseTime(event.startTime);
    let group = groups[groups.length - 1];
    if (!group || group.columnEnds.every((end) => end <= start)) {
      group = { columnEnds: [], items: [] };
      groups.push(group);
    }
    const available = group.columnEnds.findIndex((end) => end <= start);
    const column = available < 0 ? group.columnEnds.length : available;
    group.columnEnds[column] = parseTime(event.endTime);
    group.items.push({ event, column });
  }
  return groups.flatMap(({ columnEnds, items }) => items.map(({ event, column }) => ({
    event, style: getEventStyle(event, columnEnds.length, column),
  })));
}

function meetingLabel(event: CalendarEvent) {
  return event.isCourse ? getCourseCode(event.title) : event.title;
}

function ConflictMarker({ label }: { label?: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" role={label ? "img" : undefined}
      aria-label={label} aria-hidden={label ? undefined : true}
      className="shrink-0 text-amber-700 dark:text-amber-300">
      <rect width="14" height="14" rx="4" fill="currentColor" />
      <path d="M6 3h2v5H6z M6 9h2v2H6z" className="fill-white dark:fill-amber-950" />
    </svg>
  );
}

export default function CalendarPage() {
  const { events, examOnlyCourses, deleteEventsByCourseId, deleteEvent } = useCalendar();
  const [activeTab, setActiveTab] = useState("weekly");
  const examSchedule = useMemo(() => getExamSchedule(events, examOnlyCourses), [events, examOnlyCourses]);
  const [selectedMobileDay, setSelectedMobileDay] = useState<Weekday>("Mon");

  const { conflictingIds, weeklyConflicts } = useMemo(() => {
    const conflictingIds = new Set<string>();
    const pairs = new Map<string, string>();
    events.forEach((first, index) => {
      for (const second of events.slice(index + 1)) {
        if (!eventsOverlap(first, second)) continue;
        conflictingIds.add(first.id);
        conflictingIds.add(second.id);
        const key = JSON.stringify([first, second].map(event =>
          event.isCourse ? ["course", event.courseId || meetingLabel(event)] : ["event", event.id]
        ).sort());
        if (!pairs.has(key)) pairs.set(key, `${meetingLabel(first)} and ${meetingLabel(second)} overlap.`);
      }
    });
    return { conflictingIds, weeklyConflicts: Array.from(pairs) };
  }, [events]);

  const courseCount = useMemo(
    () => new Set([
      ...events.filter((event) => event.isCourse).map((event) => event.courseId || event.id),
      ...examOnlyCourses.map((course) => course.id),
    ]).size,
    [events, examOnlyCourses]
  );

  const removeEvent = (event: CalendarEvent) => {
    if (event.isCourse && event.courseId) {
      deleteEventsByCourseId(event.courseId);
      return;
    }

    deleteEvent(event.id);
  };

  const mobileEvents = useMemo(
    () => events.filter((event) => event.dayOfWeek === selectedMobileDay).sort((a, b) => parseTime(a.startTime) - parseTime(b.startTime)),
    [events, selectedMobileDay]
  );

  return (
    <div className="min-h-[calc(100vh-72px)] bg-[#fcfdff] dark:bg-background px-4 py-6 sm:px-7">
      <div className="mx-auto w-full max-w-[1440px]">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-[-0.025em] text-foreground">Your schedule</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {activeTab === "weekly" ? "Monday through Friday" : "Exams for your selected courses"}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">
              {courseCount} {courseCount === 1 ? "course" : "courses"}
            </span>
            <Link
              to="/courses"
              className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <Plus className="h-4 w-4" />
              Add course
            </Link>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList aria-label="Schedule views" className="mb-6 h-auto w-full justify-start gap-2 rounded-none border-b border-border bg-transparent p-0">
            <TabsTrigger value="weekly" className="rounded-none border-b-2 border-transparent px-3 py-3 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-primary data-[state=active]:shadow-none">
              Weekly classes
            </TabsTrigger>
            <TabsTrigger value="exams" className="gap-2 rounded-none border-b-2 border-transparent px-3 py-3 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-primary data-[state=active]:shadow-none">
              Exams
              {examSchedule.conflicts.length > 0 && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 text-xs font-medium text-amber-800 dark:text-amber-200">
                  <AlertTriangle aria-hidden="true" className="h-3.5 w-3.5" />
                  {examSchedule.conflicts.length} {examSchedule.conflicts.length === 1 ? "conflict" : "conflicts"}
                </span>
              )}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="weekly" className="mt-0">
            {weeklyConflicts.length > 0 && (
              <section aria-label="Weekly schedule conflicts" className="mb-4 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                <h2 className="flex items-center gap-2 font-semibold">
                  <ConflictMarker />
                  Weekly schedule conflict{weeklyConflicts.length > 1 ? "s" : ""}
                </h2>
                <ul className="mt-1 space-y-1">
                  {weeklyConflicts.map(([key, message]) => <li key={key}>{message}</li>)}
                </ul>
              </section>
            )}
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <div className="sm:hidden">
            <div className="grid grid-cols-5 border-b border-border">
              {WEEK_DAYS.map((day) => (
                <button
                  key={day.key}
                  type="button"
                  onClick={() => setSelectedMobileDay(day.key)}
                  className={cn(
                    "relative px-1 py-3 text-xs font-medium transition-colors",
                    selectedMobileDay === day.key
                      ? "bg-primary/[0.055] text-primary after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:bg-primary"
                      : "text-muted-foreground"
                  )}
                >
                  {day.shortLabel}
                </button>
              ))}
            </div>

            {mobileEvents.length === 0 ? (
              <div className="px-5 py-14 text-center">
                <p className="text-sm font-semibold text-foreground">No classes on {selectedMobileDay}</p>
                <p className="mt-1 text-sm text-muted-foreground">Choose another day or add a course.</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {mobileEvents.map((event) => (
                  <div key={event.id} className="flex items-start gap-3 px-4 py-4">
                    <span className="mt-1 h-3 w-3 shrink-0 rounded-sm" style={{ backgroundColor: event.color }} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-foreground">{event.title}</p>
                      {conflictingIds.has(event.id) && (
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-800 dark:text-amber-200">
                          <ConflictMarker />
                          Time conflict
                        </span>
                      )}
                      <p className="mt-1 text-xs text-muted-foreground">
                        {formatTo12Hour(event.startTime)} - {formatTo12Hour(event.endTime)}
                      </p>
                      {(event.isCourse || event.location) && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {event.location || "Location unavailable"}
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => removeEvent(event)}
                      className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                      aria-label={`Remove ${event.title}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="hidden sm:block">
            <div className="max-h-[calc(100vh-12.5rem)] overflow-auto">
              <div className="sticky top-0 z-30 grid min-w-[760px] grid-cols-[64px_repeat(5,minmax(130px,1fr))] border-b border-border bg-muted/95 backdrop-blur-sm">
                <div className="flex items-center justify-center border-r border-border text-xs font-medium text-muted-foreground">Time</div>
                {WEEK_DAYS.map((day) => (
                  <div key={day.key} className="border-r border-border px-3 py-3 text-center text-sm font-medium text-foreground last:border-r-0">
                    {day.label}
                  </div>
                ))}
              </div>

              <div
                className="grid min-w-[760px] grid-cols-[64px_repeat(5,minmax(130px,1fr))]"
                style={{ height: `${GRID_TOP_GUTTER + HOURS.length * HOUR_HEIGHT}px` }}
              >
                <div className="relative border-r border-border bg-card">
                  {HOURS.map((hour, index) => (
                    <span
                      key={hour}
                      className="absolute right-2 -translate-y-1/2 bg-card px-1 text-[10px] font-medium leading-none text-muted-foreground"
                      style={{ top: `${GRID_TOP_GUTTER + index * HOUR_HEIGHT}px` }}
                    >
                      {formatHour(hour)}
                    </span>
                  ))}
                </div>

                {WEEK_DAYS.map((day) => {
                  const dayEvents = events.filter((event) => event.dayOfWeek === day.key);
                  return (
                    <div key={day.key} className="relative border-r border-border last:border-r-0">
                      {HOURS.map((hour, index) => (
                        <div
                          key={hour}
                          className="absolute inset-x-0 border-t border-border/75"
                          style={{ top: `${GRID_TOP_GUTTER + index * HOUR_HEIGHT}px` }}
                        />
                      ))}

                      {layoutDay(dayEvents).map(({ event, style }) => {
                        const hasConflict = conflictingIds.has(event.id);
                        const blockTitle = meetingLabel(event);
                        return (
                          <div
                            key={event.id}
                            className="absolute z-10 p-0.5"
                            style={{ top: `${style.top}px`, height: `${style.height}px`, width: style.width, left: style.left }}
                          >
                            <div
                              className={cn(
                                "schedule-event group relative flex h-full flex-col overflow-hidden rounded-[5px] border px-2",
                                style.height >= 72 ? "gap-1 py-2" : style.height >= 52 ? "gap-0.5 py-0.5" : "py-0.5"
                              )}
                              title={`${event.title}\n${formatTo12Hour(event.startTime)} - ${formatTo12Hour(event.endTime)}${event.isCourse || event.location ? `\n${event.location || "Location unavailable"}` : ""}`}
                              style={{ "--event-color": event.color } as CSSProperties}
                            >
                              <div className={cn("flex min-w-0 shrink-0 items-center", hasConflict ? "gap-1.5" : "justify-between gap-2")}>
                                {hasConflict && <ConflictMarker label="Time conflict" />}
                                <p className={cn(
                                  "truncate text-xs font-semibold",
                                  style.height >= 52 ? "leading-[14px]" : "leading-3"
                                )}>
                                  {blockTitle}
                                </p>
                                {event.eventType && !hasConflict && (
                                  <span className="max-w-[40%] truncate text-[10px] leading-3 opacity-80">{event.eventType}</span>
                                )}
                              </div>
                              {style.height >= 48 && (
                                <p className="shrink-0 truncate text-[10px] leading-3 opacity-80">
                                  {formatTo12Hour(event.startTime)} – {formatTo12Hour(event.endTime)}
                                </p>
                              )}
                              {(event.isCourse || event.location) && (
                                <div className="flex min-w-0 shrink-0 items-center gap-1 text-[10px] font-medium leading-3">
                                  <MapPin aria-hidden="true" className="h-2.5 w-2.5 shrink-0" />
                                  <span className="truncate" title={event.location || "Location unavailable"}>
                                    {event.location || "Location unavailable"}
                                  </span>
                                </div>
                              )}
                              <button
                                type="button"
                                onClick={() => removeEvent(event)}
                                className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded bg-card/95 text-muted-foreground opacity-0 shadow-sm transition hover:text-destructive focus:opacity-100 group-hover:opacity-100"
                                aria-label={`Remove ${event.title}`}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
          </TabsContent>
          <TabsContent value="exams" className="mt-0">
            <ExamSchedule {...examSchedule} courseCount={courseCount} examOnlyCourses={examOnlyCourses} onRemoveCourse={deleteEventsByCourseId} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function formatHour(hour: number): string {
  if (hour === 12) return "12 PM";
  return hour > 12 ? `${hour - 12} PM` : `${hour} AM`;
}

function formatTo12Hour(time: string): string {
  const [hours, minutes] = time.split(":").map(Number);
  const period = hours >= 12 ? "PM" : "AM";
  return `${hours % 12 || 12}:${String(minutes).padStart(2, "0")} ${period}`;
}
