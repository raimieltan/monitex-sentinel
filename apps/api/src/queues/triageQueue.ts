import { Queue } from "bullmq";
import { redisConnection } from "../lib/redis.js";

export const TRIAGE_QUEUE_NAME = "triage";

export interface TriageJobData {
  eventId: string; // internal Event.id (cuid), not the business event_id
}

export const triageQueue = new Queue<TriageJobData>(TRIAGE_QUEUE_NAME, {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 1000 },
  },
});

export function enqueueTriageJob(eventId: string) {
  return triageQueue.add("triage-event", { eventId });
}
