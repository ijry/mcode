# P69 Detail Connecting Dedupe Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Execute inline only; do not use subagents or create a worktree unless the user explicitly asks.

**Goal:** Stop repeated `正在连接智能体...` blockers by preventing no-op and duplicate runtime reconnect transitions in MCode App.

**Architecture:** Add connection reuse and in-flight dedupe inside `mcode-app/src/stores/conversationRuntime.ts`, keeping the detail page as a pure consumer of runtime status. Existing managed connections bind without entering `connecting`; new connections still use the existing discovery/adoption/realtime attach flow. Tests exercise the store contract directly.

**Tech Stack:** Vue 3, Pinia, TypeScript, Jest, uni-app, uview-plus runtime theme conventions.

## Global Constraints

- 普通交付说明默认使用中文。
- Do not modify unrelated dirty `P68` files currently present in the worktree.
- Every mcode change must include or update a Markdown note under `docs/mcode-architecture-notes/`.
- Prefer existing `--up-*` uview-plus theme variables; P69 does not change styling.
- No ACP protocol, backend, storage schema, or gateway command changes.
- Implementation plan execution uses Inline Execution only.

---

## File Structure

- Modify `mcode-app/src/stores/conversationRuntime.ts`: own runtime connection reuse, in-flight dedupe, status transitions, and realtime attach binding.
- Modify `mcode-app/tests/stores/conversationRuntime.spec.ts`: add store-level regression tests and complete ACP API mock defaults required by `connect(...)`.
- Create `docs/mcode-architecture-notes/2026-07-13-p69-detail-connecting-dedupe.md`: document architecture/data-flow/UI/native replication guidance.

---

### Task 1: Add Runtime Connect Regression Tests

**Files:**
- Modify: `mcode-app/tests/stores/conversationRuntime.spec.ts`

**Interfaces:**
- Consumes: existing `useConversationRuntimeStore()` public method `connect(conversationId, agentType, workingDir?, sessionId?, sinceSeq?, instanceKey?)`.
- Produces: failing tests that define the P69 contract before implementation.

- [ ] **Step 1: Expand the ACP API mock**

Replace the current ACP API mock:

```ts
jest.mock('@/api/acp', () => ({
  acpApi: {},
}))
```

with:

```ts
jest.mock('@/api/acp', () => ({
  acpApi: {
    acpFindConnectionForConversation: jest.fn(),
    acpGetSessionSnapshotByConversation: jest.fn(),
  },
}))
```

- [ ] **Step 2: Add per-test mock defaults**

Inside the existing `beforeEach`, after `jest.clearAllMocks()`, add:

```ts
    const acp = require('@/api/acp')
    const manager = require('@/services/conversation/connectionSessionManager')
    acp.acpApi.acpFindConnectionForConversation.mockResolvedValue(null)
    acp.acpApi.acpGetSessionSnapshotByConversation.mockResolvedValue(null)
    manager.connectionSessionManager.getByConversationId.mockReturnValue(null)
    manager.connectionSessionManager.connectConversation.mockResolvedValue({
      conversationId: 1,
      instanceKey: 'test-instance',
      connectionId: 'conn-new',
      connection: {
        id: 'conn-new',
        agentType: 'claude_code',
        sessionId: 'sess-new',
        status: 'connected',
        capabilities: [],
      },
      externalId: 'sess-new',
      status: 'connected',
      role: 'owner',
      sharedLive: true,
      detachOnly: true,
      allowSend: true,
      lastTouchedAt: Date.now(),
    })
```

- [ ] **Step 3: Add existing-connection no-flicker test**

Add this test near the existing `conversationRuntime ACP error handling` tests:

