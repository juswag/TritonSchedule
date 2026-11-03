import { describe, expect, it } from "vitest";
import type { Course, DiscussionSection } from "@/data/sampleCourses";
import { resolveTssBookingUrl } from "@/lib/tssBooking";

const discussion: DiscussionSection = {
  id: "discussion-1",
  name: "001-001-DI",
  time: "Wed 8:00am-8:50am",
  location: "CENTR 220",
  sectionRef: "FA26:E 00001998",
  eventPackageIds: ["156420", "157065"],
};

const lab: DiscussionSection = {
  id: "lab-1",
  name: "001-001-LA",
  time: "Thu 2:00pm-4:50pm",
  location: "MAYER 2306",
  sectionRef: "FA26:E 00001999",
  eventPackageIds: ["156420", "158000"],
};

const eventPackageUrl =
  "https://tss.ucsd.edu/fiori#ZUSModule-display?TileType=MYMOD&" +
  "/Detail/EventPackage/SM/14433/00000000/0/0/0/" +
  "00000000-0000-0000-0000-000000000000/156420/2026/2/?";
const moduleUrl =
  "https://tss.ucsd.edu/fiori#YSchedule-view&/" +
  "YUCSD_CON_MODULE(AcademicYear='2026',AcademicPeriod='2',ModuleID='14433')" +
  "?layout=MidColumnFullScreen";

const course: Course = {
  id: "FA26:E 00001997",
  name: "PHYS 002A: Physics-Mechanics",
  instructor: "Olga Dudko",
  schedule: "TR 11:00am-12:20pm",
  description: "Term: FA26",
  color: "#00629b",
  lectureSectionRef: "FA26:E 00001997",
  lectureEventPackageIds: ["156420", "156421"],
  discussionSections: [discussion],
  tssPackageUrls: {
    "156420": eventPackageUrl,
    "156421": eventPackageUrl.replace("/156420/", "/156421/"),
  },
};

describe("resolveTssBookingUrl", () => {
  it("returns the event package shared by every selected section", () => {
    expect(resolveTssBookingUrl(course, discussion)).toBe(eventPackageUrl);
  });

  it("resolves the exact package shared by the lecture, discussion, and lab", () => {
    expect(resolveTssBookingUrl({
      ...course,
      labSections: [lab],
    }, discussion, lab)).toBe(eventPackageUrl);
  });

  it.each([undefined, {}])(
    "leaves booking unavailable for a complete public catalog selection without URLs (%j)",
    (tssPackageUrls) => {
      expect(resolveTssBookingUrl({
        ...course,
        labSections: [lab],
        tssPackageUrls,
        tssFallbackUrl: undefined,
      }, discussion, lab)).toBeUndefined();
    },
  );

  it("does not resolve a package when the selected lab breaks the intersection", () => {
    expect(resolveTssBookingUrl({
      ...course,
      labSections: [lab],
    }, discussion, {
      ...lab,
      eventPackageIds: ["158000"],
    })).toBeUndefined();
  });

  it("does not open a different package when the combination is invalid", () => {
    expect(resolveTssBookingUrl(course, {
      ...discussion,
      eventPackageIds: ["157065"],
    })).toBeUndefined();
  });

  it("requires a selection for every section type offered by the course", () => {
    expect(resolveTssBookingUrl(course)).toBeUndefined();
  });

  it.each([
    { eventPackageIds: undefined },
    { eventPackageIds: [] },
  ])(
    "requires package membership metadata from the selected section",
    ({ eventPackageIds }) => {
      expect(resolveTssBookingUrl(course, {
        ...discussion,
        eventPackageIds,
      })).toBeUndefined();
    },
  );

  it("uses a module route when Class Planner has no event-package route", () => {
    expect(resolveTssBookingUrl({
      ...course,
      discussionSections: [],
      lectureEventPackageIds: undefined,
      tssFallbackUrl: moduleUrl,
    })).toBe(moduleUrl);
  });

  it("rejects links outside the official TSS origin", () => {
    expect(resolveTssBookingUrl({
      ...course,
      tssPackageUrls: {
        "156420": "https://example.com/not-tss",
      },
    }, discussion)).toBeUndefined();
  });

  it.each([
    eventPackageUrl.replace("/fiori#", "/unrelated#"),
    "https://tss.ucsd.edu/fiori#unrecognized-route",
    eventPackageUrl.replace("tss.ucsd.edu", "tss.ucsd.edu:444"),
    eventPackageUrl.replace("/fiori#", "/fiori?redirect=true#"),
    eventPackageUrl.replace("https://", "https://user@"),
  ])("rejects malformed TSS routes", (tssUrl) => {
    expect(resolveTssBookingUrl({
      ...course,
      tssPackageUrls: { "156420": tssUrl },
    }, discussion)).toBeUndefined();
  });

  it.each([
    moduleUrl.replace("/fiori#", "/unrelated#"),
    "https://tss.ucsd.edu/fiori#unrecognized-route",
    moduleUrl.replace("tss.ucsd.edu", "tss.ucsd.edu:444"),
    eventPackageUrl,
  ])("rejects malformed module fallback routes", (tssFallbackUrl) => {
    expect(resolveTssBookingUrl({
      ...course,
      discussionSections: [],
      tssFallbackUrl,
    })).toBeUndefined();
  });
});
