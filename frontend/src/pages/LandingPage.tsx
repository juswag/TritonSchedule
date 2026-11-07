import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Github,
  MapPin,
  MessageCircle,
  Search,
  Star,
  Trash2,
} from "lucide-react";

const previewCourses = [
  {
    code: "CSE 100",
    title: "Advanced Data Structures",
    professor: "Prof. Kim",
    rating: "4.6",
    units: "4 units",
    open: "32 open",
    time: "Tu Th 9:00 – 9:50 AM",
    location: "Center Hall 2142",
  },
  {
    code: "MATH 20C",
    title: "Calculus for Scientists III",
    professor: "Prof. Nguyen",
    rating: "4.4",
    units: "4 units",
    open: "21 open",
    time: "Mo We 10:00 – 11:20 AM",
    location: "AP&M 2411",
  },
  {
    code: "COGS 108",
    title: "Cognition (Mind and Machine)",
    professor: "Prof. Sims",
    rating: "4.8",
    units: "4 units",
    open: "18 open",
    time: "Mo We 11:00 – 12:15 PM",
    location: "SSLH 100",
  },
];

const scheduleHours = ["8 AM", "9 AM", "10 AM", "11 AM", "12 PM", "1 PM", "2 PM", "3 PM"];

export default function LandingPage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedQuery = query.trim();
    navigate(trimmedQuery ? `/courses?q=${encodeURIComponent(trimmedQuery)}` : "/courses");
  };

  return (
    <div className="min-h-[calc(100vh-72px)] overflow-x-clip bg-white dark:bg-background px-4 pt-8 sm:px-8 lg:pt-9">
      <section className="relative mx-auto w-full max-w-[1360px]" aria-labelledby="landing-heading">
        <img
          src="/illustrations/trident-doodle.png"
          alt=""
          className="pointer-events-none absolute left-0 top-8 hidden h-36 w-36 select-none object-contain mix-blend-multiply dark:mix-blend-screen dark:invert dark:hue-rotate-180 lg:block xl:left-4"
        />
        <img
          src="/illustrations/notebook-doodle.png"
          alt=""
          className="pointer-events-none absolute left-[-12px] top-[196px] hidden h-40 w-40 select-none object-contain mix-blend-multiply dark:mix-blend-screen dark:invert dark:hue-rotate-180 lg:block xl:left-[-2px]"
        />
        <img
          src="/illustrations/calendar-doodle.png"
          alt=""
          className="pointer-events-none absolute right-2 top-6 hidden h-36 w-36 select-none object-contain mix-blend-multiply dark:mix-blend-screen dark:invert dark:hue-rotate-180 lg:block xl:right-5"
        />
        <img
          src="/illustrations/star-doodle.png"
          alt=""
          className="pointer-events-none absolute right-8 top-[198px] hidden h-24 w-24 select-none object-contain mix-blend-multiply dark:mix-blend-screen dark:invert dark:hue-rotate-180 lg:block xl:right-12"
        />

        <div className="relative z-10 mx-auto max-w-[900px] text-center">
          <h1
            id="landing-heading"
            className="text-balance text-[44px] font-extrabold leading-[0.98] tracking-[-0.055em] text-black dark:text-foreground sm:text-[60px] lg:text-[72px]"
          >
            What are you taking
            <span className="mx-auto mt-2 block w-fit rounded-[14px] bg-[#eaf2ff] dark:bg-accent px-3 pb-2 pt-1 sm:px-5">
              next quarter?
            </span>
          </h1>
          <p className="mt-4 text-base text-slate-600 dark:text-muted-foreground sm:text-lg">
            Search the catalog and build a conflict-free week.
          </p>

          <form onSubmit={submitSearch} className="mx-auto mt-5 flex max-w-[930px]" role="search">
            <label className="relative min-w-0 flex-1">
              <span className="sr-only">Search the course catalog</span>
              <Search className="pointer-events-none absolute left-5 top-1/2 h-6 w-6 -translate-y-1/2 text-slate-600 dark:text-muted-foreground" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Try CSE 100, MATH 20C, or a professor"
                className="h-[76px] w-full rounded-l-lg border border-r-0 border-slate-300 dark:border-border bg-white dark:bg-card pl-16 pr-5 text-base text-slate-950 dark:text-foreground outline-none transition placeholder:text-slate-500 dark:placeholder:text-muted-foreground focus:border-primary dark:focus:border-primary focus:ring-2 focus:ring-primary/15 sm:text-lg"
              />
            </label>
            <button
              type="submit"
              className="h-[76px] shrink-0 rounded-r-lg bg-primary px-8 text-base font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:min-w-[184px] sm:text-lg"
            >
              Search
            </button>
          </form>
          <p className="mt-4 text-sm text-slate-600 dark:text-muted-foreground sm:text-base">
            Free to use <span className="mx-2">•</span> No account required.
          </p>
        </div>

        <section
          aria-label="TritonSchedule preview"
          className="relative z-10 mt-5 overflow-hidden rounded-lg border border-slate-300 dark:border-border bg-white dark:bg-card lg:grid lg:grid-cols-[0.94fr_1.06fr]"
        >
          <div className="min-w-0 lg:border-r lg:border-slate-300 dark:lg:border-border">
            <div className="flex h-14 items-center justify-between border-b border-slate-300 dark:border-border px-5 text-sm text-slate-700 dark:text-foreground/80 sm:px-6">
              <span>24 results</span>
              <span className="flex items-center gap-2">
                Sort: <span className="text-primary">Relevance</span>
                <ChevronDown className="h-4 w-4 text-primary" />
              </span>
            </div>

            <div className="divide-y divide-slate-300 dark:divide-border">
              {previewCourses.map((course) => (
                <article key={course.code} className="grid min-h-[128px] grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-5 px-5 py-5 sm:px-6">
                  <strong className="self-start pt-0.5 text-lg text-primary sm:text-xl">{course.code}</strong>
                  <div className="min-w-0">
                    <h2 className="truncate text-sm font-semibold text-slate-950 dark:text-foreground sm:text-base">{course.title}</h2>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600 dark:text-muted-foreground sm:text-sm">
                      <span>{course.professor}</span>
                      <span className="inline-flex items-center gap-1 text-slate-700 dark:text-foreground/80">
                        <Star className="h-3.5 w-3.5 fill-emerald-600 text-emerald-600 dark:fill-emerald-400 dark:text-emerald-400" />
                        {course.rating}
                      </span>
                      <span>•</span>
                      <span>{course.units}</span>
                    </div>
                    <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600 dark:text-muted-foreground sm:text-sm">
                      <span className="inline-flex items-center gap-1.5">
                        <Clock3 className="h-3.5 w-3.5" />
                        {course.time}
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <MapPin className="h-3.5 w-3.5" />
                        {course.location}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="hidden text-sm text-emerald-700 dark:text-emerald-400 sm:inline">{course.open}</span>
                    <button
                      type="button"
                      onClick={() => navigate(`/courses?q=${encodeURIComponent(course.code)}`)}
                      className="h-10 rounded-md border border-primary px-4 text-sm font-medium text-primary transition-colors hover:bg-primary/[0.05] dark:hover:bg-primary/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/20"
                    >
                      Add
                    </button>
                  </div>
                </article>
              ))}
            </div>

            <Link
              to="/courses"
              className="flex h-14 items-center justify-center gap-2 border-t border-slate-300 dark:border-border text-sm font-medium text-primary hover:bg-primary/[0.025] dark:hover:bg-primary/10"
            >
              See more results
              <ChevronDown className="h-4 w-4" />
            </Link>
          </div>

          <div className="min-w-0">
            <div className="flex h-14 items-center justify-between border-b border-slate-300 dark:border-border px-5 text-sm sm:px-6">
              <span className="font-semibold text-slate-950 dark:text-foreground">
                My schedule <span className="font-normal">(1 course)</span>
              </span>
              <span className="inline-flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
                <CheckCircle2 className="h-5 w-5" />
                No conflicts
              </span>
            </div>

            <div className="grid h-[360px] grid-cols-[62px_repeat(5,minmax(72px,1fr))] overflow-hidden text-xs text-slate-700 dark:text-foreground/80">
              <div className="border-b border-r border-slate-200 dark:border-border" />
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map((day) => (
                <div key={day} className="flex items-center justify-center border-b border-r border-slate-200 dark:border-border last:border-r-0">
                  {day}
                </div>
              ))}
              {scheduleHours.map((hour, rowIndex) => (
                <LandingScheduleRow key={hour} hour={hour} rowIndex={rowIndex} />
              ))}
            </div>

            <div className="flex h-14 items-center justify-between gap-3 border-t border-slate-300 dark:border-border px-4 text-xs text-slate-600 dark:text-muted-foreground sm:px-5 sm:text-sm">
              <span className="inline-flex items-center gap-2 whitespace-nowrap">
                <Trash2 className="h-4 w-4" />
                Clear schedule
              </span>
              <span className="hidden truncate sm:inline">Week of Aug 16 – Aug 22, 2026</span>
              <span className="flex gap-2">
                <button type="button" className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-300 dark:border-border hover:bg-slate-50 dark:hover:bg-muted" aria-label="Previous week">
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button type="button" className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-300 dark:border-border hover:bg-slate-50 dark:hover:bg-muted" aria-label="Next week">
                  <ChevronRight className="h-4 w-4" />
                </button>
              </span>
            </div>
          </div>
        </section>

        <section
          id="how-it-works"
          aria-labelledby="how-it-works-heading"
          className="mx-auto max-w-[1288px] scroll-mt-24 pb-20 pt-24 lg:pb-[68px] lg:pt-28"
        >
          <h2
            id="how-it-works-heading"
            className="text-[30px] font-extrabold leading-none tracking-[-0.04em] text-black dark:text-foreground sm:text-[34px]"
          >
            How it works
          </h2>

          <div className="mt-7 grid gap-12 min-[1450px]:grid-cols-[370px_44px_384px_44px_minmax(0,1fr)] min-[1450px]:items-start min-[1450px]:gap-5">
            <HowItWorksSearch />
            <div className="hidden pt-1 text-slate-500 dark:text-muted-foreground min-[1450px]:flex min-[1450px]:-translate-x-[26px] min-[1450px]:justify-center" aria-hidden="true">
              <ArrowRight className="h-7 w-7" />
            </div>
            <HowItWorksCompare />
            <div className="hidden pt-1 text-slate-500 dark:text-muted-foreground min-[1450px]:flex min-[1450px]:-translate-x-[27px] min-[1450px]:justify-center" aria-hidden="true">
              <ArrowRight className="h-7 w-7" />
            </div>
            <HowItWorksSchedule />
          </div>
        </section>
      </section>

      <section
        id="about"
        aria-labelledby="about-heading"
        className="-mx-4 scroll-mt-24 bg-[#f4f8fe] dark:bg-card px-4 py-14 sm:-mx-8 sm:px-8 lg:pb-[37px] lg:pt-16"
      >
        <div className="mx-auto w-full max-w-[1200px]">
          <p className="text-sm font-medium text-slate-600 dark:text-muted-foreground">About TritonSchedule</p>
          <div className="mt-6 grid items-center gap-8 min-[1200px]:grid-cols-[389px_1px_440px_minmax(0,1fr)] min-[1200px]:gap-9">
            <h2
              id="about-heading"
              className="text-[38px] font-extrabold leading-[1.06] tracking-[-0.05em] text-black dark:text-foreground sm:text-[44px]"
            >
              <span className="inline-block rounded-[10px] bg-[#e7f0ff] dark:bg-accent px-2 pb-1">Built for students.</span>
              <span className="mt-1 block">Free for everyone.</span>
            </h2>

            <div className="hidden h-[110px] -translate-y-[5px] bg-slate-300 dark:bg-border min-[1200px]:block" aria-hidden="true" />

            <p className="max-w-[440px] text-base leading-[26px] text-slate-700 dark:text-foreground/80">
              <span className="block">TritonSchedule is a free, unofficial UC San Diego</span>
              <span className="block">course-planning tool. No account required.</span>
              <span className="block">We help students save time and make</span>
              <span className="block">clearer schedules.</span>
            </p>

            <a
              href="https://github.com/wangj000/TritonSchedule/issues/new"
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-12 w-fit items-center justify-center gap-2 rounded-md border border-primary px-5 text-sm font-semibold text-primary outline-none transition-colors hover:bg-primary/[0.05] dark:hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-primary/25 focus-visible:ring-offset-2 focus-visible:ring-offset-background min-[1200px]:mt-[18px] min-[1200px]:w-[185px] min-[1200px]:self-start min-[1200px]:justify-self-start"
            >
              <MessageCircle className="h-4 w-4" />
              Send feedback
            </a>
          </div>

          <footer className="mt-[54px] flex flex-col gap-4 border-t border-slate-300 dark:border-border pt-[35px] text-sm text-slate-600 dark:text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <a
              href="https://github.com/wangj000/TritonSchedule"
              target="_blank"
              rel="noreferrer"
              className="inline-flex w-fit items-center gap-3 text-sm font-medium text-slate-700 dark:text-foreground/80 outline-none transition-colors hover:text-primary dark:hover:text-primary focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-primary/20"
            >
              <Github className="h-6 w-6 fill-current stroke-[1.5]" aria-hidden="true" />
              View on GitHub
            </a>
            <p>Not affiliated with UC San Diego. Public course data is subject to change.</p>
          </footer>
        </div>
      </section>
    </div>
  );
}

