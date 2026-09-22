import OpenAI from "openai";
import { env } from "../config/env.js";
import type { EventRecord } from "./eventService.js";

export const SEVERITIES = ["info", "warning", "critical"] as const;
export type Severity = (typeof SEVERITIES)[number];

export interface TriageResult {
  severity: Severity;
  threatAssessment: string;
  summary: string;
  recommendedAction: string;
  model: string;
}

export interface TriageProvider {
  triage(event: EventRecord): Promise<TriageResult>;
}

/**
 * Deterministic, rule-based triage used when no OPENAI_API_KEY is
 * configured. Keeps the pipeline fully runnable without a real key, behind
 * the same interface as the real provider — swap it out in
 * `getTriageProvider()` below.
 */
export class StubTriageProvider implements TriageProvider {
  async triage(event: EventRecord): Promise<TriageResult> {
    const highSeverityTypes = new Set(["fire_alarm", "panic_button", "glass_break", "perimeter_breach"]);
    const confidence = event.confidence ?? 0.5;

    let severity: Severity = "info";
    if (highSeverityTypes.has(event.type) && confidence >= 0.6) severity = "critical";
    else if (highSeverityTypes.has(event.type) || confidence >= 0.7) severity = "warning";

    return {
      severity,
      threatAssessment: `Stub triage: ${event.type} reported by ${event.source} at zone ${event.zone} (confidence ${confidence}).`,
      summary: `${event.type.replace(/_/g, " ")} at ${event.zone}`,
      recommendedAction: severity === "critical" ? "Dispatch operator to verify immediately" : severity === "warning" ? "Review promptly and verify if pattern continues" : "Monitor and review during routine check",
      model: "stub-rule-based",
    };
  }
}

const TRIAGE_SYSTEM_PROMPT = `You are a security operations triage assistant for an alarm monitoring platform.
Given a single sensor/camera event, assess its severity and recommend an action.
Respond with strict JSON only, matching this shape:
{"severity":"info"|"warning"|"critical","threatAssessment":string,"summary":string,"recommendedAction":string}`;

export class OpenAITriageProvider implements TriageProvider {
  private client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey });
  }

  async triage(event: EventRecord): Promise<TriageResult> {
    const completion = await this.client.chat.completions.create({
      model: env.TRIAGE_MODEL,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: TRIAGE_SYSTEM_PROMPT },
        {
          role: "user",
          content: JSON.stringify({
            type: event.type,
            source: event.source,
            zone: event.zone,
            siteId: event.siteId,
            confidence: event.confidence,
            timestamp: event.timestamp,
          }),
        },
      ],
    });

    const raw = completion.choices[0]?.message?.content;
    if (!raw) throw new Error("OpenAI triage returned no content");

    const parsed = JSON.parse(raw) as Partial<TriageResult>;
    if (!parsed.severity || !SEVERITIES.includes(parsed.severity)) {
      throw new Error(`OpenAI triage returned invalid severity: ${parsed.severity}`);
    }

    return {
      severity: parsed.severity,
      threatAssessment: parsed.threatAssessment ?? "",
      summary: parsed.summary ?? "",
      recommendedAction: parsed.recommendedAction ?? "",
      model: env.TRIAGE_MODEL,
    };
  }
}

let provider: TriageProvider | undefined;

export function getTriageProvider(): TriageProvider {
  if (!provider) {
    provider = env.OPENAI_API_KEY ? new OpenAITriageProvider(env.OPENAI_API_KEY) : new StubTriageProvider();
    console.log(`[triage] using provider: ${provider.constructor.name}`);
  }
  return provider;
}

/** Runs triage with a hard timeout so a slow/hanging AI call can't stall the worker forever. */
export async function triageWithTimeout(event: EventRecord, timeoutMs: number): Promise<TriageResult> {
  return await Promise.race([
    getTriageProvider().triage(event),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`triage timed out after ${timeoutMs}ms`)), timeoutMs)),
  ]);
}
