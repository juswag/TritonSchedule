import { FormEvent, useEffect, useState, type CSSProperties } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion, useReducedMotion } from "motion/react";
import { ArrowRight, CheckCircle2, Github, MessageCircle, Search } from "lucide-react";
import { ProfessorRatingStar } from "@/components/ProfessorRatingStar";
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
  { id: "cse-tue", code: "CSE 100", time: "9:00 – 9:50", place: "Center Hall 2142", column: 2, row: 2, span: 1, color: "#2563EB", delay: 0.08 },
  { id: "cse-thu", code: "CSE 100", time: "9:00 – 9:50", place: "Center Hall 2142", column: 4, row: 2, span: 1, color: "#2563EB", delay: 0.16 },
  { id: "math-mon", code: "MATH 20C", time: "10:00 – 11:20", place: "AP&M 2411", column: 1, row: 3, span: 2, color: "#D97706", delay: 0.26 },
  { id: "math-wed", code: "MATH 20C", time: "10:00 – 11:20", place: "AP&M 2411", column: 3, row: 3, span: 2, color: "#D97706", delay: 0.34 },
];

const sections = [
  { section: "001", professor: "Prof. Kim", time: "Tu Th 9:00 – 10:20", rating: 4.6, selected: true },
  { section: "002", professor: "Prof. Lee", time: "Tu Th 11:00 – 12:20", rating: 4.3, selected: false },
];

function enter(reduce: boolean, delay = 0, inView = false) {
  if (reduce) return {};
  const transition = { duration: 0.8, delay, ease };
  if (inView) {
    return {
      initial: { opacity: 0, y: 28 },
      whileInView: { opacity: 1, y: 0 },
      viewport: { once: true, margin: "0px 0px -64px 0px" },
      transition,
    };
  }
  return {
    initial: { opacity: 0, y: 18 },
    animate: { opacity: 1, y: 0 },
    transition,
  };
}

