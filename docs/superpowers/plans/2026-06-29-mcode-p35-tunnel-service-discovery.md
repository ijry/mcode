# P35 Tunnel Service Discovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let mcode-app discover and open MCode Desktop local services through relay tunnel URLs.

**Architecture:** Add `localServices` as additive target metadata from Desktop to Relay. Relay normalizes and stores safe loopback service metadata, then exposes it through a session-authenticated current-target endpoint. The app adds service discovery helpers and target-page presentation while leaving conversation pages and relay admin concerns untouched.

**Tech Stack:** TypeScript, Vue/uni-app, Vitest, Rust/Tauri, Fastify, Supertest.

## Global Constraints

- P35 must not add mcode-app gateway administration UI.
- P35 must not touch `mcode-app/src/pages/conversations/index.vue`.
- Use `targetAgent`, not `targetType`.
- Service hosts remain loopback-only: `127.0.0.1`.
- Existing pairing, proxy, event, HTTP tunnel, and TCP tunnel protocols must remain backward compatible.
- Every mcode change must update `docs/mcode-architecture-notes/`.

---

### Task 1: Add Desktop Local Services To Upstream Metadata

**Files:**
- Modify: `mcode-desktop/src-tauri/src/gateway/upstream.rs`
- Test: `mcode-desktop/src-tauri/tests/desktop_p3_runtime.rs`

**Interfaces:**
- Produces: `localServices` field on `desktop_hello`
- Produces: `localServices` field on `pair_offer`

- [x] **Step 1: Serialize local services**

Add `local_services` to `DesktopUpstreamHello` and include state local services
in `from_state`.

- [x] **Step 2: Include local services in pair offer frame**

Update `build_pair_offer_frame` to accept and emit local services.

- [x] **Step 3: Verify desktop frame tests**

Run: `cd mcode-desktop/src-tauri && cargo test desktop_p3_runtime --quiet`

Expected: PASS.

### Task 2: Store Services On Relay Targets

**Files:**
- Modify: `mcode-relay/src/protocol/types.ts`
- Modify: `mcode-relay/src/pairing/store.ts`
- Modify: `mcode-relay/src/server.ts`
- Test: `mcode-relay/test/targetServices.test.ts`

**Interfaces:**
- Produces: `LocalServiceMetadata`
- Produces: `TargetRecord.localServices`
- Produces: `GET /v1/target-services`

- [x] **Step 1: Add service metadata type**

Define safe service shape with `name`, `host`, `port`, `protocol`, `enabled`.

- [x] **Step 2: Persist target services**

Normalize services from `desktop_hello`, `pair_offer`, and target restore.

- [x] **Step 3: Add session-authenticated endpoint**

`GET /v1/target-services` returns services for the authenticated current target
only.

- [x] **Step 4: Verify relay tests**

Run: `cd mcode-relay && npm test -- targetServices.test.ts relay.test.ts`

Expected: PASS.

### Task 3: Add App Service Discovery Helpers

**Files:**
- Modify: `mcode-app/src/services/gateway/types.ts`
- Modify: `mcode-app/src/services/gateway/relayGateway.ts`
- Create: `mcode-app/src/agents/mcode-desktop/serviceDiscovery.ts`
- Test: `mcode-app/tests/agents/mcode-desktop/serviceDiscovery.spec.ts`

**Interfaces:**
- Produces: `LocalServiceMetadata`
- Produces: `RelayGateway.listTargetServices()`
- Produces: `buildDesktopServiceEntries(connection, services)`

- [x] **Step 1: Add gateway interface method**

Make service discovery optional on `CodegGateway` so direct drivers are not
forced to implement it.

- [x] **Step 2: Implement relay request**

Call `/v1/target-services` with paired session authorization.

- [x] **Step 3: Build desktop service entries**

Map relay services into UI-ready entries using existing tunnel URL helper.

### Task 4: Add App Target Page UI

**Files:**
- Modify: `mcode-app/src/pages/targets/index.vue`
- Test: `mcode-app/tests/agents/mcode-desktop/serviceDiscovery.spec.ts`

**Interfaces:**
- Consumes: `buildDesktopServiceEntries`

- [x] **Step 1: Load service entries for active desktop gateway connection**

Resolve active/known connections, call service discovery, and store loading
state.

- [x] **Step 2: Render service section**

Show service name, bind, protocol, enabled status, and HTTP open action.

- [x] **Step 3: Keep TCP informational**

Show TCP entries without generic open action.

### Task 5: Docs, Verification, Commit

- [x] **Step 1: Update docs**

Update `docs/mcode-architecture-notes/2026-06-25-multi-provider-connection-routing.md`.

- [x] **Step 2: Run verification**

Run targeted relay, desktop, and app tests plus typechecks where available.

- [x] **Step 3: Commit**

Commit message: `feat: add p35 tunnel service discovery`