function HowItWorksSearch() {
  return (
    <article className="min-w-0">
      <HowItWorksHeading number="01" title="Search classes" />
      <p className="ml-12 mt-2 max-w-[290px] text-sm leading-6 text-slate-600 dark:text-muted-foreground sm:text-base">
        Find courses fast using code, topic, or professor.
      </p>
      <div className="relative mt-8 flex min-h-[190px] items-end gap-1 min-[1450px]:block">
        <img
          src="/illustrations/search-mascot.png"
          alt="Hand-drawn student searching with a magnifying glass"
          className="h-32 w-32 shrink-0 select-none object-contain mix-blend-multiply dark:mix-blend-screen dark:invert dark:hue-rotate-180 sm:h-40 sm:w-40 min-[1450px]:absolute min-[1450px]:left-[-60px] min-[1450px]:bottom-0 min-[1450px]:-translate-y-2"
        />
        <div className="mb-10 flex h-12 min-w-0 flex-1 overflow-hidden rounded-md border border-slate-300 dark:border-border bg-white dark:bg-card text-xs shadow-[0_1px_2px_rgba(15,23,42,0.03)] min-[1450px]:absolute min-[1450px]:bottom-[84px] min-[1450px]:left-[96px] min-[1450px]:mb-0 min-[1450px]:h-10 min-[1450px]:w-[307px] min-[1450px]:translate-y-2">
          <span className="flex min-w-0 flex-1 items-center gap-2 px-3 text-slate-500 dark:text-muted-foreground">
            <Search className="h-4 w-4 shrink-0" />
            <span className="truncate">Try CSE 100, MATH 20C, or a professor</span>
          </span>
          <span className="flex w-[72px] shrink-0 items-center justify-center bg-primary font-semibold text-primary-foreground min-[1450px]:w-16">
            Search
          </span>
        </div>
      </div>
    </article>
  );
}