export default function LandingPage() {
  const navigate = useNavigate();
  const reduce = useReducedMotion() === true;
  const widePlaceholder = useMediaQuery("(min-width: 768px)");
  const [query, setQuery] = useState("");

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedQuery = query.trim();
    navigate(trimmedQuery ? `/courses?q=${encodeURIComponent(trimmedQuery)}` : "/courses");
  };

  return (
    <div className="overflow-x-clip bg-background text-foreground">
      <section className="relative isolate min-h-[100svh] overflow-hidden" aria-labelledby="landing-heading">
        <Sky reduce={reduce} />
        <div className="relative z-10 mx-auto flex max-w-4xl flex-col items-center px-4 pb-44 pt-28 text-center sm:px-8 sm:pb-52 sm:pt-32">
          <motion.h1
            id="landing-heading"
            {...enter(reduce, 0.05)}
            className="landing-display text-balance text-[clamp(2.6rem,7vw,4.9rem)] leading-[0.96] tracking-[-0.03em] text-white"
          >
            What are you taking
            <span className="mt-1 block italic">next quarter?</span>
          </motion.h1>
          <motion.p
            {...enter(reduce, 0.16)}
            className="mx-auto mt-5 max-w-xl text-base leading-7 text-white/90 sm:text-lg"
          >
            Search the catalog and build a conflict-free week.
          </motion.p>
          <motion.form
            {...enter(reduce, 0.26)}
            onSubmit={submitSearch}
            role="search"
            className="group mx-auto mt-8 flex w-full max-w-xl flex-col gap-2 rounded-[28px] bg-white p-2 text-left shadow-[0_18px_50px_-24px_rgba(7,20,50,0.65)] focus-within:ring-4 focus-within:ring-white/40 sm:flex-row sm:items-center sm:rounded-full sm:p-1.5"
          >
            <label className="flex min-w-0 flex-1 items-center">
              <span className="sr-only">Search the course catalog</span>
              <Search className="ml-3 h-4 w-4 shrink-0 text-slate-500" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={widePlaceholder ? "Try CSE 100, MATH 20C, or a professor" : "CSE 100 or a professor"}
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                enterKeyHint="search"
                className="h-12 min-w-0 flex-1 bg-transparent px-3 text-base text-slate-950 outline-none placeholder:text-slate-500"
              />
            </label>
            <button
              type="submit"
              className="group/cta inline-flex h-12 w-full shrink-0 items-center justify-center gap-1.5 rounded-full bg-primary px-5 text-base font-medium text-primary-foreground transition-colors duration-200 hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-primary sm:w-auto"
            >
              Search
              <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover/cta:translate-x-0.5 motion-reduce:transition-none" />
            </button>
          </motion.form>
          <motion.p {...enter(reduce, 0.34)} className="mt-4 text-sm text-white/80">
            Free to use <span aria-hidden="true">·</span> No account required.
          </motion.p>
        </div>
      </section>

      <div className="relative z-20 mx-auto -mt-36 w-full max-w-5xl px-4 sm:-mt-40 sm:px-8">
        <ExampleWeek reduce={reduce} />
      </div>

      <section id="how-it-works" aria-labelledby="how-it-works-heading" className="scroll-mt-24">
        <div className="mx-auto max-w-5xl px-4 pb-8 pt-20 sm:px-8 sm:pt-28">
          <motion.h2
            id="how-it-works-heading"
            {...enter(reduce, 0, true)}
            className="max-w-xl text-4xl font-medium tracking-[-0.035em] text-foreground sm:text-5xl"
          >
            How it works
          </motion.h2>
          <motion.p {...enter(reduce, 0.06, true)} className="mt-4 max-w-lg text-base leading-7 text-muted-foreground">
            Search the catalog, compare sections, and keep the week in front of you.
          </motion.p>
          <div className="mt-10 grid gap-4 lg:grid-cols-2 lg:gap-5">
            <motion.article
              {...enter(reduce, 0.05, true)}
              className="flex min-h-[320px] flex-col rounded-[28px] bg-[#dbe7ff] p-7 text-slate-950 dark:bg-primary/15 dark:text-foreground sm:p-9"
            >
              <h3 className="text-2xl font-medium tracking-[-0.03em] sm:text-[1.7rem]">Search classes</h3>
              <p className="mt-3 max-w-sm text-sm leading-6 text-slate-700 dark:text-foreground/80 sm:text-base">
                Find courses fast using code, topic, or professor.
              </p>
              <div className="mt-auto flex h-14 items-center gap-3 rounded-full bg-white/90 px-4 text-sm text-slate-500 shadow-sm dark:bg-background" aria-hidden="true">
                <Search className="h-4 w-4" />
                <span className="truncate">CSE 100, MATH 20C, or a professor</span>
              </div>
            </motion.article>
            <motion.article
              {...enter(reduce, 0.12, true)}
              className="flex min-h-[320px] flex-col rounded-[28px] bg-[#f3f4f6] p-7 dark:bg-card sm:p-9"
            >
              <h3 className="text-2xl font-medium tracking-[-0.03em] text-foreground sm:text-[1.7rem]">Compare sections</h3>
              <p className="mt-3 max-w-sm text-sm leading-6 text-muted-foreground sm:text-base">
                Review times, instructors, and ratings side by side.
              </p>
              <div className="mt-auto space-y-2" aria-hidden="true">
                {sections.map((section) => (
                  <div
                    key={section.section}
                    className={cn(
                      "flex items-center justify-between gap-3 rounded-2xl px-4 py-3 text-sm",
                      section.selected ? "bg-white shadow-sm dark:bg-background" : "bg-white/60 dark:bg-background/60",
                    )}
                  >
                    <span className="min-w-0">
                      <span className="block font-medium text-foreground">{section.professor}</span>
                      <span className="block truncate text-xs text-muted-foreground">{section.time}</span>
                    </span>
                    <span className="inline-flex shrink-0 items-center gap-1 text-foreground">
                      <ProfessorRatingStar rating={section.rating} className="h-3.5 w-3.5" />
                      {section.rating.toFixed(1)}
                    </span>
                  </div>
                ))}
              </div>
            </motion.article>
          </div>
        </div>
      </section>

      <section id="about" aria-labelledby="about-heading" className="scroll-mt-24">
        <div className="relative overflow-hidden">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,#dbeafe_0%,transparent_55%)] dark:bg-[radial-gradient(ellipse_at_top,hsl(var(--primary)/0.18),transparent_55%)]"
          />
          <div className="relative mx-auto flex max-w-5xl flex-col gap-8 px-4 py-20 sm:px-8 sm:py-28 lg:flex-row lg:items-end lg:justify-between">
            <motion.div {...enter(reduce, 0, true)} className="max-w-xl">
              <h2 id="about-heading" className="text-4xl font-medium tracking-[-0.035em] text-foreground sm:text-5xl">
                Built for students. Free for everyone.
              </h2>
              <p className="mt-4 text-base leading-7 text-muted-foreground">
                TritonSchedule is a free, unofficial UC San Diego course-planning tool. No account required. We help
                students save time and make clearer schedules.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  to="/courses"
                  className="inline-flex h-11 items-center gap-2 rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                  Search the catalog
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
                <a
                  href="https://github.com/wangj000/TritonSchedule/issues/new"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-11 items-center gap-2 rounded-full border border-border bg-card px-5 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                >
                  <MessageCircle className="h-4 w-4" aria-hidden="true" />
                  Send feedback
                </a>
              </div>
            </motion.div>
            <motion.div {...enter(reduce, 0.08, true)} className="flex flex-col items-start gap-4 text-sm">
              <a
                href="https://github.com/wangj000/TritonSchedule"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 font-medium text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
              >
                <Github className="h-4 w-4" aria-hidden="true" />
                View on GitHub
              </a>
              <p className="max-w-xs text-xs leading-5 text-muted-foreground">
                Not affiliated with UC San Diego. Public course data is subject to change.
              </p>
            </motion.div>
          </div>
        </div>
      </section>
    </div>
  );
}