```ts
  it('reuses an existing managed connection without entering connecting', async () => {
    const manager = require('@/services/conversation/connectionSessionManager')
    const sync = require('@/services/conversation/conversationSyncService')
    const store = useConversationRuntimeStore()
    const session = store.getOrCreateSession(1)
    session.status = 'connected'
    const managed = {
      conversationId: 1,
      instanceKey: 'test-instance',
      connectionId: 'conn-existing',
      connection: {
        id: 'conn-existing',
        agentType: 'claude_code',
        sessionId: 'sess-existing',
        status: 'connected',
        capabilities: [],
      },
      externalId: 'sess-existing',
      status: 'connected',
      role: 'owner',
      sharedLive: true,
      detachOnly: true,
      allowSend: true,
      lastTouchedAt: Date.now(),
    }
    manager.connectionSessionManager.getByConversationId.mockReturnValue(managed)

    const connectingStatuses: string[] = []
    const connectPromise = store.connect(1, 'claude_code')
    connectingStatuses.push(session.status)
    const result = await connectPromise

    expect(result.id).toBe('conn-existing')
    expect(connectingStatuses).toEqual(['connected'])
    expect(session.connectionId).toBe('conn-existing')
    expect(session.status).toBe('connected')
    expect(manager.connectionSessionManager.connectConversation).not.toHaveBeenCalled()
    expect(sync.attachConversationRealtime).toHaveBeenCalledWith({
      conversationId: 1,
      instanceKey: 'test-instance',
      connectionId: 'conn-existing',
      sinceSeq: undefined,
    })
  })
```

Expected before implementation: fail because `connect(...)` sets `session.status` to `connecting` synchronously.

- [ ] **Step 4: Add concurrent connect dedupe test**

Add this test after the existing-connection test:

```ts
  it('dedupes concurrent connect calls for the same conversation', async () => {
    const manager = require('@/services/conversation/connectionSessionManager')
    const store = useConversationRuntimeStore()
    manager.connectionSessionManager.connectConversation.mockImplementation(() =>
      new Promise((resolve) => {
        setTimeout(() => {
          resolve({
            conversationId: 1,
            instanceKey: 'test-instance',
            connectionId: 'conn-shared',
            connection: {
              id: 'conn-shared',
              agentType: 'claude_code',
              sessionId: 'sess-shared',
              status: 'connected',
              capabilities: [],
            },
            externalId: 'sess-shared',
            status: 'connected',
            role: 'owner',
            sharedLive: true,
            detachOnly: true,
            allowSend: true,
            lastTouchedAt: Date.now(),
          })
        }, 0)
      })
    )

    const first = store.connect(1, 'claude_code')
    const second = store.connect(1, 'claude_code')
    const [firstResult, secondResult] = await Promise.all([first, second])

    expect(manager.connectionSessionManager.connectConversation).toHaveBeenCalledTimes(1)
    expect(firstResult.id).toBe('conn-shared')
    expect(secondResult.id).toBe('conn-shared')
    expect(store.getOrCreateSession(1).connectionId).toBe('conn-shared')
  })
```

Expected before implementation: fail because two concurrent callers can both reach `connectConversation(...)`.

- [ ] **Step 5: Add failed-attempt guard reset test**

Add this test after the concurrent dedupe test:

```ts
  it('clears the in-flight connect guard after a failed attempt', async () => {
    const manager = require('@/services/conversation/connectionSessionManager')
    const store = useConversationRuntimeStore()
    manager.connectionSessionManager.connectConversation
      .mockRejectedValueOnce(new Error('first failed'))
      .mockResolvedValueOnce({
        conversationId: 1,
        instanceKey: 'test-instance',
        connectionId: 'conn-retry',
        connection: {
          id: 'conn-retry',
          agentType: 'claude_code',
          sessionId: 'sess-retry',
          status: 'connected',
          capabilities: [],
        },
        externalId: 'sess-retry',
        status: 'connected',
        role: 'owner',
        sharedLive: true,
        detachOnly: true,
        allowSend: true,
        lastTouchedAt: Date.now(),
      })

    await expect(store.connect(1, 'claude_code')).rejects.toThrow('first failed')
    const result = await store.connect(1, 'claude_code')

    expect(result.id).toBe('conn-retry')
    expect(manager.connectionSessionManager.connectConversation).toHaveBeenCalledTimes(2)
    expect(store.getOrCreateSession(1).status).toBe('connected')
  })
```

Expected before implementation: the retry may pass, but this test protects the new in-flight map cleanup behavior after implementation.

- [ ] **Step 6: Run focused tests and verify failures**

Run:

```bash
pnpm --dir mcode-app exec jest --config jest.config.cjs --runInBand tests/stores/conversationRuntime.spec.ts
```

Expected: at least the existing-connection and concurrent dedupe tests fail before Task 2.

---

### Task 2: Implement Runtime Connection Reuse And Dedupe

**Files:**
- Modify: `mcode-app/src/stores/conversationRuntime.ts`
- Test: `mcode-app/tests/stores/conversationRuntime.spec.ts`