function HowItWorksCompare() {
  return (
    <article className="min-w-0">
      <HowItWorksHeading number="02" title="Compare sections" />
      <p className="ml-12 mt-2 max-w-[320px] text-sm leading-6 text-slate-600 dark:text-muted-foreground sm:text-base">
        Review options side by side - times, instructors, ratings, and more.
      </p>
      <div className="mt-10 overflow-hidden rounded-md border border-slate-300 dark:border-border bg-white dark:bg-card text-[11px] text-slate-600 dark:text-muted-foreground shadow-[0_1px_2px_rgba(15,23,42,0.03)] sm:mx-auto sm:max-w-[384px] sm:text-xs min-[1450px]:mx-0 min-[1450px]:mt-9 min-[1450px]:w-[384px] min-[1450px]:translate-y-1">
        <div className="grid grid-cols-[74px_136px_100px_42px] border-b border-slate-200 dark:border-border px-4 py-3 font-medium text-slate-600 dark:text-muted-foreground">
          <span>Section</span>
          <span>Time</span>
          <span>Professor</span>
          <span>Rate</span>
        </div>
        <MiniSectionRow selected section="001" time="Tu Th 9:00 - 10:20 AM" professor="Prof. Kim" rating="4.6" />
        <MiniSectionRow section="002" time="Tu Th 11:00 - 12:20 PM" professor="Prof. Lee" rating="4.3" />
      </div>
    </article>
  );
}

