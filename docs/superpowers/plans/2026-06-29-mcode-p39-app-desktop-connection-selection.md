# P39 App Desktop Connection Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the app targets page choose and remember which MCode Desktop gateway connection drives readiness and local-service discovery.

**Architecture:** Add a pure Desktop connection selection helper under `src/agents/mcode-desktop`. The targets page renders selection cards, stores only the selected connection key in `uni` storage, and reuses the P38 readiness/service flow for the selected connection.

**Tech Stack:** TypeScript, Vue/uni-app, Jest.

## Global Constraints

- P39 is an app-side UX improvement.
- Keep Desktop-specific logic inside `src/agents/mcode-desktop`.
- Use `targetAgent`, not `targetType`.
- Do not change connection storage schema, relay, Desktop, pairing, tunnel, proxy, or official CLI protocols.
- Persist only the selected connection key; never persist tokens or pair secrets for this preference.
- Every mcode change must update `docs/mcode-architecture-notes/`.

---

### Task 1: Add Desktop Connection Selection Helper

**Files:**
- Create: `mcode-app/src/agents/mcode-desktop/connectionSelection.ts`
- Test: `mcode-app/tests/agents/mcode-desktop/connectionSelection.spec.ts`

**Interfaces:**
- Produces: `buildDesktopConnectionOptions(connections): DesktopConnectionOption[]`
- Produces: `chooseDesktopConnection(options, preferredKey): DesktopConnectionOption | null`

- [x] **Step 1: Add tests**

Cover filtering, labels, paired preference, preferred-key restoration, and
unpaired fallback.

- [x] **Step 2: Implement helper**

Use `buildConnectionKey` and existing connection metadata to create stable
options without exposing secrets.

### Task 2: Wire Selection Into Targets Page

**Files:**
- Modify: `mcode-app/src/pages/targets/index.vue`

**Interfaces:**
- Consumes: `buildDesktopConnectionOptions`
- Consumes: `chooseDesktopConnection`

- [x] **Step 1: Load options from stored connections**

Build options on refresh and choose the remembered or best fallback option.

- [x] **Step 2: Render selection cards**

Show display name, gateway URL, target id, paired state, and selected state.

- [x] **Step 3: Persist selection key**

Save only the selected option key and reload services for that connection.

### Task 3: Docs, Verification, Commit

**Files:**
- Modify: `docs/mcode-architecture-notes/2026-06-25-multi-provider-connection-routing.md`

- [x] **Step 1: Update docs**

Document P39 behavior, compatibility, security, and native guidance.

- [x] **Step 2: Run verification**

Run targeted app tests for Desktop selection/readiness/service discovery.

- [x] **Step 3: Commit**

Commit message: `feat(app): add p39 desktop connection selection`.
