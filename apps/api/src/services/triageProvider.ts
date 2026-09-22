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

// How long to skip a provider entirely after it trips the breaker —
// free-tier/shared endpoints (e.g. NVIDIA's integrate API, OpenRouter's
// free models) can stay overloaded for a while, so retrying every single
// event is wasted latency on a call we already expect to fail.
const BREAKER_COOLDOWN_MS = 60_000;

interface ChainEntry {
  label: string;
  provider: TriageProvider;
  breakerOpenUntil: number;
}

/**
 * Tries a list of real LLM providers in order and degrades to the
 * deterministic stub once all of them are unavailable. Each entry gets its
 * own circuit breaker: a rate limit or transient server error (e.g.
 * OpenRouter's free-tier caps, or NVIDIA's shared endpoint returning 503
 * under load) trips that entry's breaker for BREAKER_COOLDOWN_MS, so a
 * known-bad provider/model is skipped on subsequent events instead of
 * re-attempting a call we already expect to fail — falling through to the
 * next entry in the chain (or the stub) immediately.
 *
 * This also naturally supports multiple models against the same provider
 * (e.g. two NVIDIA models) — a 503 on the shared endpoint isn't always
 * model-specific, but trying a different model is a cheap, useful second
 * attempt before giving up on real triage entirely for that event.
 *
 * Other error types (timeouts, bad JSON, network blips) still propagate to
 * the caller so BullMQ's normal retry/backoff applies.
 */
export class FallbackChainTriageProvider implements TriageProvider {
  private chain: ChainEntry[];
  private stub: TriageProvider = new StubTriageProvider();

  constructor(entries: { label: string; provider: TriageProvider }[]) {
    this.chain = entries.map((e) => ({ ...e, breakerOpenUntil: 0 }));
  }

  async triage(event: EventRecord): Promise<TriageResult> {
    const now = Date.now();
    for (const entry of this.chain) {
      if (now < entry.breakerOpenUntil) continue;
      try {
        return await entry.provider.triage(event);
      } catch (err) {
        if (!(err instanceof OpenAI.RateLimitError) && !(err instanceof OpenAI.InternalServerError)) throw err;
        entry.breakerOpenUntil = Date.now() + BREAKER_COOLDOWN_MS;
        console.warn(
          `[triage] ${entry.label} ${err instanceof OpenAI.RateLimitError ? "rate limited" : "errored"}, skipping for ${BREAKER_COOLDOWN_MS / 1000}s (event ${event.eventId}): ${err.message}`,
        );
      }
    }
    return this.stub.triage(event);
  }
}

let provider: TriageProvider | undefined;

export function getTriageProvider(): TriageProvider {
  if (!provider) {
    const chain: { label: string; provider: TriageProvider }[] = [];

    if (env.NVIDIA_API_KEY) {
      chain.push({
        label: `nvidia:${env.NVIDIA_MODEL}`,
        provider: new OpenAICompatibleTriageProvider(env.NVIDIA_API_KEY, env.NVIDIA_MODEL, "https://integrate.api.nvidia.com/v1"),
      });
      if (env.NVIDIA_FALLBACK_MODEL) {
        chain.push({
          label: `nvidia:${env.NVIDIA_FALLBACK_MODEL}`,
          provider: new OpenAICompatibleTriageProvider(env.NVIDIA_API_KEY, env.NVIDIA_FALLBACK_MODEL, "https://integrate.api.nvidia.com/v1"),
        });
      }
    }
    if (env.GROQ_API_KEY) {
      chain.push({
        label: `groq:${env.GROQ_MODEL}`,
        provider: new OpenAICompatibleTriageProvider(env.GROQ_API_KEY, env.GROQ_MODEL, "https://api.groq.com/openai/v1"),
      });
    }
    if (env.OPENROUTER_API_KEY) {
      chain.push({
        label: `openrouter:${env.OPENROUTER_MODEL}`,
        provider: new OpenAICompatibleTriageProvider(env.OPENROUTER_API_KEY, env.OPENROUTER_MODEL, "https://openrouter.ai/api/v1"),
      });
    }
    if (env.OPENAI_API_KEY) {
      chain.push({
        label: `openai:${env.TRIAGE_MODEL}`,
        provider: new OpenAICompatibleTriageProvider(env.OPENAI_API_KEY, env.TRIAGE_MODEL),
      });
    }

    provider = chain.length > 0 ? new FallbackChainTriageProvider(chain) : new StubTriageProvider();
    console.log(`[triage] using provider: ${chain.length > 0 ? `chain [${chain.map((c) => c.label).join(" -> ")}]` : "stub-rule-based"}`);
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