function HowItWorksSchedule() {
  return (
    <article className="min-w-0">
      <HowItWorksHeading number="03" title="Build your week" compact />
      <p className="ml-[56px] mt-2 max-w-[240px] text-sm leading-6 text-slate-600 dark:text-muted-foreground sm:text-base">
        Add classes and see your week come together.
      </p>
      <div className="relative mt-7 flex min-h-[210px] items-end justify-center min-[1450px]:mt-7 min-[1450px]:block min-[1450px]:min-h-[210px]">
        <MiniWeekPreview />
        <img
          src="/illustrations/schedule-mascot-transparent.png"
          alt="Hand-drawn student presenting a completed schedule"
          className="ml-3 mb-1 h-28 w-28 shrink-0 select-none object-contain dark:mix-blend-screen dark:invert dark:hue-rotate-180 sm:h-32 sm:w-32 min-[1450px]:absolute min-[1450px]:bottom-[-11px] min-[1450px]:left-[341px] min-[1450px]:mb-0 min-[1450px]:h-[176px] min-[1450px]:w-[176px]"
        />
      </div>
    </article>
  );
}

function HowItWorksHeading({ number, title, compact = false }: { number: string; title: string; compact?: boolean }) {
  return (
    <div className={`flex items-center ${compact ? "gap-4" : "gap-5"}`}>
      <span className="text-[32px] font-medium leading-none tracking-normal text-primary">{number}</span>
      <h3 className="text-xl font-bold leading-none tracking-[-0.025em] text-black dark:text-foreground sm:text-2xl">{title}</h3>
    </div>
  );
}

