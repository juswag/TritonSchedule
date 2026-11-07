import { useId } from "react";
import { Info, X } from "lucide-react";
import { Close as PopoverClose } from "@radix-ui/react-popover";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { ScheduleCourse } from "@/types/generation";

export function SkippedOptions({ courses }: { courses: ScheduleCourse[] }) {
  const headingId = useId();
  const affected = new Map<string, Set<string>>();
  for (const course of courses) {
    const sameCode = courses.some(
      (other) => other.key !== course.key && other.code === course.code,
    );
    const name = sameCode ? `${course.code} · ${course.title}` : course.code;
    for (const reason of course.issues) {
      const names = affected.get(reason) ?? new Set<string>();
      names.add(name);
      affected.set(reason, names);
    }
  }
  if (!affected.size) return null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="plan-button quiet section-notes-trigger text-muted-foreground"
          title="Skipped options"
        >
          <Info aria-hidden="true" size={16} />
          <span>Skipped options</span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        aria-labelledby={headingId}
        align="start"
        collisionPadding={12}
        className="max-h-[var(--radix-popover-content-available-height)] w-80 max-w-[calc(100vw-24px)] overflow-y-auto motion-reduce:!animate-none data-[state=closed]:!animate-none"
      >
        <h3 id={headingId} className="mb-2 pr-8 text-sm font-semibold">
          Skipped section options
        </h3>
        <PopoverClose
          aria-label="Close skipped options"
          className="absolute right-1 top-1 grid size-11 place-items-center rounded-md text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
        >
          <X size={16} aria-hidden="true" />
        </PopoverClose>
        <ul className="space-y-3 text-sm">
          {Array.from(affected, ([reason, names]) => (
            <li key={reason}>
              <p className="font-medium">{Array.from(names).join(", ")}</p>
              <p className="mt-0.5 text-muted-foreground">{reason}</p>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
