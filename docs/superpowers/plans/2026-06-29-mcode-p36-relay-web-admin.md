# P36 Relay Web Admin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a built-in Web administration console for `mcode-relay` gateway operators.

**Architecture:** `mcode-relay` serves static admin assets from `/admin` and `/admin/assets/*`. The console uses existing `/health`, `/v1/gateway/info`, and `/v1/admin/*` APIs with `x-mcode-admin-token`; no new admin authority or mobile app behavior is introduced.

**Tech Stack:** TypeScript, Fastify, static HTML/CSS/JS, Supertest, Vitest.

## Global Constraints

- P36 belongs to `mcode-relay`, not `mcode-app`.
- Do not change pairing, proxy, event, HTTP tunnel, TCP tunnel, or mobile client protocols.
- Do not introduce a separate frontend build pipeline in P36.
- Do not persist admin tokens beyond browser `sessionStorage`.
- Every mcode change must update `docs/mcode-architecture-notes/`.
- Do not touch `mcode-app/src/pages/conversations/index.vue`.

---

### Task 1: Serve Admin Console Assets

**Files:**
- Create: `mcode-relay/src/adminWeb/assets/index.html`
- Create: `mcode-relay/src/adminWeb/assets/admin.css`
- Create: `mcode-relay/src/adminWeb/assets/admin.js`
- Create: `mcode-relay/src/adminWeb/static.ts`
- Modify: `mcode-relay/src/server.ts`
- Test: `mcode-relay/test/adminWeb.test.ts`

**Interfaces:**
- Produces: `registerAdminWebRoutes(app: FastifyInstance): void`
- Produces: `GET /admin`
- Produces: `GET /admin/assets/:file`

- [x] **Step 1: Add static asset route helper**

Create `registerAdminWebRoutes` that serves only allowlisted admin files with
explicit content types.

- [x] **Step 2: Register helper in relay app**

Call `registerAdminWebRoutes(app)` in `buildRelayApp` after websocket
registration and before API route declarations.

- [x] **Step 3: Add routing tests**

Verify `/admin` returns HTML, `/admin/assets/admin.js` returns JavaScript, and
unknown admin assets return 404.

### Task 2: Build First Admin UI

**Files:**
- Modify: `mcode-relay/src/adminWeb/assets/index.html`
- Modify: `mcode-relay/src/adminWeb/assets/admin.css`
- Modify: `mcode-relay/src/adminWeb/assets/admin.js`
- Test: `mcode-relay/test/adminWeb.test.ts`

**Interfaces:**
- Consumes: `/health`
- Consumes: `/v1/gateway/info`
- Consumes: `/v1/admin/devices`
- Consumes: `/v1/admin/sessions`
- Consumes: `/v1/admin/tenants`
- Consumes: `/v1/admin/audit-events`
- Consumes: `/v1/admin/credentials`

- [x] **Step 1: Add token login shell**

Render a token input, connect button, status banner, and refresh button.

- [x] **Step 2: Add data panels**

Fetch and render gateway summary, tenants, devices, sessions, audit events, and
credentials.

- [x] **Step 3: Add existing mutation actions**

Wire buttons/forms for create tenant, move target tenant, restore/revoke target,
revoke session, create credential, and revoke credential.

### Task 3: Docs, Verification, Commit

**Files:**
- Modify: `docs/mcode-architecture-notes/2026-06-25-multi-provider-connection-routing.md`
- Modify: `mcode-relay/README.md`

- [x] **Step 1: Update architecture note**

Add P36 behavior, compatibility, security, and native replication guidance.

- [x] **Step 2: Update relay README**

Document `/admin`, token behavior, and that RBAC still applies to APIs.

- [x] **Step 3: Run verification**

Run `cd mcode-relay && npm test -- adminWeb.test.ts` and
`cd mcode-relay && npm run typecheck`.

- [x] **Step 4: Commit**

Commit message: `feat(relay): add p36 web admin console`.
