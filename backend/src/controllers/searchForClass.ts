import type { Request, Response } from "express";
import { searchCourses } from "../services/supabaseRepository.js";

export async function searchForClass(req: Request, res: Response) {
  const term = typeof req.query.term === "string" ? req.query.term.trim() : "";
  const course = typeof req.query.course === "string" ? req.query.course.trim() : "";

  if (!term) {
    return res.status(400).json({ message: "A term is required" });
  }

  const queryResults = await searchCourses(course, term);

  return res.json({ data: queryResults });
}
