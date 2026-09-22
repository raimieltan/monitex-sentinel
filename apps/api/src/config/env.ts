/**
 * Central place for environment configuration. Everything else in the app
 * should read from here instead of touching `process.env` directly, so the
 * required/default values are documented in one spot.
 */
import "dotenv/config";

function optional(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

export const env = {
  PORT: Number(optional("PORT", "4000")),

  DATABASE_URL: process.env.DATABASE_URL ?? "",
  REDIS_URL: optional("REDIS_URL", "redis://localhost:6379"),

  SIMULATOR_WS_URL: optional("SIMULATOR_WS_URL", "ws://localhost:8765"),

  // Triage tries a chain of providers in order — NVIDIA's integrate API
  // (highest free rate limit: 40 RPM / 10,000 RPD) with a second model as
  // an in-house fallback (NVIDIA's shared endpoint can 503 under load
  // independent of any one model), then Groq, then OpenRouter, then OpenAI,
  // then falls back to a deterministic stub provider — the pipeline runs
  // end-to-end either way. See services/triageProvider.ts's
  // getTriageProvider().
  NVIDIA_API_KEY: process.env.NVIDIA_API_KEY ?? "",
  NVIDIA_MODEL: optional("NVIDIA_MODEL", "nvidia/nemotron-3-super-120b-a12b"),
  NVIDIA_FALLBACK_MODEL: optional("NVIDIA_FALLBACK_MODEL", "moonshotai/kimi-k3"),
  GROQ_API_KEY: process.env.GROQ_API_KEY ?? "",
  GROQ_MODEL: optional("GROQ_MODEL", "openai/gpt-oss-20b"),
  OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY ?? "",
  OPENROUTER_MODEL: optional("OPENROUTER_MODEL", "nvidia/nemotron-3-super-120b-a12b:free"),
  OPENAI_API_KEY: process.env.OPENAI_API_KEY ?? "",
  TRIAGE_MODEL: optional("TRIAGE_MODEL", "gpt-4o-mini"),
  TRIAGE_TIMEOUT_MS: Number(optional("TRIAGE_TIMEOUT_MS", "15000")),

  CORS_ORIGIN: optional("CORS_ORIGIN", "http://localhost:3000"),
};

if (!env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required (check apps/api/.env)");
}
