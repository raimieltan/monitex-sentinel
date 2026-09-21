-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "zone" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "snapshotUrl" TEXT,
    "metadata" JSONB,
    "triageStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "severity" TEXT,
    "threatAssessment" TEXT,
    "summary" TEXT,
    "recommendedAction" TEXT,
    "llmLatencyMs" INTEGER,
    "llmModel" TEXT,
    "llmError" TEXT,
    "operatorStatus" TEXT NOT NULL DEFAULT 'OPEN',
    "acknowledgedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Event_eventId_key" ON "Event"("eventId");

-- CreateIndex
CREATE INDEX "Event_severity_idx" ON "Event"("severity");

-- CreateIndex
CREATE INDEX "Event_siteId_idx" ON "Event"("siteId");

-- CreateIndex
CREATE INDEX "Event_timestamp_idx" ON "Event"("timestamp");

-- CreateIndex
CREATE INDEX "Event_operatorStatus_idx" ON "Event"("operatorStatus");
