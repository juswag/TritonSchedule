import { FormEvent, useEffect, useState, type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { motion, useReducedMotion } from "motion/react";
import { ArrowRight, CheckCircle2, Github, MessageCircle, Search } from "lucide-react";
import { cn } from "@/lib/utils";

const ease = [0.22, 1, 0.36, 1] as const;

const days = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const hours = ["9 AM", "10 AM", "11 AM", "12 PM"];

const mobileMeetings = [
  { day: "Mon", code: "MATH 20C", time: "10:00 – 11:20 AM", place: "AP&M 2411", color: "#D97706", delay: 0.08 },
  { day: "Tue", code: "CSE 100", time: "9:00 – 9:50 AM", place: "Center Hall 2142", color: "#2563EB", delay: 0.16 },
  { day: "Wed", code: "MATH 20C", time: "10:00 – 11:20 AM", place: "AP&M 2411", color: "#D97706", delay: 0.24 },
  { day: "Thu", code: "CSE 100", time: "9:00 – 9:50 AM", place: "Center Hall 2142", color: "#2563EB", delay: 0.32 },
];

const meetings = [
  {
    id: "cse-tue",
    code: "CSE 100",
    time: "9:00 – 9:50",
    place: "Center Hall 2142",
    column: 2,
    row: 2,
    span: 1,
    color: "#2563EB",
    delay: 0.08,
  },
  {
    id: "cse-thu",
    code: "CSE 100",
    time: "9:00 – 9:50",
    place: "Center Hall 2142",
    column: 4,
    row: 2,
    span: 1,
    color: "#2563EB",
    delay: 0.16,
  },
  {
    id: "math-mon",
    code: "MATH 20C",
    time: "10:00 – 11:20",
    place: "AP&M 2411",
    column: 1,
    row: 3,
    span: 2,
    color: "#D97706",
    delay: 0.26,
  },
  {
    id: "math-wed",
    code: "MATH 20C",
    time: "10:00 – 11:20",
    place: "AP&M 2411",
    column: 3,
    row: 3,
    span: 2,
    color: "#D97706",
    delay: 0.34,
  },
];

const steps = [
  {
    number: "01",
    title: "Search classes",
    body: "Find courses fast using code, topic, or professor.",
  },
  {
    number: "02",
    title: "Compare sections",
    body: "Review times, instructors, and ratings side by side.",
  },
  {
    number: "03",
    title: "Build your week",
    body: "Add classes and see your week come together.",
  },
];

function enter(reduce: boolean, delay = 0, inView = false) {
  if (reduce) return {};
  const transition = { duration: 0.7, delay, ease };
  if (inView) {
    return {
      initial: { opacity: 0, y: 16 },
      whileInView: { opacity: 1, y: 0 },
      viewport: { once: true, margin: "0px 0px -48px 0px" },
      transition,
    };
  }
  return {
    initial: { opacity: 0, y: 12 },
    animate: { opacity: 1, y: 0 },
    transition,
  };
}

export default function LandingPage() {
  const navigate = useNavigate();
  const reduce = useReducedMotion() === true;
  const widePlaceholder = useMediaQuery("(min-width: 360px)");
  const [query, setQuery] = useState("");

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedQuery = query.trim();
    navigate(trimmedQuery ? `/courses?q=${encodeURIComponent(trimmedQuery)}` : "/courses");
  };

  return (
    <div className="relative overflow-x-clip bg-background">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[28rem] bg-[radial-gradient(ellipse_at_top,hsl(var(--primary)/0.14),transparent_60%)] dark:bg-[radial-gradient(ellipse_at_top,hsl(var(--primary)/0.2),transparent_58%)]"
      />

      <div className="relative mx-auto max-w-5xl px-4 pb-8 pt-14 sm:px-8 sm:pt-20 lg:pt-24">
        <section aria-labelledby="landing-heading" className="mx-auto max-w-3xl text-center">
          <motion.h1
            id="landing-heading"
            {...enter(reduce, 0)}
            className="landing-display text-balance text-[2.125rem] font-semibold leading-[1.05] tracking-[-0.045em] text-foreground sm:text-5xl sm:leading-[1.02] md:text-6xl lg:text-7xl"
          >
            What are you taking
            <span className="mt-1 block text-primary">next quarter?</span>
          </motion.h1>
          <motion.p
            {...enter(reduce, 0.08)}
            className="mx-auto mt-5 max-w-md text-base leading-7 text-muted-foreground sm:mt-6 sm:text-lg"
          >
            Search the catalog and build a conflict-free week.
          </motion.p>

          <motion.form
            {...enter(reduce, 0.16)}
            onSubmit={submitSearch}
            role="search"
            className="group mx-auto mt-8 flex w-full max-w-xl flex-col gap-2 rounded-2xl border border-border bg-card p-2 shadow-sm transition-[border-color,box-shadow] duration-200 focus-within:border-primary/50 focus-within:shadow-[0_0_0_4px_hsl(var(--primary)/0.12)] sm:mt-9 sm:flex-row sm:items-center sm:rounded-full sm:p-1.5"
          >
            <label className="flex min-w-0 flex-1 items-center">
              <span className="sr-only">Search the course catalog</span>
              <Search className="ml-2 h-4 w-4 shrink-0 text-muted-foreground transition-colors duration-200 group-focus-within:text-primary" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={widePlaceholder ? "Try CSE 100, MATH 20C, or a professor" : "CSE 100 or a professor"}
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                enterKeyHint="search"
                className="h-12 min-w-0 flex-1 bg-transparent px-3 text-base text-foreground outline-none placeholder:text-muted-foreground"
              />
            </label>
            <button
              type="submit"
              className="group/cta inline-flex h-12 w-full shrink-0 items-center justify-center gap-1.5 rounded-xl bg-primary px-5 text-base font-medium text-primary-foreground transition-colors duration-200 hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:w-auto sm:rounded-full"
            >
              Search
              <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover/cta:translate-x-0.5 motion-reduce:transition-none" />
            </button>
          </motion.form>
          <motion.p {...enter(reduce, 0.22)} className="mt-4 text-sm text-muted-foreground">
            Free to use <span aria-hidden="true">·</span> No account required.
          </motion.p>
        </section>

        <ExampleWeek reduce={reduce} />
      </div>

      <section
        id="how-it-works"
        aria-labelledby="how-it-works-heading"
        className="scroll-mt-24"
      >
        <div className="mx-auto max-w-5xl px-4 py-20 sm:px-8 sm:py-28">
          <motion.h2
            id="how-it-works-heading"
            {...enter(reduce, 0, true)}
            className="landing-display text-2xl font-semibold tracking-[-0.03em] text-foreground sm:text-3xl"
          >
            How it works
          </motion.h2>
          <ol className="mt-10 grid gap-0 sm:mt-14 sm:grid-cols-3 sm:gap-12">
            {steps.map((step, index) => (
              <motion.li
                key={step.number}
                {...enter(reduce, 0.08 * index, true)}
                className="border-t border-border py-6 sm:border-t-0 sm:py-0"
              >
                <p className="text-sm font-medium tabular-nums text-primary">{step.number}</p>
                <h3 className="landing-display mt-3 text-lg font-semibold tracking-[-0.02em] text-foreground">
                  {step.title}
                </h3>
                <p className="mt-2 max-w-xs text-sm leading-6 text-muted-foreground">{step.body}</p>
              </motion.li>
            ))}
          </ol>
        </div>
      </section>

      <section id="about" aria-labelledby="about-heading" className="scroll-mt-24 border-t border-border">
        <div className="mx-auto flex max-w-5xl flex-col gap-8 px-4 py-16 sm:px-8 lg:flex-row lg:items-center lg:justify-between">
          <motion.div {...enter(reduce, 0, true)} className="max-w-xl">
            <h2
              id="about-heading"
              className="landing-display text-2xl font-semibold tracking-[-0.03em] text-foreground sm:text-3xl"
            >
              Built for students. Free for everyone.
            </h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground sm:text-base">
              TritonSchedule is a free, unofficial UC San Diego course-planning tool. No account required. We help
              students save time and make clearer schedules.
            </p>
          </motion.div>
          <motion.div {...enter(reduce, 0.08, true)} className="flex flex-wrap gap-3">
            <a
              href="https://github.com/wangj000/TritonSchedule/issues/new"
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-10 items-center gap-2 rounded-full border border-border px-4 text-sm font-medium text-foreground transition-colors duration-200 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
            >
              <MessageCircle className="h-4 w-4" aria-hidden="true" />
              Send feedback
            </a>
            <a
              href="https://github.com/wangj000/TritonSchedule"
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-10 items-center gap-2 rounded-full border border-border px-4 text-sm font-medium text-foreground transition-colors duration-200 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
            >
              <Github className="h-4 w-4" aria-hidden="true" />
              View on GitHub
            </a>
          </motion.div>
        </div>
        <p className="mx-auto max-w-5xl px-4 pb-12 text-xs leading-5 text-muted-foreground sm:px-8">
          Not affiliated with UC San Diego. Public course data is subject to change.
        </p>
      </section>
    </div>
  );
}

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia(query).matches : false,
  );

  useEffect(() => {
    const media = window.matchMedia(query);
    const update = () => setMatches(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [query]);

  return matches;
}

function ExampleWeek({ reduce }: { reduce: boolean }) {
  const wide = useMediaQuery("(min-width: 640px)");

  return (
    <motion.section
      {...enter(reduce, 0.12, true)}
      aria-label="Example schedule"
      className="mt-16 sm:mt-24"
    >
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-[0_24px_80px_-40px_rgba(15,23,42,0.45)] dark:shadow-none">
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
          <div className="flex min-w-0 items-baseline gap-3">
            <p className="whitespace-nowrap text-sm font-medium text-foreground">Your week</p>
            <p className="hidden truncate text-xs text-muted-foreground min-[380px]:block">Aug 16 – 22</p>
          </div>
          <p className="inline-flex shrink-0 items-center gap-1.5 text-sm text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
            No conflicts
          </p>
        </div>

        <p className="sr-only">
          Example week with no conflicts. CSE 100 meets Tuesday and Thursday, 9:00 to 9:50 AM, in Center Hall 2142.
          MATH 20C meets Monday and Wednesday, 10:00 to 11:20 AM, in AP&M 2411.
        </p>

        {wide ? <WeekGrid reduce={reduce} /> : <WeekList reduce={reduce} />}
      </div>
    </motion.section>
  );
}

function WeekList({ reduce }: { reduce: boolean }) {
  return (
    <ul aria-hidden="true" className="flex flex-col gap-2 px-3 py-3">
      {mobileMeetings.map((meeting) => (
        <motion.li
          key={meeting.day}
          {...enter(reduce, meeting.delay, true)}
          className="grid grid-cols-[2.25rem_minmax(0,1fr)] items-center gap-2"
        >
          <span className="text-xs font-medium text-muted-foreground">{meeting.day}</span>
          <span
            className="schedule-event min-w-0 rounded-[5px] border px-3 py-2"
            style={{ "--event-color": meeting.color } as CSSProperties}
          >
            <span className="block truncate text-sm font-semibold leading-5">{meeting.code}</span>
            <span className="mt-0.5 block truncate text-xs leading-5 opacity-80">
              {meeting.time} · {meeting.place}
            </span>
          </span>
        </motion.li>
      ))}
    </ul>
  );
}

function WeekGrid({ reduce }: { reduce: boolean }) {
  return (
    <div
      aria-hidden="true"
      className="grid grid-cols-[3rem_repeat(5,minmax(0,1fr))] grid-rows-[2.5rem_repeat(4,4.5rem)]"
    >
      <div className="border-b border-border/80 bg-muted/40" />
      {days.map((day) => (
        <div
          key={day}
          className="flex items-center justify-center border-b border-l border-border/80 bg-muted/40 text-xs font-medium text-muted-foreground"
        >
          {day}
        </div>
      ))}
      {hours.map((hour, hourIndex) => (
        <div
          key={hour}
          style={{ gridColumn: 1, gridRow: hourIndex + 2 }}
          className={cn(
            "pr-2 pt-1 text-right text-[11px] tabular-nums text-muted-foreground",
            hourIndex < hours.length - 1 && "border-b border-border/80",
          )}
        >
          {hour}
        </div>
      ))}
      {hours.map((hour, hourIndex) =>
        days.map((day, dayIndex) => (
          <div
            key={`${hour}-${day}`}
            style={{ gridColumn: dayIndex + 2, gridRow: hourIndex + 2 }}
            className={cn("border-l border-border/80", hourIndex < hours.length - 1 && "border-b border-border/80")}
          />
        )),
      )}
      {meetings.map((meeting) => (
        <motion.div
          key={meeting.id}
          {...enter(reduce, meeting.delay, true)}
          whileHover={reduce ? undefined : { scale: 1.02 }}
          transition={
            reduce
              ? undefined
              : { duration: 0.55, delay: meeting.delay, ease, scale: { duration: 0.2, delay: 0 } }
          }
          title={`${meeting.code}, ${meeting.time}, ${meeting.place}`}
          style={
            {
              gridColumn: meeting.column + 1,
              gridRow: `${meeting.row} / span ${meeting.span}`,
              "--event-color": meeting.color,
            } as CSSProperties
          }
          className="schedule-event z-10 m-1.5 flex min-w-0 flex-col justify-center overflow-hidden rounded-[5px] border px-2"
        >
          <p className="truncate text-xs font-semibold leading-tight">{meeting.code}</p>
          <p className="truncate text-[11px] leading-tight opacity-80">{meeting.time}</p>
          {meeting.span > 1 ? <p className="mt-0.5 truncate text-[11px] leading-tight opacity-80">{meeting.place}</p> : null}
        </motion.div>
      ))}
    </div>
  );
}
