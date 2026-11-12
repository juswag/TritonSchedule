import request from "supertest";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const pollOpenSeats = jest.fn<() => Promise<{ httpStatus: number; body: object }>>();

jest.unstable_mockModule("../../src/services/connectToDB.js", () => ({
  connectToDB: () => ({
    auth: { getUser: async () => ({ data: { user: null }, error: new Error("no session") }) },
    from: () => {
      const query: { eq: () => Promise<{ data: []; error: null }>; select: () => typeof query } = {
        eq: async () => ({ data: [], error: null }),
        select: () => query,
      };
      return query;
    },
  }),
  pingDatabase: async () => ({ ok: 1 }),
}));

jest.unstable_mockModule("../../src/services/supabaseRepository.js", () => ({
  getActiveTermRow: async () => null,
  searchCourses: async () => [],
  searchProfessor: async () => [],
}));

jest.unstable_mockModule("../../src/ingestion/seatPoll.js", () => ({
  pollOpenSeats,
}));

const { default: app } = await import("../../src/app.js");

describe("GET /api/seats/poll", () => {
  beforeEach(() => {
    pollOpenSeats.mockReset();
    delete process.env.CRON_SECRET;
  });

  it("returns 401 and does no work when the bearer token is missing or wrong", async () => {
    await request(app)
      .get("/api/seats/poll")
      .expect(401, { Message: "Not Authorized" });

    process.env.CRON_SECRET = "cron-secret";
    await request(app)
      .get("/api/seats/poll")
      .set("Authorization", "Bearer other-secret")
      .expect(401, { Message: "Not Authorized" });

    await request(app)
      .get("/api/seats/poll")
      .set("Authorization", "cron-secret")
      .expect(401, { Message: "Not Authorized" });

    expect(pollOpenSeats).not.toHaveBeenCalled();
  });

  it("returns 401 when CRON_SECRET is unset even if a bearer token is sent", async () => {
    await request(app)
      .get("/api/seats/poll")
      .set("Authorization", "Bearer cron-secret")
      .expect(401, { Message: "Not Authorized" });

    expect(pollOpenSeats).not.toHaveBeenCalled();
  });

  it("runs the poll only after the bearer token matches", async () => {
    process.env.CRON_SECRET = "cron-secret";
    pollOpenSeats.mockResolvedValue({
      httpStatus: 200,
      body: { status: "skipped", reason: "poll" },
    });

    await request(app)
      .get("/api/seats/poll")
      .set("Authorization", "Bearer cron-secret")
      .expect(200, { status: "skipped", reason: "poll" });

    expect(pollOpenSeats).toHaveBeenCalledTimes(1);
  });
});
