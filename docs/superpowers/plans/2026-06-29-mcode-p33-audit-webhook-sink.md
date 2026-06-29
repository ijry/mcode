# P33 Audit Webhook Sink Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add optional real-time external audit webhook forwarding to `mcode-relay`.

**Architecture:** Relay keeps `PairingStore` as the local audit writer and adds a separate `AuditWebhookSink` for best-effort asynchronous delivery. A shared audit sanitizer is used by both export and webhook delivery. Gateway diagnostics report safe sink status without exposing URL or secret config.

**Tech Stack:** TypeScript, Fastify, Vitest, Supertest, Node `fetch`, `AbortSignal.timeout`.

## Global Constraints

- Do not change app, desktop, pairing, proxy, event, HTTP tunnel, or TCP tunnel protocols.
- Keep webhook delivery optional and disabled when `AUDIT_WEBHOOK_URL` is empty.
- Do not block API responses on webhook failure.
- Do not expose webhook URL or secret in `/health`, `/v1/gateway/info`, logs, or tests.
- Use `targetAgent`, not `targetType`.
- Every mcode change must update `docs/mcode-architecture-notes/`.

---

### Task 1: Extract Audit Sanitizer

**Files:**
- Create: `mcode-relay/src/audit/sanitize.ts`
- Modify: `mcode-relay/src/server.ts`
- Test: `mcode-relay/test/auditExport.test.ts`

**Interfaces:**
- Produces: `sanitizeAuditEvent(event: AuditEventRecord): AuditEventRecord`
- Produces: `sanitizeAuditMetadata(value: unknown): unknown`

- [x] **Step 1: Add reusable sanitizer module**

Create `mcode-relay/src/audit/sanitize.ts` exporting `sanitizeAuditEvent` and `sanitizeAuditMetadata`.

- [x] **Step 2: Replace server-local sanitizer**

Import `sanitizeAuditEvent` in `server.ts` and remove the local duplicate functions.

- [x] **Step 3: Verify audit export still redacts**

Run: `cd mcode-relay && npm test -- auditExport.test.ts`

Expected: PASS.

### Task 2: Add Webhook Sink Module

**Files:**
- Create: `mcode-relay/src/audit/webhookSink.ts`
- Modify: `mcode-relay/src/config.ts`
- Test: `mcode-relay/test/auditWebhook.test.ts`

**Interfaces:**
- Produces: `AuditWebhookSink`
- Produces: `deliver(event: AuditEventRecord): void`
- Produces: `getStatus(): AuditWebhookSinkStatus`

- [x] **Step 1: Add config fields**

Add `AUDIT_WEBHOOK_URL`, `AUDIT_WEBHOOK_SECRET`, and `AUDIT_WEBHOOK_TIMEOUT_MS`.

- [x] **Step 2: Implement sink**

The sink posts `{ event }` JSON, uses `x-mcode-audit-secret` only when configured, times out using configured milliseconds, and swallows all failures while updating status counters.

- [x] **Step 3: Add focused tests**

Mock `globalThis.fetch` and verify enabled delivery, disabled no-op behavior, redacted payload input, and failed delivery status.

### Task 3: Wire Sink Into Audit Writes

**Files:**
- Modify: `mcode-relay/src/server.ts`
- Test: `mcode-relay/test/auditWebhook.test.ts`

**Interfaces:**
- Produces: `RelayAppContext.auditWebhookSink`
- Produces: `recordAuditEvent(context, input): AuditEventRecord`

- [x] **Step 1: Extend context**

Create a default sink from config in `createRelayContext`.

- [x] **Step 2: Replace audit writes**

Route all existing `context.store.addAuditEvent(...)` calls in `server.ts` through `recordAuditEvent`.

- [x] **Step 3: Verify webhook failure does not break APIs**

Use a rejecting fetch mock and assert an admin mutation or pair request still returns success.

### Task 4: Add Diagnostics And Docs

**Files:**
- Modify: `mcode-relay/src/gateway/info.ts`
- Modify: `mcode-relay/README.md`
- Modify: `docs/mcode-architecture-notes/2026-06-25-multi-provider-connection-routing.md`
- Test: `mcode-relay/test/gatewayInfo.test.ts`

**Interfaces:**
- Produces: `deployment.auditWebhook`
- Produces: `health.auditWebhook`

- [x] **Step 1: Expose safe status**

Add status fields such as `enabled`, `deliveredCount`, `failedCount`, `lastDeliveredAt`, `lastErrorAt`, and `lastError`.

- [x] **Step 2: Update docs**

Document env vars, operational behavior, and native-client guidance.

- [x] **Step 3: Verify diagnostics do not leak secrets**

Assert `/v1/gateway/info` contains status but not the webhook URL or secret.

### Task 5: Final Verification And Commit

**Files:**
- All P33 files.

- [x] **Step 1: Run targeted tests**

Run: `cd mcode-relay && npm test -- auditWebhook.test.ts auditExport.test.ts gatewayInfo.test.ts adminPolicy.test.ts relay.test.ts`

Expected: PASS.

- [x] **Step 2: Run typecheck**

Run: `cd mcode-relay && npm run typecheck`

Expected: PASS.

- [x] **Step 3: Commit**

Run:

```bash
git add -- mcode-relay/src/config.ts mcode-relay/src/server.ts mcode-relay/src/gateway/info.ts mcode-relay/src/audit/sanitize.ts mcode-relay/src/audit/webhookSink.ts mcode-relay/test/auditWebhook.test.ts mcode-relay/test/auditExport.test.ts mcode-relay/test/gatewayInfo.test.ts mcode-relay/test/relay.test.ts mcode-relay/test/adminPolicy.test.ts mcode-relay/test/relayRecovery.test.ts mcode-relay/test/pairingStorePersistence.test.ts mcode-relay/README.md docs/mcode-architecture-notes/2026-06-25-multi-provider-connection-routing.md docs/superpowers/specs/2026-06-29-mcode-p33-audit-webhook-sink-design.md docs/superpowers/plans/2026-06-29-mcode-p33-audit-webhook-sink.md
git commit -m "feat(relay): add p33 audit webhook sink"
```