function MiniSectionRow({
  selected = false,
  section,
  time,
  professor,
  rating,
}: {
  selected?: boolean;
  section: string;
  time: string;
  professor: string;
  rating: string;
}) {
  return (
    <div
      className={`grid min-h-14 grid-cols-[74px_136px_100px_42px] items-center px-4 min-[1450px]:min-h-[60px] ${
        selected ? "bg-primary/[0.055] dark:bg-accent" : "border-t border-slate-200 dark:border-border"
      }`}
    >
      <span className="flex items-center gap-2">
        <span className={`h-3.5 w-3.5 rounded-full border ${selected ? "border-[4px] border-primary" : "border-slate-400 dark:border-muted-foreground"}`} />
        {section}
      </span>
      <span className="pr-3 leading-[1.35]">{time}</span>
      <span className="whitespace-nowrap">{professor}</span>
      <span className="inline-flex items-center gap-1 whitespace-nowrap">
        <Star className="h-3 w-3 fill-emerald-600 text-emerald-600 dark:fill-emerald-400 dark:text-emerald-400" />
        {rating}
      </span>
    </div>
  );
}

function MiniWeekPreview() {
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri"];
  const times = ["9 AM", "10 AM", "11 AM", "12 PM"];

  return (
    <div className="min-w-0 flex-1 overflow-hidden rounded-md border border-slate-300 dark:border-border bg-white dark:bg-card text-[9px] text-slate-600 dark:text-muted-foreground shadow-[0_1px_2px_rgba(15,23,42,0.03)] sm:max-w-[400px] min-[1450px]:w-[400px] min-[1450px]:max-w-none min-[1450px]:flex-none">
      <div className="grid h-8 grid-cols-[52px_repeat(5,minmax(0,1fr))] border-b border-slate-200 dark:border-border">
        <span />
        {days.map((day) => (
          <span key={day} className="flex items-center justify-center border-l border-slate-200 dark:border-border">
            {day}
          </span>
        ))}
      </div>
      <div className="grid h-[144px] grid-cols-[52px_repeat(5,minmax(0,1fr))] grid-rows-4 min-[1450px]:h-[176px]">
        {times.map((time, rowIndex) => (
          <MiniWeekRow key={time} time={time} rowIndex={rowIndex} days={days} />
        ))}
      </div>
    </div>
  );
}

