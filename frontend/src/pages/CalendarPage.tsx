import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { MapPin, Plus, Trash2 } from "lucide-react";
import { useCalendar } from "@/context/CalendarContext";
import { CalendarEvent, Weekday } from "@/types/calendar";
import { cn } from "@/lib/utils";
import { getCourseCode } from "@/lib/courseLabels";

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

function getEventStyle(event: CalendarEvent, overlappingEvents: CalendarEvent[], index: number) {
  const startTime = parseTime(event.startTime);
  const endTime = parseTime(event.endTime);
  const duration = endTime - startTime;
  const top = GRID_TOP_GUTTER + (startTime - START_HOUR) * HOUR_HEIGHT;
  const height = Math.max(duration * HOUR_HEIGHT, 34);
  const overlapCount = overlappingEvents.length;
  const width = overlapCount > 1 ? `${100 / overlapCount}%` : "100%";
  const left = overlapCount > 1 ? `${(index * 100) / overlapCount}%` : "0";

  return { top, height, width, left };
}

function findOverlappingEvents(event: CalendarEvent, allEvents: CalendarEvent[]): CalendarEvent[] {
  const eventStart = parseTime(event.startTime);
  const eventEnd = parseTime(event.endTime);

  return allEvents.filter((other) => {
    if (other.dayOfWeek !== event.dayOfWeek) return false;
    return eventStart < parseTime(other.endTime) && eventEnd > parseTime(other.startTime);
  });
}

export default function CalendarPage() {
  const { events, deleteEventsByCourseId, deleteEvent } = useCalendar();
  const [selectedMobileDay, setSelectedMobileDay] = useState<Weekday>("Mon");

  const courseCount = useMemo(
    () => new Set(events.filter((event) => event.isCourse).map((event) => event.courseId || event.id)).size,
    [events]
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
    <div className="min-h-[calc(100vh-72px)] bg-[#fcfdff] px-4 py-6 sm:px-7">
      <div className="mx-auto w-full max-w-[1440px]">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-medium text-muted-foreground">Monday through Friday</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-[-0.025em] text-foreground">Weekly schedule</h1>
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

        <div className="overflow-hidden rounded-lg border border-border bg-white">
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
                <div className="relative border-r border-border bg-white">
                  {HOURS.map((hour, index) => (
                    <span
                      key={hour}
                      className="absolute right-2 -translate-y-1/2 bg-white px-1 text-[10px] font-medium leading-none text-muted-foreground"
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

                      {dayEvents.map((event) => {
                        const overlapping = findOverlappingEvents(event, dayEvents);
                        const index = overlapping.findIndex((item) => item.id === event.id);
                        const style = getEventStyle(event, overlapping, index);
                        const blockTitle = event.isCourse
                          ? getCourseCode(event.title)
                          : event.title;
                        return (
                          <div
                            key={event.id}
                            className="absolute z-10 p-0.5"
                            style={{ top: `${style.top}px`, height: `${style.height}px`, width: style.width, left: style.left }}
                          >
                            <div
                              className={cn(
                                "group relative flex h-full flex-col overflow-hidden rounded-[5px] border px-2",
                                style.height >= 72 ? "gap-1 py-2" : style.height >= 52 ? "gap-0.5 py-0.5" : "py-0.5"
                              )}
                              title={`${event.title}\n${formatTo12Hour(event.startTime)} - ${formatTo12Hour(event.endTime)}${event.isCourse || event.location ? `\n${event.location || "Location unavailable"}` : ""}`}
                              style={{
                                borderColor: event.color,
                                color: event.color,
                                backgroundColor: `color-mix(in srgb, ${event.color} 11%, white)`,
                              }}
                            >
                              <div className="flex min-w-0 shrink-0 items-baseline justify-between gap-2">
                                <p className={cn(
                                  "truncate text-xs font-semibold",
                                  style.height >= 52 ? "leading-[14px]" : "leading-3"
                                )}>
                                  {blockTitle}
                                </p>
                                {event.eventType && overlapping.length === 1 && (
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
                                className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded bg-white/95 text-muted-foreground opacity-0 shadow-sm transition hover:text-destructive focus:opacity-100 group-hover:opacity-100"
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
