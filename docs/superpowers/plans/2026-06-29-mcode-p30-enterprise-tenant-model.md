# MCode P30 Enterprise Tenant Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `mcode-relay` a tenant-aware enterprise data model with persistent tenants, tenant-scoped admin operations, and backward-compatible defaults for existing single-tenant deployments.

**Architecture:** Keep the relay wire protocol unchanged. Extend the existing pairing store snapshot so tenants, targets, sessions, and audit events all carry `tenantId`, then expose tenant admin APIs that can list and reassign targets without exposing secrets or file paths. Public health/info stays diagnostic-only, while admin endpoints remain token-gated.

**Tech Stack:** Node.js, Fastify 5, TypeScript, zod, Vitest, supertest, existing `PairingStore` / `RelayHub` / JSON file persistence.

## Global Constraints

- Use `targetAgent`, not `targetType`.
- User-visible copy must use `网关`, not newly introduced `中继`.
- Keep all existing public relay wire protocols unchanged.
- Do not expose secrets, tokens, pair codes, session ids, or storage file paths through public health/info endpoints.
- Every mcode change must update a Markdown note under `docs/mcode-architecture-notes/`.

---

### Task 1: Add tenant-aware store coverage

**Files:**
- Modify: `mcode-relay/test/pairingStorePersistence.test.ts`
- Modify: `mcode-relay/test/gatewayInfo.test.ts`

**Interfaces:**
- Consumes `PairingStore` persistence behavior.
- Produces regression tests for tenant persistence, tenant counts, and storage compatibility.

- [ ] **Step 1: Add a persistence test for tenants**

Add a case that writes a tenant, assigns a target to it, creates a session, and restores from JSON. Assert that the restored target, session, and audit event all keep the same `tenantId`, and that an old snapshot without `tenants` still restores into the default tenant.

- [ ] **Step 2: Extend gateway info assertions**

Add assertions that `/health` reports `tenants` in stats and that `/v1/gateway/info` includes `enterprise.tenants` in `features`.

### Task 2: Implement tenant model and admin APIs

**Files:**
- Modify: `mcode-relay/src/pairing/store.ts`
- Modify: `mcode-relay/src/protocol/types.ts`
- Modify: `mcode-relay/src/server.ts`
- Modify: `mcode-relay/src/gateway/info.ts`

**Interfaces:**
- Produces:
  - `TenantRecord`
  - `PairingStore.upsertTenant()`
  - `PairingStore.assignTargetTenant()`
  - optional `tenantId` filtering on list helpers
  - `GET /v1/admin/tenants`
  - `POST /v1/admin/tenants`
  - `POST /v1/admin/devices/:targetId/tenant`

- [ ] **Step 1: Extend the store snapshot**

Add `tenantId` to targets, sessions, audit events, and pairing offers, and add a `tenants` collection to the JSON snapshot. Default unknown or legacy records to the `default` tenant so old files stay readable.

- [ ] **Step 2: Wire tenant-aware admin endpoints**

Filter `devices`, `sessions`, and `audit-events` by optional `tenantId` query or `x-mcode-tenant-id` header, add tenant list/create endpoints, and add a target reassignment endpoint that writes a tenant audit record.

- [ ] **Step 3: Expose tenant counts in public diagnostics**

Update health/info stats to report tenant count and advertise the new enterprise tenant feature without leaking any sensitive values.

### Task 3: Document the P30 behavior

**Files:**
- Modify: `docs/mcode-architecture-notes/2026-06-25-multi-provider-connection-routing.md`
- Modify: `mcode-relay/README.md`

**Interfaces:**
- Produces architecture and native replication notes for tenant-aware relay deployments.

- [ ] **Step 1: Update the architecture note**

Document the tenant model, default-tenant compatibility, admin scoping rules, JSON persistence shape, and native iOS/Android replication guidance.

- [ ] **Step 2: Update the relay README**

Add a short enterprise ops section covering tenants, admin filtering, reassignment, and the fact that the public health/info endpoints remain diagnostic-only.

### Task 4: Verify and record progress

**Files:**
- Modify: `docs/superpowers/plans/2026-06-29-mcode-p30-enterprise-tenant-model.md`

**Interfaces:**
- Produces a verified implementation and a concrete progress record.

- [ ] **Step 1: Run focused tests**

Run:

```bash
cd mcode-relay && npm test -- pairingStorePersistence.test.ts gatewayInfo.test.ts relay.test.ts
cd mcode-relay && npm run typecheck
```

- [ ] **Step 2: Commit the phase**

```bash
git add -- mcode-relay/src/pairing/store.ts mcode-relay/src/protocol/types.ts mcode-relay/src/server.ts mcode-relay/src/gateway/info.ts mcode-relay/test/pairingStorePersistence.test.ts mcode-relay/test/gatewayInfo.test.ts docs/mcode-architecture-notes/2026-06-25-multi-provider-connection-routing.md mcode-relay/README.md docs/superpowers/plans/2026-06-29-mcode-p30-enterprise-tenant-model.md
git commit -m "feat(relay): add p30 tenant model"
```
