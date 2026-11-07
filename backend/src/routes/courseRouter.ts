import express from "express";
import { searchForClass } from "../controllers/searchForClass.js";
import { getCourseOptions } from "../controllers/getCourseOptions.js";

const router = express.Router();

router.get("/options", getCourseOptions);
router.post("/options", getCourseOptions);

router.get("/", searchForClass) // For search bar class querying

export default router
