# MCode Gateway Target Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make gateway-mode connections preserve and validate the selected `targetAgent` instead of forcing `mcode-desktop`.

**Architecture:** The app keeps `targetAgent` independent from `routeMode` in the connection form, pair save path, and metadata validation path. Relay already stores `targetAgent` per logical target; this plan only adds explicit multi-target test coverage.

**Tech Stack:** Vue 3 / uni-app, TypeScript, Jest, Fastify relay, Vitest.

## Global Constraints

- Use `targetAgent`, not `targetType`.
- Do not add mobile-side `codex` or `claude` target agents.
- Gateway mode must support `codeg`, `opencode`, and `mcode-desktop`.
- Every mcode change must update a Markdown note under `docs/mcode-architecture-notes/`.
- App agent-specific behavior must stay under `mcode-app/src/agents/<agent>/` when new agent-specific logic is added.
- Do not introduce new `--mcode-*` theme variables.

---

## File Structure

- Modify `mcode-app/src/pages/connections/index.vue`: show target selector in gateway mode, stop overwriting `targetAgent`, persist selected target, validate pair response.
- Modify `mcode-app/tests/pages/connections/connectionPresentation.spec.ts`: cover gateway subtitles for Codeg/OpenCode targets.
- Modify `mcode-app/tests/pages/connections/connectionConfigCode.spec.ts`: cover v2 OpenCode gateway config roundtrip.
- Modify `mcode-app/tests/services/connectionSchema.spec.ts`: cover distinct keys for multiple gateway target agents on the same gateway.
- Modify `mcode-relay/test/relay.test.ts`: cover `/v1/targets` returning multiple `targetAgent` values.
- Update `docs/mcode-architecture-notes/2026-06-25-multi-provider-connection-routing.md`: already updated in the design commit; amend only if implementation adds new behavior beyond the design.

## Task 1: App Gateway Target Selection

**Files:**
- Modify: `mcode-app/src/pages/connections/index.vue`
- Test: existing Jest tests in later tasks

**Interfaces:**
- Consumes: `ConnectionTargetAgent`, `ConnectionGatewayProvider`, `createGateway().pair()`.
- Produces: gateway `ConnectionItem` records with selected `targetAgent`.

- [x] Step 1: Rename target selector constants from direct-only naming to route-neutral naming.
- [x] Step 2: Render the target selector above the route-specific fields so both direct and gateway modes use it.
- [x] Step 3: Replace `handleDirectTargetChange` with `handleTargetAgentChange`.
- [x] Step 4: Remove `form.targetAgent = "mcode-desktop"` from `handleRouteModeChange`.
- [x] Step 5: In gateway save, validate `session.targetAgent` when present:

```ts
if (session.targetAgent && session.targetAgent !== form.value.targetAgent) {
  throw new Error(`配对码属于 ${getTargetLabel(session.targetAgent)}，不是 ${getTargetLabel(form.value.targetAgent)}`)
}
```

- [x] Step 6: Save gateway connections with `targetAgent: form.value.targetAgent`.
- [x] Step 7: Update gateway helper text to say the pair code must come from the selected target.

## Task 2: App Schema And Presentation Tests

**Files:**
- Modify: `mcode-app/tests/services/connectionSchema.spec.ts`
- Modify: `mcode-app/tests/pages/connections/connectionPresentation.spec.ts`
- Modify: `mcode-app/tests/pages/connections/connectionConfigCode.spec.ts`

**Interfaces:**
- Consumes: `buildConnectionRecordKey`, `getConnectionSubtitle`, `buildConnectionConfigCode`, `parseConnectionConfigCodeToConnection`.
- Produces: regression tests that fail if gateway target agents collapse to Desktop.

- [x] Step 1: Add a schema test asserting `codeg/gateway` and `opencode/gateway` on the same gateway have different record keys.
- [x] Step 2: Add a presentation test asserting `OpenCode · 网关` is rendered for an OpenCode gateway connection.
- [x] Step 3: Add a config-code test asserting an OpenCode gateway v2 code roundtrips with `targetAgent = "opencode"`.
- [x] Step 4: Run `cd mcode-app; npm run test:unit -- --runTestsByPath tests/services/connectionSchema.spec.ts tests/pages/connections/connectionPresentation.spec.ts tests/pages/connections/connectionConfigCode.spec.ts`.

## Task 3: Relay Multi-Target Coverage

**Files:**
- Modify: `mcode-relay/test/relay.test.ts`

**Interfaces:**
- Consumes: `PairingStore.upsertTarget`, authenticated `/v1/targets`.
- Produces: coverage that one relay can list logical targets with different `targetAgent` values.

- [x] Step 1: Add a Vitest case that pairs once to obtain an access token, upserts Codeg/OpenCode/Desktop targets, then calls `/v1/targets`.
- [x] Step 2: Assert the response includes all three target agents and preserves their target ids.
- [x] Step 3: Run `cd mcode-relay; npm test -- --runInBand test/relay.test.ts` if supported, otherwise `npm test`.

## Task 4: Verification And Commit

**Files:**
- All files touched above.

- [x] Step 1: Run `cd mcode-app; npm run test:unit`.
- [x] Step 2: Run `cd mcode-relay; npm test`.
- [x] Step 3: Run `git diff --check`.
- [x] Step 4: Commit with `git commit -m "fix(app): support gateway target agent selection"`.

## Self-Review

- Spec coverage: UI target selector, gateway save persistence, pair metadata mismatch, relay multi-target listing, and native architecture note are covered.
- Placeholder scan: no deferred placeholders are required for this plan.
- Type consistency: all tasks use `targetAgent`, `routeMode`, `gatewayProvider`, and `targetProfile` consistently.
