# MCode Gateway Runtime Target Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure gateway target-agent selection remains correct after saved connections are used, refreshed, or re-paired at runtime.

**Architecture:** Move pair target-agent validation into a reusable service module so both the add-connection page and shared gateway driver use the same rule. Split gateway driver ids by `targetAgent` so Codeg, OpenCode, and MCode Desktop gateway connections no longer collapse into a legacy Codeg driver label.

**Tech Stack:** TypeScript, Vue/uni-app service layer, Jest.

## Global Constraints

- Use `targetAgent`, not `targetType`.
- Gateway mode must support `codeg`, `opencode`, and `mcode-desktop`.
- Do not add mobile-side `codex` or `claude` target agents.
- Every mcode change must update a Markdown note under `docs/mcode-architecture-notes/`.
- Keep agent-specific logic under `mcode-app/src/agents/<agent>/`; shared validation belongs in `mcode-app/src/services`.

---

## Task 1: Shared Pair Target Validation

**Files:**
- Create: `mcode-app/src/services/connectionPairValidation.ts`
- Modify: `mcode-app/src/pages/connections/index.vue`
- Delete: `mcode-app/src/pages/connections/connectionPairValidation.ts`
- Modify: `mcode-app/tests/pages/connections/connectionPairValidation.spec.ts`

- [ ] Step 1: Move `assertPairTargetAgentMatchesSelection` from page-local code into `src/services/connectionPairValidation.ts`.
- [ ] Step 2: Update page imports and tests to use the shared service path.
- [ ] Step 3: Keep the same user-facing mismatch error text.

## Task 2: Runtime Gateway Driver Enforcement

**Files:**
- Modify: `mcode-app/src/agents/shared/driverTypes.ts`
- Modify: `mcode-app/src/agents/codeg/legacyGatewayDriver.ts`
- Create: `mcode-app/src/agents/opencode/gatewayDriver.ts`
- Modify: `mcode-app/src/services/gateway/connectionDriverRegistry.ts`
- Modify: `mcode-app/tests/services/connectionDriverRegistry.spec.ts`

- [ ] Step 1: Add `opencode-gateway` and `codeg-gateway` driver ids.
- [ ] Step 2: Rename the Codeg gateway export to a non-legacy `codegGatewayDriver` while keeping legacy behavior as implementation-compatible.
- [ ] Step 3: Add an OpenCode gateway driver using the shared gateway connection driver.
- [ ] Step 4: Route `opencode/gateway` to `opencodeGatewayDriver`, `codeg/gateway` to `codegGatewayDriver`, and `mcode-desktop/gateway` to `desktopGatewayDriver`.
- [ ] Step 5: In `createGatewayConnectionDriver`, validate any pair response `targetAgent` against the saved connection before building target profile.

## Task 3: Runtime Tests

**Files:**
- Modify: `mcode-app/tests/services/connectionDriverRegistry.spec.ts`

- [ ] Step 1: Assert gateway driver ids for Codeg, OpenCode, and MCode Desktop are distinct.
- [ ] Step 2: Mock relay pair response for an OpenCode gateway connection and assert mismatch responses reject before persistence.
- [ ] Step 3: Run focused app tests.

## Task 4: Docs, Verification, Commit

**Files:**
- Modify: `docs/mcode-architecture-notes/2026-06-25-multi-provider-connection-routing.md`
- Modify: this plan file

- [ ] Step 1: Record runtime validation and per-agent gateway driver behavior in the architecture note.
- [ ] Step 2: Mark all plan items complete.
- [ ] Step 3: Run `cd mcode-app; npm run test:unit`.
- [ ] Step 4: Run `git diff --check`.
- [ ] Step 5: Commit with `git commit -m "fix(app): enforce gateway target agent at runtime"`.

## Self-Review

- Spec coverage: covers runtime re-pair, driver registry, and shared mismatch validation.
- Placeholder scan: no deferred placeholders.
- Type consistency: all fields use `targetAgent`, `routeMode`, and existing `RelaySessionInfo`.

