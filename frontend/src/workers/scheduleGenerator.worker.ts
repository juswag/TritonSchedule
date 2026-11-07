import {
  createScheduleSearch,
  type ScheduleSearch,
} from "@/lib/scheduleGenerator";
import type {
  ScheduleWorkerRequest,
  ScheduleWorkerResponse,
} from "@/types/generation";

// A page of results bounds UI memory growth. More resumes this exact cursor.
const PAGE_SIZE = 500;
let search: ScheduleSearch | undefined;
let total = 0;
let pageCount = 0;
let running = false;
let revision = 0;

function send(message: ScheduleWorkerResponse) {
  self.postMessage(message);
}

function pump(expectedRevision: number) {
  if (!running || !search || expectedRevision !== revision) return;
  try {
    const batch = search.advance({
      maxSteps: 2000,
      maxResults: Math.min(50, PAGE_SIZE - pageCount),
    });
    total += batch.schedules.length;
    pageCount += batch.schedules.length;
    if (batch.schedules.length)
      send({ type: "results", schedules: batch.schedules, total });
    if (batch.complete || pageCount >= PAGE_SIZE) {
      running = false;
      if (batch.complete) search = undefined;
      send({ type: batch.complete ? "complete" : "paused", total });
    } else {
      setTimeout(() => pump(expectedRevision), 0);
    }
  } catch (error) {
    running = false;
    search = undefined;
    send({
      type: "error",
      message:
        error instanceof Error ? error.message : "Schedule generation failed.",
    });
  }
}

self.onmessage = (event: MessageEvent<ScheduleWorkerRequest>) => {
  try {
    if (event.data.type === "start") {
      revision++;
      running = false;
      search = undefined;
      total = 0;
      pageCount = 0;
      search = createScheduleSearch(
        event.data.courses,
        event.data.blockedEvents,
      );
      running = true;
      pump(revision);
    } else if (event.data.type === "more" && search && !running) {
      pageCount = 0;
      running = true;
      pump(revision);
    }
  } catch (error) {
    send({
      type: "error",
      message:
        error instanceof Error ? error.message : "Schedule generation failed.",
    });
  }
};
