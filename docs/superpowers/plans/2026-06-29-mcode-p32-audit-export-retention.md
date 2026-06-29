# MCode P32 Audit Export And Retention Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add configurable relay audit retention and tenant-scoped audit export for enterprise gateway operations.

**Architecture:** Keep relay transport protocols unchanged and build on the P30 tenant model plus P31 RBAC. `PairingStore` owns bounded audit retention, relay config provides `AUDIT_EVENT_LIMIT`, admin export routes reuse `audit.read` authorization, and export serialization redacts sensitive metadata keys.

**Tech Stack:** Node.js, Fastify 5, TypeScript, zod, Vitest, supertest, existing `PairingStore` / JSON persistence.

## Global Constraints

- Use `targetAgent`, not `targetType`.
- User-visible copy must use `网关`, not newly introduced `中继`.
- Keep all existing mobile, desktop, pairing, proxy, event, and tunnel wire protocols unchanged.
- Do not expose secrets, tokens, pair codes, session ids, or storage file paths through public health/info endpoints.
- Every mcode change must update a Markdown note under `docs/mcode-architecture-notes/`.

---

### Task 1: Add audit retention and export tests

**Files:**
- Create: `mcode-relay/test/auditExport.test.ts`
- Modify: `mcode-relay/test/gatewayInfo.test.ts`

**Interfaces:**
- Produces failing coverage for:
  - retention limit pruning
  - tenant-scoped audit export
  - JSONL export
  - sensitive metadata redaction
  - gateway diagnostics exposing retention limit

### Task 2: Implement audit retention and export

**Files:**
- Modify: `mcode-relay/src/config.ts`
- Modify: `mcode-relay/src/pairing/store.ts`
- Modify: `mcode-relay/src/server.ts`
- Modify: `mcode-relay/src/gateway/info.ts`

**Interfaces:**
- Produces:
  - `AUDIT_EVENT_LIMIT`
  - `PairingStore({ auditEventLimit })` constructor option
  - `listAuditEvents(limit, tenantId, filters?)`
  - `GET /v1/admin/audit-events/export`
  - export sanitization for sensitive metadata keys

### Task 3: Document P32 behavior

**Files:**
- Modify: `docs/mcode-architecture-notes/2026-06-25-multi-provider-connection-routing.md`
- Modify: `mcode-relay/README.md`

**Interfaces:**
- Produces architecture and native replication notes for audit export and retention.

### Task 4: Verify and commit

**Files:**
- Modify: `docs/superpowers/plans/2026-06-29-mcode-p32-audit-export-retention.md`

**Commands:**

```bash
cd mcode-relay && npm test -- auditExport.test.ts gatewayInfo.test.ts adminPolicy.test.ts relay.test.ts pairingStorePersistence.test.ts
cd mcode-relay && npm run typecheck
```

Commit:

```bash
git add -- mcode-relay/src/config.ts mcode-relay/src/pairing/store.ts mcode-relay/src/server.ts mcode-relay/src/gateway/info.ts mcode-relay/test/auditExport.test.ts mcode-relay/test/gatewayInfo.test.ts docs/mcode-architecture-notes/2026-06-25-multi-provider-connection-routing.md mcode-relay/README.md docs/superpowers/plans/2026-06-29-mcode-p32-audit-export-retention.md docs/superpowers/specs/2026-06-29-mcode-p32-audit-export-retention-design.md
git commit -m "feat(relay): add p32 audit export retention"
```
