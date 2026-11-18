import { describe, expect, it } from "@jest/globals";
import { DatabaseError, formatUnknownError } from "../../src/utils/formatUnknownError.js";

describe("formatUnknownError", () => {
  it("serializes a plain PostgREST error instead of [object Object]", () => {
    expect(formatUnknownError({
      message: "seat update payload contains invalid seat values",
      code: "P0001",
      details: "Failing row contains (seats_available) = (-8).",
      hint: "Available seats can be negative when a section is over-enrolled",
      status: 400,
    })).toBe([
      "message=seat update payload contains invalid seat values",
      "code=P0001",
      "details=Failing row contains (seats_available) = (-8).",
      "hint=Available seats can be negative when a section is over-enrolled",
      "status=400",
    ].join("; "));
  });

  it("serializes a DatabaseError with its HTTP status", () => {
    const error = new DatabaseError({
      message: "seat update payload contains invalid seat values",
      code: "P0001",
      details: "Failing row contains (seats_available) = (-8).",
      hint: "",
    }, 400);

    expect(formatUnknownError(error)).toBe([
      "DatabaseError: seat update payload contains invalid seat values",
      "code=P0001",
      "details=Failing row contains (seats_available) = (-8).",
      "status=400",
    ].join("; "));
  });

  it("serializes a fetch failure and its cause without dropping the code", () => {
    const error = new TypeError("fetch failed");
    error.cause = Object.assign(new Error("connect ECONNRESET"), { code: "ECONNRESET" });

    expect(formatUnknownError(error)).toBe(
      "TypeError: fetch failed; cause=Error: connect ECONNRESET (ECONNRESET)",
    );
  });

  it("keeps an ordinary Error message", () => {
    expect(formatUnknownError(new Error("Class Planner request failed (500 nope)")))
      .toBe("Class Planner request failed (500 nope)");
  });

  it("formats a non-Error cause and unknown values", () => {
    const error = new TypeError("fetch failed");
    error.cause = { message: "socket hang up", code: "ECONNRESET" };

    expect(formatUnknownError(error)).toBe(
      "TypeError: fetch failed; cause=message=socket hang up; code=ECONNRESET",
    );
    expect(formatUnknownError({ unexpected: true })).toBe("{\"unexpected\":true}");
    expect(formatUnknownError(undefined)).toBe("undefined");
  });
});
