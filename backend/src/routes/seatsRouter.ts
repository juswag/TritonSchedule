import { Router } from "express";
import { createPollSeatsHandler } from "../controllers/pollSeats.js";

const router = Router();

router.get("/poll", createPollSeatsHandler());

export default router;
