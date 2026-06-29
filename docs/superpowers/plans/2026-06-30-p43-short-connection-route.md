# P43 Short Connection Route Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace long route-embedded connection JSON with short local connection ids so tokens no longer appear in URLs.

**Architecture:** Add a stable local `id` to `ConnectionRecordV2` and normalize stored connections so missing ids are generated and written back. New navigation passes `connectionId=<local-id>`; destination pages resolve the full connection from local storage. Existing `connectionKey` encoded JSON remains only as a transition fallback.

**Tech Stack:** uni-app Vue 3, TypeScript, Jest, local `uni` storage.

## Global Constraints

- Do not migrate connection storage to SQLite in P43.
- Do not expose `directToken`, `pairSecret`, access tokens, or refresh tokens in generated routes.
- Config codes must not export local-only connection ids.
- Every mcode change must update `docs/mcode-architecture-notes/`.

---

### Task 1: Stable Local Connection Ids

**Files:**
- Modify: `mcode-app/src/services/connectionSchema.ts`
- Modify: `mcode-app/src/services/connectionContext.ts`
- Test: `mcode-app/tests/services/connectionSchema.spec.ts`
- Test: `mcode-app/tests/services/connectionContext.spec.ts`

**Interfaces:**
- Produces: `ConnectionRecordV2.id?: string`, `ensureConnectionRecordId(record, seed?)`, `findStoredConnectionById(id)`.

- [x] Add id normalization and generation.
- [x] Ensure `readStoredConnections()` writes back generated ids.
- [x] Add tests for deterministic id preservation and lookup.

### Task 2: Short Route Builders

**Files:**
- Modify: `mcode-app/src/services/connectionContext.ts`
- Modify: `mcode-app/src/services/projectGit.ts`
- Modify: `mcode-app/src/services/remoteSettings.ts`
- Modify: `mcode-app/src/pages/connections/index.vue`
- Modify: `mcode-app/src/pages/projects/index.vue`
- Modify: `mcode-app/src/pages/project-git/index.vue`
- Modify: `mcode-app/src/pages/project-git-commit/index.vue`
- Modify: `mcode-app/src/pages/sessions/index.vue`
- Modify: `mcode-app/src/pages/todos/index.vue`
- Modify: `mcode-app/src/pages/conversations/index.vue`

**Interfaces:**
- Consumes: `connection.id`.
- Produces: routes with `connectionId=<id>` instead of encoded JSON.

- [x] Replace new navigation URLs with short `connectionId`.
- [x] Keep route builder parameter names explicit.
- [x] Ensure no generated route contains JSON connection payload.

### Task 3: Destination Resolution

**Files:**
- Modify: `mcode-app/src/pages/projects/index.vue`
- Modify: `mcode-app/src/pages/project-git/index.vue`
- Modify: `mcode-app/src/pages/project-git-commit/index.vue`
- Modify: `mcode-app/src/pages/project-git-diff/index.vue`
- Modify: `mcode-app/src/pages/connection-agents/index.vue`
- Modify: `mcode-app/src/pages/model-providers/index.vue`
- Modify: `mcode-app/src/pages/sessions/index.vue`
- Modify: `mcode-app/src/pages/conversation-detail/index.vue`
- Modify: `mcode-app/src/pages/conversation-detail/detailConnectionResolution.ts`
- Test: `mcode-app/tests/pages/conversation-detail/detailConnectionResolution.spec.ts`

**Interfaces:**
- Consumes: `findStoredConnectionById(id)`.
- Produces: destination pages resolve full v2 connection locally.

- [x] Resolve `connectionId` first.
- [x] Fall back to current encoded `connection` / `connectionKey` only for old in-flight URLs.
- [x] Add detail resolver tests for id lookup and old encoded fallback.

### Task 4: Config Code And Docs

**Files:**
- Modify: `mcode-app/src/pages/connections/connectionConfigCode.ts`
- Test: `mcode-app/tests/pages/connections/connectionConfigCode.spec.ts`
- Add: `docs/mcode-architecture-notes/2026-06-30-p43-short-connection-routes.md`

**Interfaces:**
- Consumes: local id field.
- Produces: config code payloads without local id.

- [x] Assert config code payload omits `id`.
- [x] Add P43 architecture note.
- [x] Run focused and full app tests.
