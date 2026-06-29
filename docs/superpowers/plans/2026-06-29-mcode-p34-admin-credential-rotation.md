# P34 Admin Credential Rotation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add dynamic admin credential creation, listing, revocation, persistence, diagnostics, and audit coverage to `mcode-relay`.

**Architecture:** Keep existing env-token RBAC as compatibility fallback. Add a focused `AdminCredentialStore` that stores token hashes only, resolve dynamic credentials before static env tokens, and restrict credential management APIs to owner principals. Credential mutations use the existing P33 audit path so webhook sinks receive sanitized lifecycle events.

**Tech Stack:** TypeScript, Fastify, Vitest, Supertest, Node `crypto`, JSON file persistence.

## Global Constraints

- Do not change app, desktop, pairing, proxy, event, HTTP tunnel, or TCP tunnel protocols.
- Use `targetAgent`, not `targetType`.
- Store dynamic admin tokens as hashes only.
- Return generated dynamic admin tokens only once from create API.
- Credential management routes require owner role.
- Credential create/revoke audit metadata must not include raw tokens or token hashes.
- Every mcode change must update `docs/mcode-architecture-notes/`.

---

### Task 1: Add Credential Store

**Files:**
- Create: `mcode-relay/src/admin/credentials.ts`
- Modify: `mcode-relay/src/config.ts`
- Test: `mcode-relay/test/adminCredentials.test.ts`

**Interfaces:**
- Produces: `AdminCredentialStore`
- Produces: `JsonFileAdminCredentialStoreStorage`
- Produces: `createCredential(input): { token: string; record: AdminCredentialRecord }`
- Produces: `resolveToken(token): AdminCredentialRecord | null`
- Produces: `listCredentials(): AdminCredentialRecord[]`
- Produces: `revokeCredential(credentialId, reason?): AdminCredentialRecord | null`

- [x] **Step 1: Add config field**

Add `ADMIN_CREDENTIAL_STORE_PATH` with default empty string.

- [x] **Step 2: Implement token-hash credential store**

Create records with generated tokens, store only `tokenHash`, normalize roles
and tenant scopes, persist JSON snapshots, and ignore revoked/expired
credentials during resolution.

- [x] **Step 3: Add store tests**

Verify token is returned once, list does not expose raw token, revoke blocks
resolution, and JSON storage restores records.

### Task 2: Wire Dynamic Credentials Into Policy

**Files:**
- Modify: `mcode-relay/src/admin/policy.ts`
- Modify: `mcode-relay/src/server.ts`
- Test: `mcode-relay/test/adminCredentials.test.ts`

**Interfaces:**
- Produces: `RelayAppContext.adminCredentialStore`
- Updates: `resolveAdminPrincipal(req, config, adminCredentialStore?)`
- Adds: `AdminAction = "credential.read" | "credential.write"`

- [x] **Step 1: Extend context**

Create a default dynamic credential store from config in `createRelayContext`.

- [x] **Step 2: Resolve dynamic credentials first**

Hash presented admin tokens, resolve active dynamic records first, then fall
back to `ADMIN_TOKEN_ROLES` and `ADMIN_TOKEN`.

- [x] **Step 3: Enforce owner-only credential actions**

Add credential read/write actions and deny non-owner principals.

### Task 3: Add Credential Admin APIs

**Files:**
- Modify: `mcode-relay/src/server.ts`
- Test: `mcode-relay/test/adminCredentials.test.ts`

**Interfaces:**
- Produces: `GET /v1/admin/credentials`
- Produces: `POST /v1/admin/credentials`
- Produces: `POST /v1/admin/credentials/:credentialId/revoke`

- [x] **Step 1: Add list route**

Return safe credential records without token or token hash.

- [x] **Step 2: Add create route**

Owner can create owner/admin/auditor credentials. `admin` and `auditor`
credentials require `tenantId`. Response includes generated token once and safe
record metadata.

- [x] **Step 3: Add revoke route**

Owner can revoke dynamic credentials by id. Missing ids return `404`.

- [x] **Step 4: Audit mutations**

Write `admin_credential.created` and `admin_credential.revoked` events without
raw token or hash metadata.

### Task 4: Add Diagnostics And Docs

**Files:**
- Modify: `mcode-relay/src/gateway/info.ts`
- Modify: `mcode-relay/README.md`
- Modify: `docs/mcode-architecture-notes/2026-06-25-multi-provider-connection-routing.md`
- Test: `mcode-relay/test/gatewayInfo.test.ts`

**Interfaces:**
- Produces: `stats.adminCredentials`
- Produces: `stats.activeAdminCredentials`
- Produces: `stats.revokedAdminCredentials`
- Produces: `storage.adminCredentialStore`

- [x] **Step 1: Expose safe diagnostics**

Report credential counts and store mode without exposing tokens, hashes, or
storage paths.

- [x] **Step 2: Update docs**

Document env config, routes, compatibility, and native admin guidance.

- [x] **Step 3: Verify diagnostics safety**

Assert gateway info does not contain raw dynamic tokens or hashes.

### Task 5: Final Verification And Commit

- [x] **Step 1: Run targeted tests**

Run: `cd mcode-relay && npm test -- adminCredentials.test.ts adminPolicy.test.ts gatewayInfo.test.ts auditWebhook.test.ts relay.test.ts`

Expected: PASS.

- [x] **Step 2: Run typecheck**

Run: `cd mcode-relay && npm run typecheck`

Expected: PASS.

- [x] **Step 3: Commit**

Commit message: `feat(relay): add p34 admin credential rotation`