**Interfaces:**
- Consumes: `connectionSessionManager.getByConversationId`, `connectionSessionManager.connectConversation`, `bindConversationEventHandler`, `attachConversationRealtime`.
- Produces: `connect(...)` behavior where existing managed connections do not enter `connecting`, and concurrent calls share one promise.

- [ ] **Step 1: Add in-flight map**

Near the `connections` ref in `conversationRuntime.ts`, add:

```ts
  const inFlightConnects = new Map<number, Promise<ConnectionInfo>>()
```

- [ ] **Step 2: Add a reusable bind helper**

Add this helper above `connect(...)`:

```ts
  async function bindManagedConnection(
    conversationId: number,
    managed: NonNullable<ReturnType<typeof connectionSessionManager.getByConversationId>>,
    sinceSeq?: number
  ) {
    const session = getOrCreateSession(conversationId)
    session.connectionId = managed.connectionId
    session.instanceKey = managed.instanceKey
    connections.value.set(managed.connectionId, managed.connection)
    if (
      session.status === "idle" ||
      session.status === "connecting" ||
      session.status === "error"
    ) {
      session.status = "connected"
    }
    session.inputErrorMessage = null
    session.apiRetry = null
    syncManagedSendPermission(conversationId)

    bindConversationEventHandler(conversationId, (event) => {
      handleEventForConversation(conversationId, event)
    })
    await attachConversationRealtime({
      conversationId,
      instanceKey: managed.instanceKey,
      connectionId: managed.connectionId,
      sinceSeq,
    })

    return managed.connection
  }
```

This helper intentionally preserves active statuses such as `thinking`, `running_tool`, `waiting_permission`, and `waiting_question`.

- [ ] **Step 3: Split the existing connection body into an internal function**

Replace the current top of `connect(...)` with a wrapper that checks existing managed connections and in-flight work before calling an internal function:

```ts
  async function connect(
    conversationId: number,
    agentType: string,
    workingDir?: string,
    sessionId?: string,
    sinceSeq?: number,
    instanceKey?: string
  ) {
    const existingManaged = connectionSessionManager.getByConversationId(conversationId)
    if (existingManaged?.connectionId) {
      return bindManagedConnection(conversationId, existingManaged, sinceSeq)
    }

    const existingInFlight = inFlightConnects.get(conversationId)
    if (existingInFlight) {
      return existingInFlight
    }

    const promise = connectFreshConversation(
      conversationId,
      agentType,
      workingDir,
      sessionId,
      sinceSeq,
      instanceKey
    )
    inFlightConnects.set(conversationId, promise)
    try {
      return await promise
    } finally {
      if (inFlightConnects.get(conversationId) === promise) {
        inFlightConnects.delete(conversationId)
      }
    }
  }
```

Rename the old implementation body to:

```ts
  async function connectFreshConversation(
    conversationId: number,
    agentType: string,
    workingDir?: string,
    sessionId?: string,
    sinceSeq?: number,
    instanceKey?: string
  ) {
```

Keep the old `session.status = "connecting"` line inside `connectFreshConversation(...)`, not in the public wrapper.

- [ ] **Step 4: Use the helper for final managed binding**

Inside `connectFreshConversation(...)`, replace the final duplicated block:

```ts
    session.connectionId = managed.connectionId
    session.instanceKey = managed.instanceKey
      connections.value.set(managed.connectionId, managed.connection)
      session.status = "connected"
      session.inputErrorMessage = null
      session.apiRetry = null
      syncManagedSendPermission(conversationId)

      bindConversationEventHandler(conversationId, (event) => {
        handleEventForConversation(conversationId, event)
      })
      await attachConversationRealtime({
        conversationId,
        instanceKey: managed.instanceKey,
        connectionId: managed.connectionId,
        sinceSeq,
      })

      return managed.connection
```

with:

```ts
      return await bindManagedConnection(conversationId, managed, sinceSeq)
```

If indentation around the old block is off, normalize it while making this replacement.

- [ ] **Step 5: Preserve failure behavior**

Keep the existing `catch` behavior inside `connectFreshConversation(...)`:

```ts
    } catch (error) {
      session.status = "error"
      session.inputErrorMessage = error instanceof Error && error.message.trim()
        ? error.message.trim()
        : "连接失败"
      session.apiRetry = null
      throw error
    }
```

Do not catch in the public `connect(...)` wrapper except for the `finally` cleanup.

