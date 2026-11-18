import { describe, expect, it, jest } from "@jest/globals";
import { pollOpenSeats } from "../../src/ingestion/seatPoll.js";
import { DatabaseError } from "../../src/utils/formatUnknownError.js";

describe("pollOpenSeats failures", () => {
  it("records PostgREST message, code, details, hint, and HTTP status", async () => {
    const recorded: string[] = [];
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);
    const databaseError = {
      message: "seat update payload contains invalid seat values",
      code: "P0001",
      details: "Failing row contains (seats_available) = (-8).",
      hint: "Available seats can be negative when a section is over-enrolled",
      status: 400,
    };

    try {
      const result = await pollOpenSeats({
        claimRun: async () => ({ status: "started" }),
        activeTerm: async () => "WI27",
        scrape: async () => ({ term: "WI27", courses: [], routes: [] }),
        apply: async () => {
          throw databaseError;
        },
        failRun: async ({ error }) => {
          recorded.push(error);
        },
      });

      expect(result.status).toBe("failed");
      expect(result.term).toBe("WI27");
      expect(result.reason).toContain("message=seat update payload contains invalid seat values");
      expect(result.reason).toContain("code=P0001");
      expect(result.reason).toContain("details=Failing row contains (seats_available) = (-8).");
      expect(result.reason).toContain("hint=Available seats can be negative when a section is over-enrolled");
      expect(result.reason).toContain("status=400");
      expect(recorded).toEqual([result.reason]);
      expect(errorSpy).toHaveBeenCalledWith("Seat poll failed:", result.reason);
    } finally {
      errorSpy.mockRestore();
    }
  });

  it("records a wrapped database error thrown by the repository", async () => {
    const recorded: string[] = [];
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);

    try {
      const result = await pollOpenSeats({
        claimRun: async () => ({ status: "started" }),
        activeTerm: async () => "WI27",
        scrape: async () => ({ term: "WI27", courses: [], routes: [] }),
        apply: async () => {
          throw new DatabaseError({
            message: "Public Class Planner access failed",
            code: "",
            details: "TypeError: fetch failed | Caused by: Error: connect ECONNRESET (ECONNRESET)",
            hint: "",
          }, 0);
        },
        failRun: async ({ error }) => {
          recorded.push(error);
        },
      });

      expect(result.reason).toContain("DatabaseError: Public Class Planner access failed");
      expect(result.reason).toContain("details=TypeError: fetch failed");
      expect(result.reason).toContain("status=0");
      expect(recorded).toEqual([result.reason]);
    } finally {
      errorSpy.mockRestore();
    }
  });
});
