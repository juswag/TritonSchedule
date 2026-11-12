import dotenv from "dotenv";
import cors from "cors";
import express from "express";
import path from "path";
import courseRouter from "./routes/courseRouter.js";
import rmpRouter from "./routes/rmpRouter.js";
import termRouter from "./routes/termRouter.js";
import healthRouter from "./routes/healthRouter.js";
import { requireAdmin } from "./middleware/auth.js";

// Only load .env file in development (Vercel uses environment variables configured in dashboard)
if (process.env.NODE_ENV !== 'production') {
  dotenv.config();
}

const app = express();

const allowedOrigins: Array<string | RegExp> = [
  "https://tritonschedule.com",
  "https://triton-schedule-alpha.vercel.app",
  "https://triton-schedule-jl29ml1fz-justin-wangs-projects-e5966906.vercel.app",
  "http://localhost:8080",
];

if (process.env.NODE_ENV !== "production") {
  allowedOrigins.push(/^http:\/\/(localhost|127\.0\.0\.1):\d+$/);
}

app.use(
  cors({
    origin: allowedOrigins,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);

app.use(express.json());
app.use(express.static(path.join(process.cwd(), "public")));

app.use("/course", courseRouter);
app.use("/rmp", requireAdmin, rmpRouter);
app.use("/term", termRouter);
app.use("/health", requireAdmin, healthRouter);

export default app;
