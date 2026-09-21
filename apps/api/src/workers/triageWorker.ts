import { Worker, type Job } from "bullmq";
import { env } from "../config/env.js";
import { redisConnection } from "../lib/redis.js";
import { prisma } from "../lib/prisma.js";
import { broadcastUpdatedEvent } from "../lib/socket.js";
import { TRIAGE_QUEUE_NAME, type TriageJobData } from "../queues/triageQueue.js";
import { TRIAGE_STATUS, getEventById, type EventRecord } from "../services/eventService.js";
import { triageWithTimeout } from "../services/triageProvider.js";

async function processTriageJob(job: Job<TriageJobData>): Promise<void> {
  const event = await getEventById(job.data.eventId);
  if (!event) {
    // Nothing to do — event was deleted or the id was bad. Not retryable.
    console.warn(`[triageWorker] event not found for job ${job.id}: ${job.data.eventId}`);
    return;
  }

  await prisma.event.update({
    where: { id: event.id },
    data: { triageStatus: TRIAGE_STATUS.IN_PROGRESS },
  });

  const started = Date.now();
  const result = await triageWithTimeout(event, env.TRIAGE_TIMEOUT_MS);
  const llmLatencyMs = Date.now() - started;

  const updated = await prisma.event.update({
    where: { id: event.id },
    data: {
      triageStatus: TRIAGE_STATUS.COMPLETE,
      severity: result.severity,
      threatAssessment: result.threatAssessment,
      summary: result.summary,
      recommendedAction: result.recommendedAction,
      llmModel: result.model,
      llmLatencyMs,
      llmError: null,
    },
  });

  broadcastUpdatedEvent(updated);
}

export function startTriageWorker(): Worker<TriageJobData> {
  const worker = new Worker<TriageJobData>(TRIAGE_QUEUE_NAME, processTriageJob, {
    connection: redisConnection,
    concurrency: 5,
  });

  worker.on("failed", async (job, err) => {
    console.error(`[triageWorker] job ${job?.id} failed (attempt ${job?.attemptsMade}/${job?.opts.attempts}): ${err.message}`);

    if (!job) return;
    const exhausted = job.attemptsMade >= (job.opts.attempts ?? 1);
    if (!exhausted) return; // BullMQ will retry per the backoff policy

    // All retries used up: mark the event as failed so it isn't stuck
    // "IN_PROGRESS" forever, and tell the dashboard. Ingestion itself is
    // unaffected — this only touches the one event's triage state.
    try {
      const updated: EventRecord = await prisma.event.update({
        where: { id: job.data.eventId },
        data: { triageStatus: TRIAGE_STATUS.FAILED, llmError: err.message },
      });
      broadcastUpdatedEvent(updated);
    } catch (updateErr) {
      console.error(`[triageWorker] failed to record triage failure for ${job.data.eventId}:`, updateErr);
    }
  });

  worker.on("error", (err) => {
    console.error("[triageWorker] worker error:", err);
  });

  return worker;
}
