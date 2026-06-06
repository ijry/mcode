# MCode Create Conversation Agent Cache Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cache create-conversation agent list data, agent option snapshots, and last selected values so the sheet avoids redundant remote loads and restores the user's latest selections.

**Architecture:** Keep all cache behavior inside `mcode-app/src/pages/conversations/index.vue` using `uni.getStorageSync` / `uni.setStorageSync`. Split remote data into 24-hour TTL caches and user choices into persistent selection caches. On sheet open or context change, restore local cache first and only fetch remote state when the TTL cache is absent or stale.

**Tech Stack:** `uni-app`, Vue 3 `<script setup>`, TypeScript, existing ACP gateway calls, `uni` local storage.

---

### Task 1: Add cache models and storage helpers

**Files:**
- Modify: `mcode-app/src/pages/conversations/index.vue`

- [ ] Add constants for the three storage buckets and the 24 hour TTL.
- [ ] Add typed helpers to read/write normalized object records from `uni` storage.
- [ ] Add cache key builders for connection scope and `connection + agentType + projectPath` scope.
- [ ] Add TTL validation helpers and expired-entry pruning helpers.

### Task 2: Restore and persist last selections

**Files:**
- Modify: `mcode-app/src/pages/conversations/index.vue`

- [ ] Add helpers to read/write the last selected `agentType` per connection.
- [ ] Add helpers to read/write `selectedModeId` and `selectedValues` per config context.
- [ ] Persist agent selection immediately when the user switches agent.
- [ ] Persist mode/config selections immediately when the user changes them.
- [ ] Reapply saved selections only when the target mode/value still exists in the current snapshot.

### Task 3: Cache remote agent list and config snapshots

**Files:**
- Modify: `mcode-app/src/pages/conversations/index.vue`

- [ ] Teach `loadCreateAgents()` to use the 24 hour connection-scoped agent list cache before remote loading.
- [ ] Teach `loadCreateAgentConfig()` to use the 24 hour context-scoped snapshot cache before remote loading.
- [ ] On remote success, overwrite the corresponding cache record.
- [ ] Preserve the current failure fallback behavior when remote loading fails.

### Task 4: Rework create-sheet open flow

**Files:**
- Modify: `mcode-app/src/pages/conversations/index.vue`

- [ ] Update `createConversation()` so opening the sheet restores the last selected agent for the chosen connection.
- [ ] Seed the initial agent card list from cached data when available.
- [ ] Replace the broad watch behavior with precise watchers so agent-list loading follows open/connection changes and config loading follows open/connection/agent/project changes.
- [ ] Keep the config dialog reset behavior when the sheet closes.

### Task 5: Verify and stabilize

**Files:**
- Modify: `mcode-app/src/pages/conversations/index.vue`

- [ ] Run a focused type/static check for `mcode-app`.
- [ ] Inspect the final diff for unintended changes.
- [ ] Confirm behavior matches:
  - 24 hour remote-data cache
  - persistent last selected values
  - per-connection isolation for agent selection
  - per-context isolation for config selections
