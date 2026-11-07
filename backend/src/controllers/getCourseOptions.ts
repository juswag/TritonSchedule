import type { Request, Response } from "express";
import { getActiveTermRow } from "../services/supabaseRepository.js";
import { getScheduleOptions, ScheduleOptionsError } from "../services/scheduleOptions.js";

export async function getCourseOptions(req: Request, res: Response) {
  try {
    const input = req.method === "POST" ? req.body : req.query;
    const requestedTerm = input?.term;
    if (requestedTerm !== undefined && (typeof requestedTerm !== "string" || !/^[a-z0-9]{4,6}$/i.test(requestedTerm))) {
      return res.status(400).json({ message: "Choose a valid term." });
    }
    const term = requestedTerm?.toUpperCase() || (await getActiveTermRow())?.Term;
    if (!term) return res.status(404).json({ message: "No active term is available." });
    let keys: string[] | undefined;
    let query = "";
    if (req.method === "POST") {
      if (!Array.isArray(input?.keys) || input.keys.length < 1 || input.keys.length > 12 ||
          input.keys.some((key: unknown) => typeof key !== "string" || key.length > 10000) ||
          new Set(input.keys).size !== input.keys.length) {
        return res.status(400).json({ message: "Select between 1 and 12 distinct courses." });
      }
      keys = input.keys;
    } else {
      if (input.course !== undefined && typeof input.course !== "string") return res.status(400).json({ message: "Enter a course code or title." });
      query = (input.course as string | undefined)?.trim() ?? "";
      if (query.length > 120) return res.status(400).json({ message: "Search must be 120 characters or fewer." });
      if (!query) return res.json({ term, courses: [] });
    }
    const courses = await getScheduleOptions(term, query, keys);
    return res.json({ term, courses });
  } catch (error) {
    if (error instanceof ScheduleOptionsError) return res.status(error.status).json({ message: error.message });
    return res.status(503).json({ message: "Course options could not be loaded. Please try again." });
  }
}