function MiniWeekRow({ time, rowIndex, days }: { time: string; rowIndex: number; days: string[] }) {
  return (
    <>
      <span className="flex justify-end border-b border-slate-200 dark:border-border pr-1.5 pt-2">{time}</span>
      {days.map((day) => (
        <span key={`${time}-${day}`} className="relative border-b border-l border-slate-200 dark:border-border">
          {((rowIndex === 0 && (day === "Tue" || day === "Thu")) ||
            (rowIndex === 2 && (day === "Tue" || day === "Thu"))) && (
            <span className="absolute inset-x-0.5 top-1 overflow-hidden rounded border border-blue-300 dark:border-primary/40 bg-blue-50 dark:bg-primary/10 px-0.5 py-1 leading-tight text-primary">
              <strong className="block whitespace-nowrap text-[8px]">{rowIndex === 0 ? "CSE 100 LE" : "MATH 20C"}</strong>
              <span className="block whitespace-nowrap text-[7px] text-slate-600 dark:text-muted-foreground">{rowIndex === 0 ? "9:00 - 9:50" : "11:00 - 12:20"}</span>
              <span className="block truncate whitespace-nowrap text-[7px] text-slate-600 dark:text-muted-foreground">
                {rowIndex === 0 ? "Center Hall 2142" : "AP&M 2411"}
              </span>
            </span>
          )}
        </span>
      ))}
    </>
  );
}

function LandingScheduleRow({ hour, rowIndex }: { hour: string; rowIndex: number }) {
  const hasCourse = rowIndex === 1;

  return (
    <>
      <div className="flex items-start justify-end border-b border-r border-slate-200 dark:border-border pr-2 pt-2 text-[11px] text-slate-600 dark:text-muted-foreground">
        {hour}
      </div>
      {['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map((day) => (
        <div key={`${hour}-${day}`} className="relative border-b border-r border-slate-200 dark:border-border last:border-r-0">
          {hasCourse && (day === 'Tue' || day === 'Thu') && (
            <div className="absolute inset-x-1 top-1 rounded-md border border-blue-300 dark:border-primary/40 bg-blue-50 dark:bg-primary/10 px-2 py-1.5 text-[11px] leading-tight text-slate-700 dark:text-foreground/80">
              <strong className="block text-primary">CSE 100 LE</strong>
              <span className="mt-1 block">9:00 – 9:50 AM</span>
              <span className="block truncate">Center Hall 2142</span>
            </div>
          )}
        </div>
      ))}
    </>
  );
}
