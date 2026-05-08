-- Prompt 4 Edge API PostgreSQL schema
CREATE TYPE "RunStatus" AS ENUM ('queued', 'running', 'succeeded', 'failed', 'cancelled');
CREATE TYPE "PaymentStatus" AS ENUM ('quoted', 'pending', 'settled', 'refunded', 'expired', 'failed');

CREATE TABLE "policies" (
  "id" TEXT PRIMARY KEY,
  "owner_address" TEXT NOT NULL,
  "max_per_tx_wei" NUMERIC(78,0),
  "max_per_day_wei" NUMERIC(78,0),
  "allowlist_root" TEXT,
  "denylist_root" TEXT,
  "allowed_selectors" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "active" BOOLEAN NOT NULL DEFAULT TRUE,
  "summary" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "agents" (
  "id" TEXT PRIMARY KEY,
  "owner_address" TEXT NOT NULL,
  "account_address" TEXT UNIQUE,
  "token_id" TEXT,
  "metadata_root" TEXT,
  "policy_id" TEXT REFERENCES "policies"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "services" (
  "id" TEXT PRIMARY KEY,
  "agent_id" TEXT NOT NULL REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "service_id" TEXT NOT NULL,
  "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "price_wei" NUMERIC(78,0) NOT NULL,
  "description" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT TRUE,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "services_agent_id_service_id_key" UNIQUE ("agent_id", "service_id")
);

CREATE TABLE "payments" (
  "id" TEXT PRIMARY KEY,
  "quote_hash" TEXT NOT NULL UNIQUE,
  "payer_agent_id" TEXT NOT NULL,
  "payee_agent_id" TEXT NOT NULL,
  "service_db_id" TEXT REFERENCES "services"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "service_id" TEXT NOT NULL,
  "amount_wei" NUMERIC(78,0) NOT NULL,
  "status" "PaymentStatus" NOT NULL DEFAULT 'quoted',
  "tx_hash" TEXT,
  "refund_reason" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "settled_at" TIMESTAMP(3),
  "refunded_at" TIMESTAMP(3)
);

CREATE TABLE "subscriptions" (
  "id" TEXT PRIMARY KEY,
  "payer_agent_id" TEXT NOT NULL,
  "payee_agent_id" TEXT NOT NULL,
  "service_id" TEXT NOT NULL,
  "amount_wei" NUMERIC(78,0) NOT NULL,
  "every_ms" INTEGER NOT NULL,
  "daily_cap_wei" NUMERIC(78,0),
  "active" BOOLEAN NOT NULL DEFAULT TRUE,
  "next_run_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "memory_index" (
  "id" TEXT PRIMARY KEY,
  "agent_id" TEXT NOT NULL REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "key" TEXT NOT NULL,
  "storage_root" TEXT,
  "payload_hash" TEXT,
  "embedding" JSONB,
  "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "memory_index_agent_id_key_key" UNIQUE ("agent_id", "key")
);

CREATE TABLE "skill_installs" (
  "id" TEXT PRIMARY KEY,
  "agent_id" TEXT NOT NULL REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "skill_id" TEXT NOT NULL,
  "version" TEXT,
  "config" JSONB,
  "installed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "skill_installs_agent_id_skill_id_key" UNIQUE ("agent_id", "skill_id")
);

CREATE TABLE "runs" (
  "id" TEXT PRIMARY KEY,
  "agent_id" TEXT NOT NULL REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "status" "RunStatus" NOT NULL DEFAULT 'queued',
  "input" JSONB,
  "output" JSONB,
  "error" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "run_steps" (
  "id" TEXT PRIMARY KEY,
  "run_id" TEXT NOT NULL REFERENCES "runs"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "name" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "payload" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "receipts" (
  "id" TEXT PRIMARY KEY,
  "client_receipt_id" TEXT UNIQUE,
  "agent_id" TEXT NOT NULL,
  "action_tag" TEXT NOT NULL,
  "payload_hash" TEXT NOT NULL,
  "storage_root" TEXT NOT NULL,
  "value_wei" NUMERIC(78,0) NOT NULL,
  "tx_hash" TEXT,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "run_id" TEXT REFERENCES "runs"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "payment_id" TEXT REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "sessions" (
  "id" TEXT PRIMARY KEY,
  "owner_address" TEXT NOT NULL,
  "agent_id" TEXT REFERENCES "agents"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "jwt_id" TEXT UNIQUE,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "webhook_events" (
  "id" TEXT PRIMARY KEY,
  "source" TEXT NOT NULL,
  "event_type" TEXT NOT NULL,
  "idempotency_key" TEXT UNIQUE,
  "payload" JSONB NOT NULL,
  "processed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "policies_owner_address_idx" ON "policies"("owner_address");
CREATE INDEX "policies_active_idx" ON "policies"("active");
CREATE INDEX "agents_owner_address_idx" ON "agents"("owner_address");
CREATE INDEX "agents_policy_id_idx" ON "agents"("policy_id");
CREATE INDEX "services_service_id_idx" ON "services"("service_id");
CREATE INDEX "services_tags_idx" ON "services" USING GIN ("tags");
CREATE INDEX "services_active_idx" ON "services"("active");
CREATE INDEX "payments_payer_agent_id_created_at_idx" ON "payments"("payer_agent_id", "created_at");
CREATE INDEX "payments_payee_agent_id_created_at_idx" ON "payments"("payee_agent_id", "created_at");
CREATE INDEX "payments_status_idx" ON "payments"("status");
CREATE INDEX "payments_tx_hash_idx" ON "payments"("tx_hash");
CREATE INDEX "subscriptions_payer_agent_id_idx" ON "subscriptions"("payer_agent_id");
CREATE INDEX "subscriptions_active_next_run_at_idx" ON "subscriptions"("active", "next_run_at");
CREATE INDEX "memory_index_agent_id_updated_at_idx" ON "memory_index"("agent_id", "updated_at");
CREATE INDEX "memory_index_tags_idx" ON "memory_index" USING GIN ("tags");
CREATE INDEX "skill_installs_skill_id_idx" ON "skill_installs"("skill_id");
CREATE INDEX "runs_agent_id_created_at_idx" ON "runs"("agent_id", "created_at");
CREATE INDEX "runs_status_created_at_idx" ON "runs"("status", "created_at");
CREATE INDEX "run_steps_run_id_created_at_idx" ON "run_steps"("run_id", "created_at");
CREATE INDEX "receipts_agent_id_created_at_idx" ON "receipts"("agent_id", "created_at");
CREATE INDEX "receipts_tx_hash_idx" ON "receipts"("tx_hash");
CREATE INDEX "receipts_status_idx" ON "receipts"("status");
CREATE INDEX "receipts_run_id_idx" ON "receipts"("run_id");
CREATE INDEX "receipts_payment_id_idx" ON "receipts"("payment_id");
CREATE INDEX "sessions_owner_address_idx" ON "sessions"("owner_address");
CREATE INDEX "sessions_agent_id_idx" ON "sessions"("agent_id");
CREATE INDEX "sessions_expires_at_idx" ON "sessions"("expires_at");
CREATE INDEX "webhook_events_source_event_type_idx" ON "webhook_events"("source", "event_type");
CREATE INDEX "webhook_events_processed_at_idx" ON "webhook_events"("processed_at");
