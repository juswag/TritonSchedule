import { Fragment, useId } from "react";
import { AlertTriangle, Trash2 } from "lucide-react";
import type { CalendarCourse } from "@/types/calendar";
import type { ExamConflict, ScheduledExam } from "@/lib/examSchedule";

type ExamScheduleProps = {
  exams: ScheduledExam[];
  conflicts: ExamConflict[];
  missingCourses: { id: string; title: string }[];
  courseCount: number;
  examOnlyCourses?: CalendarCourse[];
  onRemoveCourse?: (courseId: string) => void;
};

export default function ExamSchedule({ exams, conflicts, missingCourses, courseCount, examOnlyCourses = [], onRemoveCourse }: ExamScheduleProps) {
  const id = useId();
  const conflictId = (conflict: ExamConflict) => `${id}-conflict-${encodeURIComponent(conflict.id)}`;

  if (courseCount === 0) {
    return (
      <div className="rounded-lg border border-border bg-white px-5 py-14 text-center">
        <p className="text-sm font-semibold text-foreground">Add courses to see their exam details</p>
        <p className="mt-1 text-sm text-muted-foreground">Your selected courses’ midterms and finals will appear here.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {examOnlyCourses.length > 0 && (
        <ul aria-label="Courses without weekly meetings" className="divide-y divide-border rounded-lg border border-border bg-white">
          {examOnlyCourses.map((course) => (
            <li key={course.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
              <div className="min-w-0">
                <p className="font-medium" style={{ color: course.color }}>{course.title}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">No weekly meetings</p>
              </div>
              <button type="button" onClick={() => onRemoveCourse?.(course.id)} aria-label={`Remove ${course.title}`} className="shrink-0 rounded-md p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
                <Trash2 aria-hidden="true" className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {missingCourses.length > 0 && (
        <p className="rounded-lg border border-border bg-white px-4 py-3 text-sm text-muted-foreground">
          Exam details weren’t saved for {missingCourses.map((course) => course.title).join(", ")}.
          {" "}Remove and re-add these courses to load their exams.
        </p>
      )}
      {(["midterm", "final"] as const).map((type) => {
        const sectionExams = exams.filter((exam) => exam.type === type);
        const title = type === "midterm" ? "Midterms" : "Finals";
        return (
          <section key={type} aria-labelledby={`${id}-${type}`}>
            <h2 id={`${id}-${type}`} className="mb-3 text-xl font-semibold tracking-tight text-foreground">{title}</h2>
            <div className="overflow-hidden rounded-lg border border-border bg-white">
              {sectionExams.length === 0 ? (
                <p className="px-5 py-8 text-sm text-muted-foreground">No {type} details available.</p>
              ) : (
                <table role="table" aria-labelledby={`${id}-${type}`} className="block w-full table-fixed text-left text-sm md:table">
                  <colgroup className="hidden md:table-column-group">
                    <col className="w-[22%]" />
                    <col className="w-[34%]" />
                    <col className="w-[28%]" />
                    <col className="w-[16%]" />
                  </colgroup>
                  <thead role="rowgroup" className="sr-only bg-muted/60 text-muted-foreground md:not-sr-only md:table-header-group">
                    <tr role="row">
                      <th scope="col" className="px-5 py-3 font-medium">Date</th>
                      <th scope="col" className="px-5 py-3 font-medium">Course</th>
                      <th scope="col" className="px-5 py-3 font-medium">Time</th>
                      <th scope="col" className="px-5 py-3 font-medium">Location</th>
                    </tr>
                  </thead>
                  <tbody role="rowgroup" className="block md:table-row-group">
                    {sectionExams.map((exam) => {
                      const related = conflicts.filter((conflict) => conflict.first.id === exam.id || conflict.second.id === exam.id);
                      const notices = conflicts.filter((conflict) => {
                        // Finals render after midterms, even if their dates are interleaved.
                        const lastDisplayed = conflict.first.type !== conflict.second.type
                          ? (conflict.first.type === "final" ? conflict.first : conflict.second)
                          : conflict.second;
                        return lastDisplayed.id === exam.id;
                      });
                      return (
                        <Fragment key={exam.id}>
                          <tr role="row" className="block border-t border-border px-4 py-3 first:border-t-0 md:table-row md:p-0 md:first:border-t">
                            <td role="cell" className="block py-1 font-medium text-foreground md:table-cell lg:whitespace-nowrap md:px-5 md:py-4">{exam.dateLabel}</td>
                            <td role="cell" className="block py-1 md:table-cell md:px-5 md:py-4">
                              <span className="flex items-start gap-2.5 font-medium" style={{ color: exam.color }}>
                                <span aria-hidden="true" className="mt-1 h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: exam.color }} />
                                <span>{exam.courseTitle}</span>
                              </span>
                            </td>
                            <td role="cell" aria-describedby={related.length ? related.map(conflictId).join(" ") : undefined} className="block py-1 text-foreground md:table-cell lg:whitespace-nowrap md:px-5 md:py-4">
                              <span className="flex items-center gap-2">
                                {related.length > 0 && <AlertTriangle aria-label="Exam time conflict" className="h-4 w-4 shrink-0 text-amber-700" />}
                                {exam.timeLabel}
                              </span>
                            </td>
                            <td role="cell" className="block py-1 text-muted-foreground md:table-cell md:px-5 md:py-4">
                              <span className="md:hidden">Location: </span>{exam.location || "TBD"}
                            </td>
                          </tr>
                          {notices.map((conflict) => (
                            <tr role="row" key={conflict.id} className="block border-t border-amber-200/70 bg-amber-50 md:table-row">
                              <td role="cell" colSpan={4} className="block px-4 py-3 md:table-cell md:px-5">
                                <p id={conflictId(conflict)} className="flex items-center gap-2.5 font-semibold text-amber-800">
                                  <AlertTriangle aria-hidden="true" className="h-5 w-5 shrink-0" />
                                  <span>{conflict.first.courseCode} and {conflict.second.courseCode} overlap</span>
                                </p>
                              </td>
                            </tr>
                          ))}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
