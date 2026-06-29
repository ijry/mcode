# MCode P31 Admin RBAC Policy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a relay-side RBAC/policy layer for admin APIs so enterprise operators can distinguish owner, admin, and auditor access without changing relay pairing or transport protocols.

**Architecture:** Keep the relay wire protocol unchanged and scope this phase to `/v1/admin/*`. Extend relay config with a JSON token-to-role policy map, resolve each admin request into a role-scoped principal, and enforce route-level plus tenant-scoped checks before any store read or mutation. Public health/info stay diagnostic-only and can expose the current policy mode, but never secrets or policy file contents.

**Tech Stack:** Node.js, Fastify 5, TypeScript, zod, Vitest, supertest, existing `PairingStore` / `RelayHub` / JSON file persistence.

## Global Constraints

- Use `targetAgent`, not `targetType`.
- User-visible copy must use `网关`, not newly introduced `中继`.
- Keep all existing public relay wire protocols unchanged.
- Do not expose secrets, tokens, pair codes, session ids, or storage file paths through public health/info endpoints.
- Every mcode change must update a Markdown note under `docs/mcode-architecture-notes/`.

---

### Task 1: Add policy and authorization coverage

**Files:**
- Modify: `mcode-relay/test/relay.test.ts`
- Modify: `mcode-relay/test/gatewayInfo.test.ts`
- Create: `mcode-relay/test/adminPolicy.test.ts`

**Interfaces:**
- Consumes the current admin routes and public health/info routes.
- Produces failing tests for token-role parsing, role-based access control, and tenant-scoped deny/allow behavior.

- [ ] **Step 1: Write policy tests for role resolution**

Create `mcode-relay/test/adminPolicy.test.ts` with tests that assert:

```ts
const config = {
  ADMIN_TOKEN: "owner-secret",
  ADMIN_TOKEN_ROLES: JSON.stringify({
    "owner-secret": { role: "owner" },
    "audit-secret": { role: "auditor", tenantId: "tenant-a" },
    "ops-secret": { role: "admin", tenantId: "tenant-b" },
  }),
}
```

The tests should verify:

- `owner-secret` can call tenant create, tenant reassignment, and audit read routes.
- `audit-secret` can call tenant/device/session/audit read routes but gets 403 on mutations.
- `ops-secret` can read and mutate only within the assigned tenant, and gets 403 on cross-tenant access.

- [ ] **Step 2: Extend gateway info assertions**

Add assertions that `/v1/gateway/info` reports the policy mode and safe warning flags, without exposing raw token values or the token-role mapping.

- [ ] **Step 3: Extend relay route coverage**

Add route-level assertions in `mcode-relay/test/relay.test.ts` that:

- unauthenticated admin requests still return 401
- auditor requests return 403 on mutation routes
- owner requests still succeed

### Task 2: Implement token-role policy enforcement

**Files:**
- Modify: `mcode-relay/src/config.ts`
- Modify: `mcode-relay/src/server.ts`
- Modify: `mcode-relay/src/gateway/info.ts`

**Interfaces:**
- Produces:
  - `ADMIN_TOKEN_ROLES` config
  - `AdminRole = "owner" | "admin" | "auditor"`
  - `AdminPrincipal`
  - `resolveAdminPrincipal(req, config)`
  - `authorizeAdminRoute(principal, action, tenantId?)`

- [ ] **Step 1: Add config parsing for token roles**

Extend config with an `ADMIN_TOKEN_ROLES` string env var containing JSON token role entries. Parse it into a normalized lookup map where:

- unknown roles are rejected during config load
- malformed JSON is rejected during config load
- empty mapping defaults to the current `ADMIN_TOKEN` behaving as `owner`
- duplicate tokens are rejected early so misconfiguration fails fast

- [ ] **Step 2: Add a small admin policy helper in `server.ts`**

Implement a policy helper that resolves each request into:

- `token`
- `role`
- `tenantId`
- `scope`

Enforce:

- `owner` can do everything on `/v1/admin/*`
- `admin` can read/write tenant-scoped device/session/audit routes and create/update only its assigned tenant
- `auditor` can only read its assigned tenant

Return 403 with a stable body such as `{ error: "forbidden", reason: "..." }`.

- [ ] **Step 3: Wire policy into admin routes**

Update the admin handlers to call the policy helper before touching the store. Keep the existing 401 path for missing/invalid credentials, but convert policy denials to 403. Do not change non-admin routes.

- [ ] **Step 4: Surface policy mode in diagnostics**

Update gateway info to expose:

- `deployment.policyMode = "token-role"`
- `deployment.policyWarnings[]`

Do not include the token-role mapping or any secret values in diagnostics.

### Task 3: Document P31 behavior

**Files:**
- Modify: `docs/mcode-architecture-notes/2026-06-25-multi-provider-connection-routing.md`
- Modify: `mcode-relay/README.md`

**Interfaces:**
- Produces architecture and native replication notes for RBAC-aware relay deployments.

- [ ] **Step 1: Update the architecture note**

Append a P31 section that explains the token-role model, 401 vs 403 behavior, tenant-scoped admin rules, and native admin client guidance.

- [ ] **Step 2: Update the relay README**

Add an enterprise admin section describing `ADMIN_TOKEN_ROLES`, the available roles, and how operators should interpret 401/403 responses.

### Task 4: Verify and commit the phase

**Files:**
- Modify: `docs/superpowers/plans/2026-06-29-mcode-p31-admin-rbac-policy.md`

**Interfaces:**
- Produces a tested RBAC/policy slice and a commit record.

- [ ] **Step 1: Run focused tests**

Run:

```bash
cd mcode-relay && npm test -- adminPolicy.test.ts gatewayInfo.test.ts relay.test.ts pairingStorePersistence.test.ts
cd mcode-relay && npm run typecheck
```

- [ ] **Step 2: Commit the phase**

```bash
git add -- mcode-relay/src/config.ts mcode-relay/src/server.ts mcode-relay/src/gateway/info.ts mcode-relay/test/adminPolicy.test.ts mcode-relay/test/gatewayInfo.test.ts mcode-relay/test/relay.test.ts docs/mcode-architecture-notes/2026-06-25-multi-provider-connection-routing.md mcode-relay/README.md docs/superpowers/plans/2026-06-29-mcode-p31-admin-rbac-policy.md docs/superpowers/specs/2026-06-29-mcode-p31-admin-rbac-policy-design.md
git commit -m "feat(relay): add p31 admin rbac policy"
```
