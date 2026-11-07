import { useId } from "react";
import {
  AlertTriangle,
  CalendarDays,
  ChevronDown,
  Clock3,
  MapPin,
  Trash2,
} from "lucide-react";
import type { CalendarCourse } from "@/types/calendar";
import type { ExamConflict, ScheduledExam } from "@/lib/examSchedule";

type ExamScheduleProps = {
  exams: ScheduledExam[];
  conflicts: ExamConflict[];
  missingCourses: { id: string; title: string }[];
  courseCount: number;
  hasDraftCourses: boolean;
  examOnlyCourses?: CalendarCourse[];
  onRemoveCourse?: (courseId: string) => void;
};

// The exam parser stores campus wall-clock times as UTC timestamps.
const clock = new Intl.DateTimeFormat("en-US", {
  timeStyle: "short",
  timeZone: "UTC",
});

function overlapTime({ first, second }: ExamConflict) {
  if (
    first.start === null ||
    second.start === null ||
    first.end === null ||
    second.end === null
  )
    return first.dateLabel;
  const start = clock.format(Math.max(first.start, second.start));
  const end = clock.format(Math.min(first.end, second.end));
  return `${first.dateLabel} · ${start} – ${end}`;
}

function ExamDates({
  title,
  exams,
  conflictIds,
}: {
  title: string;
  exams: ScheduledExam[];
  conflictIds: Map<string, string[]>;
}) {
  const dates = new Map<string, ScheduledExam[]>();
  for (const exam of exams) {
    const sameDay = dates.get(exam.dateLabel);
    if (sameDay) sameDay.push(exam);
    else dates.set(exam.dateLabel, [exam]);
  }
  const headingId = useId();
  return (
    <section aria-labelledby={headingId}>
      <div className="mb-3 flex items-baseline gap-2">
        <h2 id={headingId} className="text-base font-semibold">
          {title}
        </h2>
        <span
          aria-label={`${exams.length} exams`}
          className="text-xs tabular-nums text-muted-foreground"
        >
          {exams.length}
        </span>
      </div>
      <table
        role="table"
        aria-labelledby={headingId}
        className="exam-agenda w-full table-fixed text-left text-sm"
      >
        <colgroup>
          <col className="w-[49%]" />
          <col className="w-[30%]" />
          <col />
        </colgroup>
        <thead className="sr-only">
          <tr>
            <th scope="col">Course</th>
            <th scope="col">Time</th>
            <th scope="col">Location</th>
          </tr>
        </thead>
        {Array.from(dates, ([date, meetings]) => (
          <tbody key={date} role="rowgroup">
            <tr role="row">
              <th
                scope="rowgroup"
                colSpan={3}
                className="rounded bg-muted/60 px-3 py-2 text-xs font-medium text-muted-foreground"
              >
                <span className="flex items-center gap-2">
                  <CalendarDays aria-hidden="true" size={14} />
                  {date}
                </span>
              </th>
            </tr>
            {meetings.map((exam) => {
              const related = conflictIds.get(exam.id);
              const courseName = exam.courseTitle.startsWith(exam.courseCode)
                ? exam.courseTitle
                    .slice(exam.courseCode.length)
                    .replace(/^[\s:–—-]+/, "")
                : exam.courseTitle;
              return (
                <tr key={exam.id} role="row" className="exam-entry">
                  <td role="cell" className="exam-course px-3 py-3.5">
                    <div className="flex items-baseline gap-2.5">
                      <span
                        aria-hidden="true"
                        className="size-2 shrink-0 rounded-full"
                        style={{ backgroundColor: exam.color }}
                      />
                      <div className="min-w-0 break-words">
                        <span className="font-semibold">{exam.courseCode}</span>
                        {courseName && (
                          <p className="mt-0.5 text-sm text-muted-foreground">
                            {courseName}
                          </p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td
                    role="cell"
                    aria-describedby={related?.join(" ")}
                    className="exam-time px-3 py-3.5"
                  >
                    <span className="flex items-start gap-2 tabular-nums">
                      {related ? (
                        <AlertTriangle
                          aria-label="Exam time conflict"
                          size={15}
                          className="mt-0.5 shrink-0 text-amber-700 dark:text-amber-300"
                        />
                      ) : (
                        <Clock3
                          aria-hidden="true"
                          size={15}
                          className="mt-0.5 shrink-0 text-muted-foreground"
                        />
                      )}
                      {exam.timeLabel}
                    </span>
                  </td>
                  <td role="cell" className="exam-location px-3 py-3.5">
                    <span className="flex items-start gap-1.5 break-words text-muted-foreground">
                      <MapPin
                        aria-hidden="true"
                        size={15}
                        className="mt-0.5 shrink-0"
                      />
                      {exam.location}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        ))}
      </table>
    </section>
  );
}

export default function ExamSchedule({
  exams,
  conflicts,
  missingCourses,
  courseCount,
  hasDraftCourses,
  examOnlyCourses = [],
  onRemoveCourse,
}: ExamScheduleProps) {
  const id = useId();
  const conflictId = (conflict: ExamConflict) =>
    `${id}-${encodeURIComponent(conflict.id)}`;
  const conflictIds = new Map<string, string[]>();
  for (const conflict of conflicts) {
    for (const exam of [conflict.first, conflict.second]) {
      const ids = conflictIds.get(exam.id) ?? [];
      ids.push(conflictId(conflict));
      conflictIds.set(exam.id, ids);
    }
  }
  if (!courseCount) {
    return (
      <div className="flex flex-col items-center gap-3 px-5 py-12 text-center">
        <CalendarDays
          aria-hidden="true"
          className="size-6 text-muted-foreground"
        />
        <p className="text-sm font-medium">
          {hasDraftCourses
            ? "Generate a schedule to see its exams."
            : "Add courses to see their exam details"}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 px-3 py-4 sm:px-5 sm:py-5">
      {conflicts.length > 0 && (
        <details className="group rounded-md bg-amber-50 text-amber-950 dark:bg-amber-950/40 dark:text-amber-100">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-md px-3 text-sm font-medium focus-visible:ring-2 focus-visible:ring-primary [&::-webkit-details-marker]:hidden">
            <AlertTriangle
              aria-hidden="true"
              size={16}
              className="text-amber-700 dark:text-amber-300"
            />
            {conflicts.length} exam{" "}
            {conflicts.length === 1 ? "conflict" : "conflicts"}
            <ChevronDown
              aria-hidden="true"
              size={16}
              className="ml-auto transition-transform group-open:rotate-180 motion-reduce:transition-none"
            />
          </summary>
          <ul className="space-y-2 px-3 pb-3 sm:pl-9">
            {conflicts.map((conflict) => (
              <li
                key={conflict.id}
                id={conflictId(conflict)}
                className="flex flex-wrap items-baseline gap-x-3 text-sm"
              >
                <span className="font-medium">
                  {conflict.first.courseCode} and {conflict.second.courseCode}{" "}
                  overlap
                </span>
                <span className="text-xs">{overlapTime(conflict)}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
      {missingCourses.length > 0 && (
        <p className="text-sm text-muted-foreground">
          Exam details weren’t saved for{" "}
          {missingCourses.map((course) => course.title).join(", ")}. Generate a
          new schedule or re-add these courses to load their exams.
        </p>
      )}
      {(["midterm", "final"] as const).map((type) => {
        const sittings = exams.filter((exam) => exam.type === type);
        return (
          sittings.length > 0 && (
            <ExamDates
              key={type}
              title={type === "midterm" ? "Midterms" : "Finals"}
              exams={sittings}
              conflictIds={conflictIds}
            />
          )
        );
      })}
      {!exams.length && missingCourses.length < courseCount && (
        <p className="text-sm text-muted-foreground">
          No published exam dates for{" "}
          {missingCourses.length ? "the other courses" : "this schedule"}.
        </p>
      )}
      {examOnlyCourses.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold">
            Courses without weekly meetings
          </h2>
          <ul
            aria-label="Courses without weekly meetings"
            className="mt-1 divide-y divide-border/60"
          >
            {examOnlyCourses.map((course) => (
              <li
                key={course.id}
                className="flex items-center gap-2 py-1 text-sm"
              >
                <span
                  aria-hidden="true"
                  className="size-2 shrink-0 rounded-full"
                  style={{ backgroundColor: course.color }}
                />
                <span className="min-w-0 flex-1">{course.title}</span>
                {onRemoveCourse && (
                  <button
                    type="button"
                    onClick={() => onRemoveCourse(course.id)}
                    aria-label={`Remove ${course.title}`}
                    className="plan-icon text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 aria-hidden="true" size={15} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
