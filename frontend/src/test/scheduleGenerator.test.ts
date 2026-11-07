import { afterEach, describe, expect, it, vi } from "vitest";
import { createScheduleSearch, courseColor } from "@/lib/scheduleGenerator";
import type { CalendarEvent } from "@/types/calendar";
import type {
  GeneratedSchedule,
  ScheduleCourse,
  ScheduleMeeting,
  ScheduleOption,
  ScheduleWorkerRequest,
  ScheduleWorkerResponse,
} from "@/types/generation";

function option(
  id: string,
  day: number,
  start: number,
  end: number,
): ScheduleOption {
  return {
    id,
    sections: [
      {
        id: `FA26:${id}`,
        code: id,
        type: "Lecture",
        instructor: "Example Instructor",
      },
    ],
    meetings: [
      {
        day,
        start,
        end,
        sectionId: `FA26:${id}`,
        type: "Lecture",
        location: "CENTR 101",
      },
    ],
  };
}

function course(key: string, options: ScheduleOption[]): ScheduleCourse {
  return {
    key,
    term: "FA26",
    code: key,
    title: `Course ${key}`,
    options,
    issues: [],
  };
}

function collect(
  courses: ScheduleCourse[],
  blocked: CalendarEvent[] = [],
  budget = 2000,
): GeneratedSchedule[] {
  const cursor = createScheduleSearch(courses, blocked);
  const all: GeneratedSchedule[] = [];
  for (let calls = 0; calls < 10000; calls++) {
    const batch = cursor.advance({ maxSteps: budget, maxResults: 2 });
    all.push(...batch.schedules);
    if (batch.complete) return all;
  }
  throw new Error("Search did not terminate.");
}

const fixture = [
  course("CSE 101", [
    option("cse-a", 0, 540, 600),
    option("cse-b", 1, 540, 600),
  ]),
  course("MATH 109", [
    option("math-a", 0, 570, 630),
    option("math-b", 0, 600, 660),
  ]),
  course("PHYS 2A", [
    option("phys-a", 2, 600, 650),
    option("phys-b", 1, 560, 620),
  ]),
];

