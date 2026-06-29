# P38 App Desktop Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a MCode Desktop gateway readiness panel to `mcode-app` so users understand paired Desktop capabilities and service availability.

**Architecture:** Keep Desktop-specific logic under `mcode-app/src/agents/mcode-desktop`. Add a pure readiness presenter that composes existing diagnostics, capability labels, and discovered service entries, then update `pages/targets/index.vue` to render it and expose navigation/copy actions.

**Tech Stack:** TypeScript, Vue/uni-app, Jest.

## Global Constraints

- P38 is an app-side UX improvement, not a relay admin feature.
- Keep Desktop-specific logic inside `src/agents/mcode-desktop`.
- Use `targetAgent`, not `targetType`.
- Do not change relay, Desktop, pairing, tunnel, proxy, or official CLI protocols.
- Copied diagnostics must not include access tokens, refresh tokens, pair secrets, or direct tokens.
- Every mcode change must update `docs/mcode-architecture-notes/`.

---

### Task 1: Add Desktop Readiness Presenter

**Files:**
- Create: `mcode-app/src/agents/mcode-desktop/readiness.ts`
- Test: `mcode-app/tests/agents/mcode-desktop/readiness.spec.ts`

**Interfaces:**
- Produces: `buildDesktopReadinessSummary(connection, serviceEntries): DesktopReadinessSummary`
- Produces: `buildDesktopReadinessDiagnosticText(summary): string`

- [x] **Step 1: Add tests**

Cover healthy Desktop gateway, missing pairing/capabilities, service counts,
and diagnostic text redaction.

- [x] **Step 2: Implement summary builder**

Use existing diagnostics/capability helpers and derive `level`, counts, labels,
target id, gateway URL, and display name.

- [x] **Step 3: Implement diagnostic text**

Return copyable non-secret lines for support.

### Task 2: Upgrade Targets Page UI

**Files:**
- Modify: `mcode-app/src/pages/targets/index.vue`

**Interfaces:**
- Consumes: `buildDesktopReadinessSummary`
- Consumes: `buildDesktopReadinessDiagnosticText`

- [x] **Step 1: Add readiness state**

Track selected Desktop connection, readiness summary, and discovered services.

- [x] **Step 2: Render readiness panel**

Show status, connection metadata, capabilities, diagnostics, service counts,
and action buttons.

- [x] **Step 3: Add actions**

Add refresh, open connections page, and copy diagnostic summary actions.

### Task 3: Docs, Verification, Commit

**Files:**
- Modify: `docs/mcode-architecture-notes/2026-06-25-multi-provider-connection-routing.md`

- [x] **Step 1: Update docs**

Document P38 architecture, UI behavior, compatibility, and native guidance.

- [x] **Step 2: Run verification**

Run targeted app tests for Desktop readiness/service discovery.

- [x] **Step 3: Commit**

Commit message: `feat(app): add p38 desktop readiness panel`.
