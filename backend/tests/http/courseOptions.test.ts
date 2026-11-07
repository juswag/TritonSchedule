import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import express from "express";
import request from "supertest";

const load = jest.fn<(...args: unknown[]) => Promise<unknown[]>>();
const activeTerm = jest.fn<() => Promise<{ Term: string } | null>>();
class OptionsError extends Error { constructor(message: string, public status = 409) { super(message); } }
jest.unstable_mockModule("../../src/services/scheduleOptions.js", () => ({ getScheduleOptions: load, ScheduleOptionsError: OptionsError }));
jest.unstable_mockModule("../../src/services/supabaseRepository.js", () => ({ getActiveTermRow: activeTerm }));
const { getCourseOptions } = await import("../../src/controllers/getCourseOptions.js");
const app = express();
app.use(express.json());
app.get("/course/options", getCourseOptions);
app.post("/course/options", getCourseOptions);

describe("course options HTTP contract", () => {
  beforeEach(() => { load.mockReset(); activeTerm.mockReset(); activeTerm.mockResolvedValue({ Term: "FA26" }); load.mockResolvedValue([]); });

  it("searches the active term and returns structured courses", async () => {
    load.mockResolvedValue([{ key: "course-key", options: [], issues: [] }]);
    const response = await request(app).get("/course/options").query({ course: "CSE 101" }).expect(200);
    expect(response.body).toEqual({ term: "FA26", courses: [{ key: "course-key", options: [], issues: [] }] });
    expect(load).toHaveBeenCalledWith("FA26", "CSE 101", undefined);
  });
  it("does not fetch an entire catalog for an empty search", async () => {
    await request(app).get("/course/options").expect(200, { term: "FA26", courses: [] });
    expect(load).not.toHaveBeenCalled();
  });
  it("reloads exact chosen keys in the requested term", async () => {
    await request(app).post("/course/options").send({ term: "fa26", keys: ["one", "two"] }).expect(200);
    expect(load).toHaveBeenCalledWith("FA26", "", ["one", "two"]);
  });
  it.each([[], ["one", "one"], [42], Array.from({ length: 13 }, (_, i) => String(i))].map(keys => ({ keys })))("rejects invalid selected-course lists: %j", async ({ keys }) => {
    await request(app).post("/course/options").send({ term: "FA26", keys }).expect(400);
    expect(load).not.toHaveBeenCalled();
  });
  it("rejects invalid term and search values", async () => {
    await request(app).get("/course/options").query({ term: "bad term", course: "CSE" }).expect(400);
    await request(app).get("/course/options").query({ course: "a".repeat(121) }).expect(400);
  });
  it("reports changed or missing choices explicitly", async () => {
    load.mockRejectedValue(new OptionsError("Remove the unavailable course and search again."));
    await request(app).post("/course/options").send({ term: "FA26", keys: ["one"] }).expect(409, { message: "Remove the unavailable course and search again." });
  });
  it("does not expose database failures as successful empty results", async () => {
    load.mockRejectedValue(new Error("private database details"));
    const response = await request(app).get("/course/options").query({ course: "CSE" }).expect(503);
    expect(response.body.message).not.toMatch(/private/);
  });
});