describe("schedule generation", () => {
  it("returns exactly the complete hand-checked solution set, including adjacent meetings", () => {
    const result = collect(fixture);
    expect(
      result
        .map((schedule) =>
          schedule.choices.map((choice) => choice.optionId).join("/"),
        )
        .sort(),
    ).toEqual([
      "cse-a/math-b/phys-a",
      "cse-a/math-b/phys-b",
      "cse-b/math-a/phys-a",
      "cse-b/math-b/phys-a",
    ]);
    expect(new Set(result.map((schedule) => schedule.id)).size).toBe(4);
    expect(
      result.every((schedule) => schedule.choices.length === fixture.length),
    ).toBe(true);
  });

  it("matches an independent occupancy-grid oracle for every tiny catalog", () => {
    // The oracle exhaustively checks minute occupancy, rather than reusing interval comparison.
    for (let shift = 0; shift <= 3; shift++) {
      const input = [
        course("A", [option("a1", 0, 10, 13), option("a2", 1, 10, 13)]),
        course("B", [
          option("b1", 0, 11 + shift, 14 + shift),
          option("b2", 1, 12, 15),
        ]),
        course("C", [option("c1", 0, 15, 17), option("c2", 1, 15, 17)]),
      ];
      const expected: string[] = [];
      for (const a of input[0].options)
        for (const b of input[1].options)
          for (const c of input[2].options) {
            const occupied = new Set<string>();
            let valid = true;
            for (const meeting of [a, b, c].flatMap(
              (choice) => choice.meetings,
            )) {
              for (let minute = meeting.start; minute < meeting.end; minute++) {
                const cell = `${meeting.day}/${minute}`;
                if (occupied.has(cell)) valid = false;
                occupied.add(cell);
              }
            }
            if (valid) expected.push([a.id, b.id, c.id].join("/"));
          }
      expect(
        collect(input, [], 1)
          .map((schedule) =>
            schedule.choices.map((choice) => choice.optionId).join("/"),
          )
          .sort(),
      ).toEqual(expected.sort());
    }
  });

  it("resumes bounded searches without losing or repeating results", () => {
    expect(collect(fixture, [], 1)).toEqual(collect(fixture));
    const cursor = createScheduleSearch(fixture);
    let batch;
    do {
      batch = cursor.advance();
    } while (!batch.complete);
    expect(cursor.advance()).toEqual({ schedules: [], complete: true });
  });

  it("checks every meeting in a section against personal events", () => {
    const multi = option("multi", 0, 540, 600);
    multi.meetings.push({ ...multi.meetings[0], day: 3, start: 900, end: 960 });
    const blocked: CalendarEvent = {
      id: "work",
      title: "Work",
      dayOfWeek: "Thu",
      startTime: "15:30",
      endTime: "16:30",
      color: "gray",
    };
    expect(collect([course("A", [multi])], [blocked])).toEqual([]);
    const events = collect([course("A", [multi])])[0].events;
    expect(events).toHaveLength(2);
    expect(events.map((event) => event.dayOfWeek)).toEqual(["Mon", "Thu"]);
    expect(events[0]).toMatchObject({
      courseId: "FA26:multi",
      courseKey: "A",
      term: "FA26",
      location: "CENTR 101",
    });
  });

  it("keeps lecture, discussion, and lab meetings as one indivisible option", () => {
    const lecture = option("lecture", 0, 540, 600);
    const discussion = option("discussion", 1, 700, 750);
    const lab = option("lab", 3, 900, 1010);
    lab.sections[0].instructor = "Lab Instructor";
    const bundle = {
      id: "package",
      sections: [...lecture.sections, ...discussion.sections, ...lab.sections],
      meetings: [...lecture.meetings, ...discussion.meetings, ...lab.meetings],
    };
    const result = collect([course("A", [bundle])]);
    expect(result).toHaveLength(1);
    expect(result[0].events).toHaveLength(3);
    expect(
      result[0].events.find((event) => event.dayOfWeek === "Thu"),
    ).toMatchObject({
      sectionCode: "lab",
      instructor: "Lab Instructor",
    });
    expect(result[0].choices).toEqual([
      { courseKey: "A", optionId: "package" },
    ]);
  });

  it("deduplicates package IDs for the same section set and repeated identical meetings", () => {
    const first = option("first", 0, 540, 600);
    first.meetings.push({ ...first.meetings[0] });
    const duplicate = { ...first, id: "second" };
    const result = collect([course("A", [first, duplicate])]);
    expect(result).toHaveLength(1);
    expect(result[0].events).toHaveLength(1);
  });

  it("rejects inconsistent metadata for one section set", () => {
    const first = option("first", 0, 540, 600);
    const duplicate = {
      ...first,
      id: "second",
      meetings: [{ ...first.meetings[0], end: 620 }],
    };
    expect(() => collect([course("A", [first, duplicate])])).toThrow(
      "Conflicting section data",
    );
  });

  it("distinguishes separate sections that meet at identical times", () => {
    expect(
      collect([
        course("A", [
          option("first", 0, 540, 600),
          option("second", 0, 540, 600),
        ]),
      ]),
    ).toHaveLength(2);
  });

  it("includes weekends and end-of-day meetings without dropping them", () => {
    const result = collect([
      course("A", [option("sat", 5, 1380, 1440)]),
      course("B", [option("sun", 6, 0, 50)]),
    ]);
    expect(result[0].events.map((event) => event.dayOfWeek)).toEqual([
      "Sat",
      "Sun",
    ]);
    expect(result[0].events[0].endTime).toBe("24:00");
  });

  it("calculates campus days, gaps and latest class from class meetings only", () => {
    const result = collect([
      course("A", [option("a", 0, 540, 600)]),
      course("B", [option("b", 0, 660, 710)]),
    ]);
    expect(result[0]).toMatchObject({
      days: 1,
      gapMinutes: 60,
      latestEnd: 710,
    });
  });

  it("returns no schedule when any chosen course has no valid options", () => {
    expect(collect([...fixture, course("Unavailable", [])])).toEqual([]);
    const invalidPair = option("overlap", 0, 540, 600);
    invalidPair.meetings.push({
      ...invalidPair.meetings[0],
      start: 570,
      end: 620,
    });
    expect(collect([course("A", [invalidPair])])).toEqual([]);
  });

  it.each([
    { day: 7 },
    { start: -1 },
    { end: 1441 },
    { start: 600, end: 600 },
    { start: NaN },
    { end: null },
    { day: 1.5 },
    { sectionId: "missing" },
  ])("rejects malformed meeting data: %s", (changes) => {
    const invalid = option("bad", 0, 540, 600);
    invalid.meetings[0] = {
      ...invalid.meetings[0],
      ...changes,
    } as ScheduleMeeting;
    expect(() => collect([course("A", [invalid])])).toThrow(
      "Meeting times are incomplete",
    );
  });

  it("rejects missing meetings, duplicate courses, mixed terms and empty selection", () => {
    expect(() =>
      collect([course("A", [{ ...option("a", 0, 540, 600), meetings: [] }])]),
    ).toThrow("Incomplete");
    expect(() => collect([fixture[0], fixture[0]])).toThrow(
      "Select each course once",
    );
    expect(() =>
      collect([fixture[0], { ...fixture[1], term: "WI27" }]),
    ).toThrow("same term");
    expect(() => collect([])).toThrow("Choose between");
  });

  it("rejects unparseable saved events instead of treating them as free time", () => {
    const blocked = {
      id: "bad",
      title: "Bad",
      dayOfWeek: "Mon",
      startTime: "TBA",
      endTime: "15:00",
      color: "gray",
    } as CalendarEvent;
    expect(() => collect(fixture, [blocked])).toThrow(
      "saved event has an invalid time",
    );
  });

  it("uses stable colors and IDs regardless of selected course order", () => {
    expect(collect(fixture.slice().reverse())).toEqual(collect(fixture));
    expect(courseColor("CSE 101")).toBe(courseColor("CSE 101"));
  });
});

