# P37 Relay Admin Operations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the relay Web admin console operationally useful with tenant scoping, audit export, and static security headers.

**Architecture:** Keep P37 entirely in `mcode-relay`. The admin Web UI stores a tenant filter in `sessionStorage`, appends it to existing admin API calls, and exports audit data through the existing `/v1/admin/audit-events/export` endpoint. Static admin routes add CSP without adding a frontend build step.

**Tech Stack:** TypeScript, Fastify, static HTML/CSS/JS, Supertest, Vitest.

## Global Constraints

- P37 belongs to `mcode-relay`, not `mcode-app`.
- Do not change pairing, proxy, event, tunnel, or mobile client protocols.
- Do not change admin RBAC semantics; reuse existing server authorization.
- Do not persist admin tokens or audit exports in local storage.
- Every mcode change must update `docs/mcode-architecture-notes/`.

---

### Task 1: Harden Static Admin Routes

**Files:**
- Modify: `mcode-relay/src/adminWeb/static.ts`
- Modify: `mcode-relay/test/adminWeb.test.ts`

**Interfaces:**
- Produces: CSP header on `/admin` and `/admin/assets/*`

- [x] **Step 1: Add static security headers**

Add `content-security-policy`, `x-frame-options`, and
`permissions-policy` headers to every admin static response.

- [x] **Step 2: Verify headers**

Extend admin Web tests to assert CSP and frame headers.

### Task 2: Add Tenant-Scoped Admin UI

**Files:**
- Modify: `mcode-relay/src/adminWeb/assets/index.html`
- Modify: `mcode-relay/src/adminWeb/assets/admin.css`
- Modify: `mcode-relay/src/adminWeb/assets/admin.js`
- Modify: `mcode-relay/test/adminWeb.test.ts`

**Interfaces:**
- Consumes: existing `tenantId` query parameter on admin list/export APIs

- [x] **Step 1: Add tenant filter controls**

Add tenant filter input, apply button, and clear button to the toolbar.

- [x] **Step 2: Apply tenant query to reads**

Append `tenantId` to tenants, devices, sessions, audit events, credentials
fallback-safe reads where applicable.

- [x] **Step 3: Keep mutations explicit**

Do not silently rewrite mutation bodies except where existing forms already
send a tenant id.

### Task 3: Add Audit Export Actions

**Files:**
- Modify: `mcode-relay/src/adminWeb/assets/index.html`
- Modify: `mcode-relay/src/adminWeb/assets/admin.js`
- Modify: `mcode-relay/test/adminWeb.test.ts`

**Interfaces:**
- Consumes: `GET /v1/admin/audit-events/export?format=json|jsonl&tenantId=...`

- [x] **Step 1: Add export controls**

Add JSON and JSONL export buttons to the audit panel.

- [x] **Step 2: Implement browser download**

Fetch export response with admin token, create a blob URL, trigger download,
then revoke the object URL.

- [x] **Step 3: Verify assets reference export endpoint**

Assert the served admin JS includes `/v1/admin/audit-events/export` and tenant
query construction.

### Task 4: Docs, Verification, Commit

**Files:**
- Modify: `docs/mcode-architecture-notes/2026-06-25-multi-provider-connection-routing.md`
- Modify: `mcode-relay/README.md`

- [x] **Step 1: Update docs**

Document P37 behavior, compatibility, security, and native guidance.

- [x] **Step 2: Run verification**

Run `cd mcode-relay && npm test -- adminWeb.test.ts`,
`cd mcode-relay && npm run typecheck`, `cd mcode-relay && npm run build`, and
`cd mcode-relay && npm test`.

- [x] **Step 3: Commit**

Commit message: `feat(relay): add p37 admin ops controls`.
