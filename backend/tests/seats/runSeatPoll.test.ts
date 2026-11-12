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

  it("propagates a database failure before scraping", async () => {
    await expect(runSeatPoll(async () => { throw new Error("database unavailable"); }))
      .rejects.toThrow("database unavailable");
  });
});