function Sky({ reduce }: { reduce: boolean }) {
  return (
    <div aria-hidden="true" className="absolute inset-0">
      <div className="absolute inset-0 bg-[linear-gradient(180deg,#08275f_0%,#1357c8_28%,#4aa0f0_52%,#f6d58a_78%,#f09a55_100%)] dark:bg-[linear-gradient(180deg,#041433_0%,#0c3f96_30%,#1d6fd0_54%,#c9893a_82%,#8a4b22_100%)]" />
      <motion.div
        className="absolute right-[8%] top-[46%] h-56 w-56 rounded-full bg-[radial-gradient(circle,#fff8dc_0%,#ffd56a_32%,rgba(255,180,70,0)_70%)] sm:h-72 sm:w-72"
        animate={reduce ? undefined : { y: [0, -14, 0], scale: [1, 1.05, 1] }}
        transition={reduce ? undefined : { duration: 14, repeat: Infinity, ease: "easeInOut" }}
      />
      <div className="absolute -left-16 bottom-[8%] h-40 w-[46%] rounded-[100%] bg-[#123a86]/70 blur-2xl" />
      <div className="absolute bottom-[6%] left-[28%] h-28 w-[42%] rounded-[100%] bg-[#f6c453]/50 blur-2xl" />
      <div className="absolute -right-10 bottom-[4%] h-36 w-[40%] rounded-[100%] bg-[#ef8d45]/55 blur-2xl" />
      <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent to-background" />
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
      {...enter(reduce, 0.28)}
      aria-label="Example schedule"
      className="overflow-hidden rounded-[28px] border border-white/50 bg-card shadow-[0_30px_80px_-28px_rgba(15,23,42,0.45)]"
    >
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
        Example week with no conflicts. CSE 100 meets Tuesday and Thursday, 9:00 to 9:50 AM, in Center Hall 2142. MATH
        20C meets Monday and Wednesday, 10:00 to 11:20 AM, in AP&M 2411.
      </p>
      {wide ? <WeekGrid reduce={reduce} /> : <WeekList reduce={reduce} />}
    </motion.section>
  );
}

function WeekList({ reduce }: { reduce: boolean }) {
  return (
    <ul aria-hidden="true" className="flex flex-col gap-2 px-3 py-3">
      {mobileMeetings.map((meeting) => (
        <motion.li
          key={meeting.day}
          {...enter(reduce, 0.45 + meeting.delay)}
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
      className="grid grid-cols-[3rem_repeat(5,minmax(0,1fr))] grid-rows-[2.5rem_repeat(4,4.25rem)]"
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
          {...enter(reduce, 0.5 + meeting.delay)}
          whileHover={reduce ? undefined : { scale: 1.03 }}
          transition={
            reduce
              ? undefined
              : { duration: 0.6, delay: 0.5 + meeting.delay, ease, scale: { duration: 0.2, delay: 0 } }
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
