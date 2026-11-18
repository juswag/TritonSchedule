import { describe, expect, it } from "@jest/globals";
import { runSeatPoll } from "../../src/ingestion/runSeatPoll.js";

describe("seat polling command", () => {
  it("returns successful counts", async () => {
    await expect(runSeatPoll(async () => ({ status: "updated", changed: 2 })))
      .resolves.toEqual({ status: "updated", changed: 2 });
  });

  it("treats an overlap skip as a successful no-op", async () => {
    await expect(runSeatPoll(async () => ({ status: "skipped", reason: "nightly" })))
      .resolves.toEqual({ status: "skipped", reason: "nightly" });
  });

  it("fails the command when polling fails", async () => {
    await expect(runSeatPoll(async () => ({ status: "failed" })))
      .rejects.toThrow("Seat polling failed");
  });

  it("includes the serialized poll failure in the command error", async () => {
    await expect(runSeatPoll(async () => ({
      status: "failed",
      reason: "message=seat update payload contains invalid seat values; code=P0001; status=400",
    }))).rejects.toThrow(
      "Seat polling failed: message=seat update payload contains invalid seat values; code=P0001; status=400",
    );
  });

  it("propagates a database failure before scraping", async () => {
    await expect(runSeatPoll(async () => { throw new Error("database unavailable"); }))
      .rejects.toThrow("database unavailable");
  });
});
