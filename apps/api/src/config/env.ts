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

  // If unset, triage falls back to a deterministic stub provider so the
  // pipeline still works end-to-end without an OpenAI key.
  OPENAI_API_KEY: process.env.OPENAI_API_KEY ?? "",
  TRIAGE_MODEL: optional("TRIAGE_MODEL", "gpt-4o-mini"),
  TRIAGE_TIMEOUT_MS: Number(optional("TRIAGE_TIMEOUT_MS", "15000")),

  CORS_ORIGIN: optional("CORS_ORIGIN", "http://localhost:3000"),
};

if (!env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required (check apps/api/.env)");
}