describe("schedule worker", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  async function worker() {
    vi.useFakeTimers();
    vi.resetModules();
    const messages: ScheduleWorkerResponse[] = [];
    const scope: {
      onmessage: ((event: MessageEvent<ScheduleWorkerRequest>) => void) | null;
      postMessage: (message: ScheduleWorkerResponse) => void;
    } = { onmessage: null, postMessage: (message) => messages.push(message) };
    vi.stubGlobal("self", scope);
    await import("@/workers/scheduleGenerator.worker");
    return {
      messages,
      send: (data: ScheduleWorkerRequest) =>
        scope.onmessage!(new MessageEvent("message", { data })),
    };
  }

  it("pauses at 500 and resumes the same cursor to return all 729 schedules exactly once", async () => {
    const { messages, send } = await worker();
    const input = [0, 1, 2].map((day) =>
      course(
        String(day),
        Array.from({ length: 9 }, (_, index) =>
          option(`${day}-${index}`, day, 540, 600),
        ),
      ),
    );
    send({ type: "start", courses: input, blockedEvents: [] });
    await vi.runAllTimersAsync();
    expect(messages.at(-1)).toEqual({ type: "paused", total: 500 });
    send({ type: "more" });
    await vi.runAllTimersAsync();
    expect(messages.at(-1)).toEqual({ type: "complete", total: 729 });
    const results = messages.flatMap((message) =>
      message.type === "results" ? message.schedules : [],
    );
    expect(results).toHaveLength(729);
    expect(new Set(results.map((schedule) => schedule.id)).size).toBe(729);
  });

  it("reports invalid data explicitly and accepts a fresh run afterward", async () => {
    const { messages, send } = await worker();
    send({ type: "start", courses: [], blockedEvents: [] });
    expect(messages[0]).toEqual({
      type: "error",
      message: "Choose between 1 and 12 courses.",
    });
    send({ type: "start", courses: fixture, blockedEvents: [] });
    await vi.runAllTimersAsync();
    expect(messages.at(-1)).toEqual({ type: "complete", total: 4 });
  });
});
