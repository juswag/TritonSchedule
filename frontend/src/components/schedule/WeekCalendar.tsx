import {
  type CSSProperties,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { MapPin, Trash2 } from "lucide-react";
import type { CalendarEvent, Weekday } from "@/types/calendar";
import { cn } from "@/lib/utils";
import { getCourseCode } from "@/lib/courseLabels";
import { useLayoutMotion } from "@/hooks/useLayoutMotion";

const HOUR_HEIGHT = 64;
const GRID_TOP_GUTTER = 16;
const START_HOUR = 7;
const END_HOUR = 22;
const WEEK_DAYS: Array<{ key: Weekday; label: string; shortLabel: string }> = [
  { key: "Mon", label: "Monday", shortLabel: "Mon" },
  { key: "Tue", label: "Tuesday", shortLabel: "Tue" },
  { key: "Wed", label: "Wednesday", shortLabel: "Wed" },
  { key: "Thu", label: "Thursday", shortLabel: "Thu" },
  { key: "Fri", label: "Friday", shortLabel: "Fri" },
  { key: "Sat", label: "Saturday", shortLabel: "Sat" },
  { key: "Sun", label: "Sunday", shortLabel: "Sun" },
];

function parseTime(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours + minutes / 60;
}

function getEventStyle(
  event: CalendarEvent,
  overlappingEvents: CalendarEvent[],
  index: number,
  startHour: number,
  hourHeight: number,
) {
  const startTime = parseTime(event.startTime);
  const endTime = parseTime(event.endTime);
  const duration = endTime - startTime;
  const top = GRID_TOP_GUTTER + (startTime - startHour) * hourHeight;
  const height = Math.max(duration * hourHeight, 34);
  const overlapCount = overlappingEvents.length;
  const width = overlapCount > 1 ? `${100 / overlapCount}%` : "100%";
  const left = overlapCount > 1 ? `${(index * 100) / overlapCount}%` : "0";

  return { top, height, width, left };
}

function findOverlappingEvents(
  event: CalendarEvent,
  allEvents: CalendarEvent[],
): CalendarEvent[] {
  const eventStart = parseTime(event.startTime);
  const eventEnd = parseTime(event.endTime);

  return allEvents.filter((other) => {
    if (other.dayOfWeek !== event.dayOfWeek) return false;
    return (
      eventStart < parseTime(other.endTime) &&
      eventEnd > parseTime(other.startTime)
    );
  });
}

export function WeekCalendar({
  events,
  onRemove,
  rangeEvents = events,
  focusHours = false,
  highlightedCourse = null,
  changedIds = new Set<string>(),
  className,
}: {
  events: CalendarEvent[];
  rangeEvents?: CalendarEvent[];
  focusHours?: boolean;
  highlightedCourse?: string | null;
  changedIds?: Set<string>;
  onRemove?: (event: CalendarEvent) => void;
  className?: string;
}) {
  const calendarRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const [viewportSpace, setViewportSpace] = useState({ height: 0, header: 45 });
  useLayoutEffect(() => {
    const measure = () => {
      if (!calendarRef.current) return;
      const height = Math.max(
        320,
        window.innerHeight -
          (calendarRef.current.getBoundingClientRect().top + window.scrollY) -
          26,
      );
      const header = headerRef.current?.getBoundingClientRect().height || 45;
      setViewportSpace((current) =>
        current.height === height && current.header === header
          ? current
          : { height, header },
      );
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  });
  const [selectedMobileDay, setSelectedMobileDay] = useState<Weekday>("Mon");
  const weekDays = WEEK_DAYS.filter(
    (day) =>
      !["Sat", "Sun"].includes(day.key) ||
      events.some((event) => event.dayOfWeek === day.key),
  );
  const activeMobileDay = weekDays.some((day) => day.key === selectedMobileDay)
    ? selectedMobileDay
    : "Mon";
  const starts = rangeEvents
    .map((event) => Math.floor(parseTime(event.startTime)))
    .filter(Number.isFinite);
  const ends = rangeEvents
    .map((event) => Math.ceil(parseTime(event.endTime)))
    .filter(Number.isFinite);
  let startHour = Math.max(
    0,
    focusHours && starts.length
      ? Math.min(...starts) - 1
      : Math.min(START_HOUR, ...starts),
  );
  let endHour = Math.min(
    24,
    focusHours && ends.length
      ? Math.max(...ends) + 1
      : Math.max(END_HOUR, ...ends),
  );
  // Keep the first class near the top and use spare viewport space for later hours.
  const requiredHours = Math.min(
    24,
    Math.max(
      6,
      Math.ceil(
        (viewportSpace.height - viewportSpace.header - GRID_TOP_GUTTER) / 96,
      ),
    ),
  );
  endHour = Math.min(24, Math.max(endHour, startHour + requiredHours));
  startHour = Math.max(0, Math.min(startHour, endHour - requiredHours));
  const hours = Array.from(
    { length: endHour - startHour },
    (_, index) => startHour + index,
  );
  const hourHeight = Math.max(
    HOUR_HEIGHT,
    (viewportSpace.height - viewportSpace.header - GRID_TOP_GUTTER) /
      hours.length,
  );
  const gridTemplateColumns = `64px repeat(${weekDays.length}, minmax(0, 1fr))`;
  const mobileEvents = useMemo(
    () =>
      events
        .filter((event) => event.dayOfWeek === activeMobileDay)
        .sort((a, b) => parseTime(a.startTime) - parseTime(b.startTime)),
    [events, activeMobileDay],
  );
  const motionKeys = useMemo(() => {
    const counts = new Map<string, number>();
    return new Map(
      [...events]
        .sort((a, b) => a.startTime.localeCompare(b.startTime))
        .map((event) => {
          const group = `${event.courseKey || event.id}:${event.eventType || "event"}:${event.dayOfWeek}`;
          const count = counts.get(group) || 0;
          counts.set(group, count + 1);
          return [event.id, `${group}:${count}`];
        }),
    );
  }, [events]);
  const motionRevision = `${events.map((event) => `${event.id}:${event.dayOfWeek}:${event.startTime}:${event.endTime}`).join("|")}:${activeMobileDay}:${startHour}:${hourHeight}`;
  useLayoutMotion(calendarRef, motionRevision, 320);
  return (
    <div
      ref={calendarRef}
      className={cn(
        "relative overflow-hidden rounded-lg border border-border bg-card",
        className,
      )}
    >
      <div className="sm:hidden">
        <div
          className="grid border-b border-border"
          style={{
            gridTemplateColumns: `repeat(${weekDays.length}, minmax(0, 1fr))`,
          }}
        >
          {weekDays.map((day) => (
            <button
              key={day.key}
              type="button"
              onClick={() => setSelectedMobileDay(day.key)}
              className={cn(
                "relative px-1 py-3 text-sm font-medium transition-colors",
                activeMobileDay === day.key
                  ? "bg-primary/[0.055] text-primary after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:bg-primary"
                  : "text-muted-foreground",
              )}
            >
              {day.shortLabel}
            </button>
          ))}
        </div>

        {mobileEvents.length === 0 ? (
          <div className="px-5 py-14 text-center">
            <p className="text-sm font-semibold text-foreground">
              No classes on {activeMobileDay}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {mobileEvents.map((event) => (
              <div
                key={motionKeys.get(event.id)}
                data-motion-key={`mobile:${motionKeys.get(event.id)}`}
                data-course-key={event.courseKey}
                data-changed={changedIds.has(event.id) || undefined}
                className={cn(
                  "flex items-start gap-3 px-4 py-4 transition-opacity motion-reduce:transition-none",
                  highlightedCourse &&
                    event.courseKey !== highlightedCourse &&
                    "opacity-30",
                  changedIds.has(event.id) && "schedule-meeting-changed",
                )}
              >
                <span
                  className="mt-1 h-3 w-3 shrink-0 rounded-sm"
                  style={{ backgroundColor: event.color }}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-foreground">
                    {event.title}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatTo12Hour(event.startTime)} -{" "}
                    {formatTo12Hour(event.endTime)}
                  </p>
                  {(event.isCourse || event.location) && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {event.location || "Location unavailable"}
                    </p>
                  )}
                </div>
                {onRemove && (
                  <button
                    type="button"
                    onClick={() => onRemove(event)}
                    className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                    aria-label={`Remove ${event.title}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="hidden sm:block">
        <div
          className="overflow-auto"
          style={{ maxHeight: viewportSpace.height || undefined }}
        >
          <div
            ref={headerRef}
            className="sticky top-0 z-30 grid min-w-[580px] border-b border-border bg-muted/50"
            style={{ gridTemplateColumns }}
          >
            <div className="flex items-center justify-center border-r border-border text-xs font-medium text-muted-foreground">
              Time
            </div>
            {weekDays.map((day) => (
              <div
                key={day.key}
                className="border-r border-border px-3 py-3 text-center text-sm font-medium text-foreground last:border-r-0"
              >
                {day.label}
              </div>
            ))}
          </div>

          <div
            className="grid min-w-[580px]"
            style={{
              height: `${GRID_TOP_GUTTER + hours.length * hourHeight}px`,
              gridTemplateColumns,
            }}
          >
            <div className="relative border-r border-border bg-card">
              {hours.map((hour, index) => (
                <span
                  key={hour}
                  className="absolute right-2 -translate-y-1/2 bg-card px-1 text-xs font-medium leading-none text-muted-foreground"
                  style={{ top: `${GRID_TOP_GUTTER + index * hourHeight}px` }}
                >
                  {formatHour(hour)}
                </span>
              ))}
            </div>

            {weekDays.map((day) => {
              const dayEvents = events.filter(
                (event) => event.dayOfWeek === day.key,
              );
              return (
                <div
                  key={day.key}
                  className="relative border-r border-border/50 last:border-r-0"
                >
                  {hours.map((hour, index) => (
                    <div
                      key={hour}
                      className="absolute inset-x-0 border-t border-border/40"
                      style={{
                        top: `${GRID_TOP_GUTTER + index * hourHeight}px`,
                      }}
                    />
                  ))}

                  {dayEvents.map((event) => {
                    const overlapping = findOverlappingEvents(event, dayEvents);
                    const index = overlapping.findIndex(
                      (item) => item.id === event.id,
                    );
                    const style = getEventStyle(
                      event,
                      overlapping,
                      index,
                      startHour,
                      hourHeight,
                    );
                    const blockTitle = event.isCourse
                      ? getCourseCode(event.title)
                      : event.title;
                    return (
                      <div
                        key={motionKeys.get(event.id)}
                        data-motion-key={`week:${motionKeys.get(event.id)}`}
                        data-course-key={event.courseKey}
                        data-changed={changedIds.has(event.id) || undefined}
                        className={cn(
                          "absolute z-10 p-0.5 transition-opacity motion-reduce:transition-none",
                          highlightedCourse &&
                            event.courseKey !== highlightedCourse &&
                            "opacity-25",
                        )}
                        style={{
                          top: `${style.top}px`,
                          height: `${style.height}px`,
                          width: style.width,
                          left: style.left,
                        }}
                      >
                        <div
                          className={cn(
                            "schedule-event group relative flex h-full flex-col overflow-hidden rounded-md border px-2.5",
                            changedIds.has(event.id) &&
                              "schedule-meeting-changed",
                            highlightedCourse === event.courseKey &&
                              "ring-2 ring-current ring-offset-1",
                            style.height >= 72
                              ? "gap-1 py-2"
                              : style.height >= 52
                                ? "gap-0.5 py-0.5"
                                : "py-0.5",
                          )}
                          title={`${event.title}\n${formatTo12Hour(event.startTime)} - ${formatTo12Hour(event.endTime)}${event.isCourse || event.location ? `\n${event.location || "Location unavailable"}` : ""}`}
                          style={
                            { "--event-color": event.color } as CSSProperties
                          }
                        >
                          <div className="flex min-w-0 shrink-0 items-baseline justify-between gap-2">
                            <p className="truncate text-sm font-semibold leading-4">
                              {blockTitle}
                            </p>
                            {event.eventType && overlapping.length === 1 && (
                              <span className="max-w-[40%] truncate text-xs leading-3">
                                {event.eventType}
                              </span>
                            )}
                          </div>
                          {style.height >= 48 && (
                            <p className="shrink-0 truncate text-xs leading-3">
                              {formatTo12Hour(event.startTime)} –{" "}
                              {formatTo12Hour(event.endTime)}
                            </p>
                          )}
                          {(event.isCourse || event.location) && (
                            <div className="flex min-w-0 shrink-0 items-center gap-1 text-xs leading-3">
                              <MapPin
                                aria-hidden="true"
                                className="h-2.5 w-2.5 shrink-0"
                              />
                              <span
                                className="truncate"
                                title={event.location || "Location unavailable"}
                              >
                                {event.location || "Location unavailable"}
                              </span>
                            </div>
                          )}
                          {onRemove && (
                            <button
                              type="button"
                              onClick={() => onRemove(event)}
                              className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded bg-card/95 text-muted-foreground opacity-0 shadow-sm transition hover:text-destructive focus:opacity-100 group-hover:opacity-100"
                              aria-label={`Remove ${event.title}`}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
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
  );
}
function formatHour(hour: number): string {
  if (hour === 0) return "12 AM";
  if (hour === 12) return "12 PM";
  return hour > 12 ? `${hour - 12} PM` : `${hour} AM`;
}

function formatTo12Hour(time: string): string {
  const [hours, minutes] = time.split(":").map(Number);
  const period = hours % 24 >= 12 ? "PM" : "AM";
  return `${hours % 12 || 12}:${String(minutes).padStart(2, "0")} ${period}`;
}
