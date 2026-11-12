import { pathToFileURL } from "node:url";
import dotenv from "dotenv";
import { getSupabaseConfig } from "../services/connectToDB.js";
import { pollOpenSeats, type SeatPollResult } from "./seatPoll.js";

if (process.env.NODE_ENV !== "production") dotenv.config({ quiet: true });

export async function runSeatPoll(poll: () => Promise<SeatPollResult> = pollOpenSeats) {
  const result = await poll();
  if (result.status === "failed") throw new Error("Seat polling failed");
  return result;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  Promise.resolve().then(() => {
    getSupabaseConfig();
    return runSeatPoll();
  }).then((result) => {
    console.log(JSON.stringify(result));
  }).catch((error: unknown) => {
    console.error("Seat polling failed:", error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
