# mcode Connection Agent And Provider Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add connection-scoped remote agent and model provider management to mcode.

**Architecture:** A shared remote settings service defines the mobile contract and RPC wrappers. The connections page links to two new pages with encoded connection context; each page resolves the gateway and talks to the remote codeg host.

**Tech Stack:** Vue 3 script setup, uni-app, uview-plus, TypeScript, Jest.

---

### Task 1: Shared Service

**Files:**
- Create: `mcode-app/src/services/remoteSettings.ts`
- Test: `mcode-app/tests/services/remoteSettings.spec.ts`

- [ ] Define agent/provider types, route builders, env helpers, task ids, and event normalizers.
- [ ] Wrap the backend RPC commands with the exact camelCase payloads used by codeg web handlers.
- [ ] Add unit tests for helper behavior and payload shapes.

### Task 2: Navigation Entry

**Files:**
- Modify: `mcode-app/src/pages/connections/index.vue`
- Modify: `mcode-app/src/pages.json`

- [ ] Add `智能体管理` and `模型供应商` action-sheet entries.
- [ ] Route selected connection to the new pages with `encodeConnectionContext()`.
- [ ] Register `pages/connection-agents/index` and `pages/model-providers/index`.

### Task 3: Agent Management Page

**Files:**
- Create: `mcode-app/src/pages/connection-agents/index.vue`
- Test: `mcode-app/tests/pages/remoteSettingsPresentation.spec.ts`

- [ ] Resolve the connection, load agents/providers, and show list/detail states.
- [ ] Implement enabled, env, provider binding, raw config save, reorder, install/download/prepare/uninstall, and live log display.
- [ ] Subscribe to install and agent update events through `gateway.connectEvents()`.

### Task 4: Model Provider Page

**Files:**
- Create: `mcode-app/src/pages/model-providers/index.vue`

- [ ] Resolve the connection and load providers.
- [ ] Implement filter, create, edit, delete, validation, and refresh behavior.

### Task 5: mcode Architecture Note

**Files:**
- Create: `docs/mcode-architecture-notes/2026-06-17-connection-agent-provider-management.md`

- [ ] Document architecture, protocol/data flow, UI behavior, compatibility, and native iOS/Android replication guidance.

### Task 6: Verification

**Files:**
- No source edits expected.

- [ ] Run targeted Jest tests for the new service and presentation helpers.
- [ ] Run existing related tests if practical.
- [ ] Run `pnpm exec vue-tsc --noEmit` and report any pre-existing unrelated failures.
