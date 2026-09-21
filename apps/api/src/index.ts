import { createServer } from "node:http";
import cors from "cors";
import express from "express";
import { env } from "./config/env.js";
import { initSocket } from "./lib/socket.js";
import { startIngestion } from "./services/ingestion.js";
import { startTriageWorker } from "./workers/triageWorker.js";
import { healthRouter } from "./routes/health.js";
import { eventsRouter } from "./routes/events.js";

const app = express();
app.use(cors({ origin: env.CORS_ORIGIN }));
app.use(express.json());

app.use(healthRouter);
app.use(eventsRouter);

// Catch-all error handler so a thrown error in a route doesn't crash the
// process — it just fails that one request.
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("[api] unhandled route error:", err);
  res.status(500).json({ error: "internal server error" });
});

const httpServer = createServer(app);
initSocket(httpServer);

httpServer.listen(env.PORT, () => {
  console.log(`[api] sentinel-api listening on http://localhost:${env.PORT}`);
});

// Background pipeline: ingest from the simulator and process triage jobs.
// Both run in this same process for simplicity, but neither blocks the
// HTTP/WebSocket server above.
startIngestion();
startTriageWorker();
