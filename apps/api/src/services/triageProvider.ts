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

/**
 * Works against any OpenAI-compatible chat completions endpoint — used for
 * both OpenAI itself and OpenRouter (same request/response shape, just a
 * different baseURL and model namespace).
 */
export class OpenAICompatibleTriageProvider implements TriageProvider {
  private client: OpenAI;
  private model: string;

  constructor(apiKey: string, model: string, baseURL?: string) {
    this.client = new OpenAI({ apiKey, baseURL });
    this.model = model;
  }

  async triage(event: EventRecord): Promise<TriageResult> {
    const completion = await this.client.chat.completions.create({
      model: this.model,
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
    if (!raw) throw new Error("triage LLM returned no content");

    const parsed = parseTriageJson(raw);
    if (!parsed.severity || !SEVERITIES.includes(parsed.severity)) {
      throw new Error(`triage LLM returned invalid severity: ${parsed.severity}`);
    }

    return {
      severity: parsed.severity,
      threatAssessment: parsed.threatAssessment ?? "",
      summary: parsed.summary ?? "",
      recommendedAction: parsed.recommendedAction ?? "",
      model: this.model,
    };
  }
}

/**
 * Some OpenRouter models (especially free-tier ones) don't strictly honor
 * `response_format: json_object` and wrap the JSON in prose/markdown
 * fences. Try a strict parse first, then fall back to extracting the first
 * {...} block, rather than treating every non-strict response as junk.
 */
function parseTriageJson(raw: string): Partial<TriageResult> {
  try {
    return JSON.parse(raw) as Partial<TriageResult>;
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("triage LLM response did not contain JSON");
    return JSON.parse(match[0]) as Partial<TriageResult>;
  }
}

/**
 * Wraps a real LLM provider and degrades to the deterministic stub the
 * moment it hits a rate limit (e.g. OpenRouter's free-tier daily/per-minute
 * caps). A 429 won't clear up within a BullMQ retry's backoff window, so
 * retrying the same call is pointless — better to fall back immediately and
 * keep the event moving than to burn all 3 attempts into a FAILED dead end.
 * Other error types (timeouts, bad JSON, network blips) still propagate to
 * the caller so BullMQ's normal retry/backoff applies.
 */
export class RateLimitFallbackTriageProvider implements TriageProvider {
  private primary: TriageProvider;
  private fallback: TriageProvider = new StubTriageProvider();

  constructor(primary: TriageProvider) {
    this.primary = primary;
  }

  async triage(event: EventRecord): Promise<TriageResult> {
    try {
      return await this.primary.triage(event);
    } catch (err) {
      if (!(err instanceof OpenAI.RateLimitError)) throw err;
      console.warn(`[triage] rate limited, falling back to stub for event ${event.eventId}: ${err.message}`);
      return this.fallback.triage(event);
    }
  }
}

let provider: TriageProvider | undefined;

export function getTriageProvider(): TriageProvider {
  if (!provider) {
    if (env.NVIDIA_API_KEY) {
      provider = new RateLimitFallbackTriageProvider(
        new OpenAICompatibleTriageProvider(env.NVIDIA_API_KEY, env.NVIDIA_MODEL, "https://integrate.api.nvidia.com/v1"),
      );
    } else if (env.OPENROUTER_API_KEY) {
      provider = new RateLimitFallbackTriageProvider(
        new OpenAICompatibleTriageProvider(env.OPENROUTER_API_KEY, env.OPENROUTER_MODEL, "https://openrouter.ai/api/v1"),
      );
    } else if (env.OPENAI_API_KEY) {
      provider = new RateLimitFallbackTriageProvider(new OpenAICompatibleTriageProvider(env.OPENAI_API_KEY, env.TRIAGE_MODEL));
    } else {
      provider = new StubTriageProvider();
    }
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
