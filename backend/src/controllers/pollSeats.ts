import type { Request, Response } from "express";
import { pollOpenSeats, type SeatPollResponse } from "../ingestion/seatPoll.js";
import { cronAuthorized } from "../middleware/cronAuth.js";

export function createPollSeatsHandler(
  poll: () => Promise<SeatPollResponse> = () => pollOpenSeats(),
) {
  return async function pollSeats(req: Request, res: Response) {
    if (!cronAuthorized(req.header("authorization"), process.env.CRON_SECRET)) {
      res.status(401).json({ Message: "Not Authorized" });
      return;
    }

    const result = await poll();
    res.status(result.httpStatus).json(result.body);
  };
}