- [ ] **Step 6: Run focused tests**

Run:

```bash
pnpm --dir mcode-app exec jest --config jest.config.cjs --runInBand tests/stores/conversationRuntime.spec.ts
```

Expected: all tests in `conversationRuntime.spec.ts` pass.

- [ ] **Step 7: Commit task**

Stage only P69 runtime/test changes:

```bash
git add mcode-app/src/stores/conversationRuntime.ts mcode-app/tests/stores/conversationRuntime.spec.ts
git commit -m "fix: dedupe detail runtime connects"
```

---

### Task 3: Add P69 Architecture Note And Final Verification

**Files:**
- Create: `docs/mcode-architecture-notes/2026-07-13-p69-detail-connecting-dedupe.md`
- Test: `mcode-app/tests/stores/conversationRuntime.spec.ts`

**Interfaces:**
- Consumes: implemented runtime behavior from Task 2.
- Produces: required mcode architecture note for native-client replication.

- [ ] **Step 1: Create the architecture note**

Create `docs/mcode-architecture-notes/2026-07-13-p69-detail-connecting-dedupe.md` with:

```markdown
# P69 Detail Connecting Dedupe

## Architecture

MCode App now dedupes conversation detail runtime connects inside the Pinia
conversation runtime store. The detail page still reads `runtimeStatus` from the
runtime session and shows the existing `正在连接智能体...` blocker only when that
status is `connecting`.

## Protocol And Data Flow

No ACP protocol, gateway command, database schema, or payload changes are
required.

When `runtime.connect(conversationId, ...)` is called, the runtime first checks
for an existing managed conversation connection. If one exists, the runtime binds
`session.connectionId`, `session.instanceKey`, and the connection info map, then
attaches realtime without setting the session to `connecting`.

If no managed connection exists, the runtime reuses any in-flight connect promise
for the same `conversationId`. Only the first caller performs discovery,
snapshot adoption, new connection creation, realtime attach, and the visible
`connecting` transition.

## UI Behavior

The detail blocker remains unchanged for real first-time or recovery
connections. It no longer flashes for ordinary refresh, foreground resume,
mounted-tab hydration, or tab switching when the connection is already known.

Connection failures continue to move the runtime session to `error`, which lets
the existing error feedback replace the connecting blocker.

## Compatibility

The change is app-local and backward compatible with existing desktop hosts and
gateways. Older native clients can keep their current behavior, but may show
more frequent connecting indicators until they adopt the same runtime rule.

## Native iOS/Android Replication Guidance

Native clients should key in-flight connect requests by conversation id. Before
showing a blocking connecting state, check whether a live managed connection is
already bound for that conversation. Rebinding an existing connection should
reattach realtime streams without presenting a connecting blocker. A new or
failed recovery handshake may still surface the blocking connecting affordance.
```

- [ ] **Step 2: Run focused verification**

Run:

```bash
pnpm --dir mcode-app exec jest --config jest.config.cjs --runInBand tests/stores/conversationRuntime.spec.ts
```

Expected: PASS.

- [ ] **Step 3: Inspect P69 diff only**

Run:

```bash
git diff -- mcode-app/src/stores/conversationRuntime.ts mcode-app/tests/stores/conversationRuntime.spec.ts docs/mcode-architecture-notes/2026-07-13-p69-detail-connecting-dedupe.md
```

Expected: diff contains only P69 runtime dedupe, tests, and architecture note.

- [ ] **Step 4: Commit task**

Stage only the P69 note:

```bash
git add docs/mcode-architecture-notes/2026-07-13-p69-detail-connecting-dedupe.md
git commit -m "docs: document P69 connecting dedupe"
```

- [ ] **Step 5: Report final status**

Report:

```text
P69 implemented.
Focused verification: pnpm --dir mcode-app exec jest --config jest.config.cjs --runInBand tests/stores/conversationRuntime.spec.ts
Known unrelated worktree changes: existing P68 files remain untouched.
```

---

## Self-Review

- Spec coverage: existing-connection no-flicker, per-conversation in-flight dedupe, preserved real connecting blocker, tests, architecture note, and native guidance are all covered.
- Placeholder scan: no placeholder markers or unspecified error-handling instructions remain.
- Type consistency: plan uses existing `ConnectionInfo`, `connectionSessionManager.getByConversationId(...)`, `connect(...)`, and `attachConversationRealtime(...)` signatures.
