import { createPinia, setActivePinia } from 'pinia'
import { useConversationRuntimeStore } from '@/stores/conversationRuntime'

jest.mock('@/stores/auth', () => ({
  useAuthStore: () => ({
    currentRemoteInstance: () => ({
      instanceKey: 'test-instance',
    }),
  }),
}))

jest.mock('@/api/acp', () => ({
  acpApi: {
    acpFindConnectionForConversation: jest.fn(),
    acpGetSessionSnapshotByConversation: jest.fn(),
  },
}))

jest.mock('@/services/conversation/connectionSessionManager', () => ({
  connectionSessionManager: {
    touchConnection: jest.fn(),
    touchConversation: jest.fn(),
    getByConversationId: jest.fn(() => null),
    getByConnectionId: jest.fn(() => null),
    setConversationSendAllowed: jest.fn(),
    clearConversation: jest.fn(),
    disconnectConversation: jest.fn(),
    adoptConversation: jest.fn(),
    connectConversation: jest.fn(),
  },
}))

jest.mock('@/services/conversation/conversationSyncService', () => ({
  attachConversationRealtime: jest.fn(),
  bindConversationEventHandler: jest.fn(),
  calibrateAfterTurnComplete: jest.fn(),
  calibrateAfterReplayGap: jest.fn(),
  detachConversationRealtime: jest.fn(),
  unbindConversationEventHandler: jest.fn(),
}))

jest.mock('@/services/conversation/hotConversationCoordinator', () => ({
  touchHotConversation: jest.fn(),
  releaseHotConversation: jest.fn(),
  isHotConversation: jest.fn(() => false),
}))

jest.mock('@/services/gateway/relayClientIdentity', () => ({
  getRelayClientId: jest.fn(() => 'client-phone'),
}))

jest.mock('@/services/db/migrations', () => ({
  ensureConversationSchema: jest.fn(),
}))

jest.mock('@/services/db/repositories/conversationRepository', () => ({
  getNewestTurns: jest.fn(() => []),
  insertCompletedTurn: jest.fn(),
}))

jest.mock('@/services/conversation/conversationDetailPersistence', () => ({
  buildPersistedTurnRecord: jest.fn(),
}))

describe('conversationRuntime ACP error handling', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    jest.clearAllMocks()
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
  })

  function prepareSession(status: 'idle' | 'connected' | 'error' = 'connected', error: string | null = null) {
    const store = useConversationRuntimeStore()
    const session = store.getOrCreateSession(1)
    session.connectionId = 'conn-1'
    session.status = status
    session.inputErrorMessage = error
    return { store, session }
  }

  function buildPersistedUserTurn(id: string, text: string, conversationId = 1) {
    return {
      id,
      conversationId,
      instanceKey: 'test-instance',
      dedupeKey: `remote:${id}`,
      role: 'user',
      createdAt: 100,
      seq: 100,
      sortKey: 100,
      status: 'completed',
      version: 1,
      parts: [
        {
          id: `${id}:0`,
          turnId: id,
          conversationId,
          partIndex: 0,
          type: 'text',
          payloadJson: JSON.stringify({ text }),
          updatedAt: 100,
        },
      ],
    }
  }

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

  it('invalidates a matching stale connection before reconnecting', () => {
    const manager = require('@/services/conversation/connectionSessionManager')
    const sync = require('@/services/conversation/conversationSyncService')
    const store = useConversationRuntimeStore()
    const session = store.getOrCreateSession(1)
    session.connectionId = 'conn-stale'
    session.status = 'connected'
    store.connections.set('conn-stale', {
      id: 'conn-stale',
      agentType: 'claude_code',
      sessionId: 'sess-1',
      status: 'connected',
      capabilities: [],
    })

    expect(store.invalidateConnection(1, 'conn-stale')).toBe(true)

    expect(sync.detachConversationRealtime).toHaveBeenCalledWith(1)
    expect(sync.unbindConversationEventHandler).toHaveBeenCalledWith(1)
    expect(manager.connectionSessionManager.clearConversation).toHaveBeenCalledWith(1)
    expect(store.connections.has('conn-stale')).toBe(false)
    expect(session.connectionId).toBeNull()
    expect(session.status).toBe('idle')
  })

  it('does not invalidate a connection replaced by another connection', () => {
    const manager = require('@/services/conversation/connectionSessionManager')
    const store = useConversationRuntimeStore()
    const session = store.getOrCreateSession(1)
    session.connectionId = 'conn-current'

    expect(store.invalidateConnection(1, 'conn-stale')).toBe(false)

    expect(manager.connectionSessionManager.clearConversation).not.toHaveBeenCalled()
    expect(session.connectionId).toBe('conn-current')
  })

  it('routes fresh connect discovery through the provided instance key', async () => {
    const acp = require('@/api/acp')
    const manager = require('@/services/conversation/connectionSessionManager')
    const store = useConversationRuntimeStore()

    await store.connect(1, 'claude_code', undefined, 'sess-1', 88, 'instance-b')

    expect(acp.acpApi.acpFindConnectionForConversation).toHaveBeenCalledWith(
      1,
      'claude_code',
      'sess-1',
      { instanceKey: 'instance-b' }
    )
    expect(acp.acpApi.acpGetSessionSnapshotByConversation).toHaveBeenCalledWith(
      1,
      { instanceKey: 'instance-b' }
    )
    expect(manager.connectionSessionManager.connectConversation).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: 1,
        agentType: 'claude_code',
        sessionId: 'sess-1',
        instanceKey: 'instance-b',
      })
    )
  })

  it('preserves terminal ACP errors across the follow-up idle status change', () => {
    const { store, session } = prepareSession()

    store.handleEvent({
      type: 'error',
      connectionId: 'conn-1',
      data: {
        message: 'ACP protocol error: Internal error',
      },
    } as any)

    expect(session.status).toBe('error')
    expect(session.inputErrorMessage).toBe('ACP protocol error: Internal error')

    store.handleEvent({
      type: 'status_changed',
      connectionId: 'conn-1',
      data: {
        status: 'idle',
        scope: 'connection',
      },
    } as any)

    expect(session.status).toBe('idle')
    expect(session.inputErrorMessage).toBe('ACP protocol error: Internal error')
  })

  it('routes realtime events by bound conversation id when connection ids overlap', () => {
    const store = useConversationRuntimeStore()
    const firstSession = store.getOrCreateSession(1)
    firstSession.connectionId = 'shared-conn'
    firstSession.status = 'connected'
    const secondSession = store.getOrCreateSession(2)
    secondSession.connectionId = 'shared-conn'
    secondSession.status = 'connected'

    store.handleEventForConversation(2, {
      type: 'stream_batch',
      connectionId: 'shared-conn',
      data: {
        delta: 'second tab only',
        contentType: 'text',
      },
    } as any)

    expect(store.getMessages(1)).toEqual([])
    expect(store.getMessages(2)[0]?.content).toEqual([
      { type: 'text', text: 'second tab only' },
    ])
  })

  it("releases preview-owned sessions without requiring backend disconnect", () => {
    const sync = require("@/services/conversation/conversationSyncService")
    const manager = require("@/services/conversation/connectionSessionManager")
    const hot = require("@/services/conversation/hotConversationCoordinator")
    const store = useConversationRuntimeStore()
    const session = store.getOrCreateSession(77)
    session.connectionId = "conn-preview"
    session.instanceKey = "test-instance"
    session.status = "thinking"

    expect(store.releasePreviewSession(77)).toBe(true)

    expect(sync.detachConversationRealtime).toHaveBeenCalledWith(77)
    expect(sync.unbindConversationEventHandler).toHaveBeenCalledWith(77)
    expect(manager.connectionSessionManager.clearConversation).toHaveBeenCalledWith(77)
    expect(hot.releaseHotConversation).toHaveBeenCalledWith(77)
    expect(store.sessions.has(77)).toBe(false)
  })

  it('still clears stale errors on ordinary idle transitions', () => {
    const { store, session } = prepareSession('connected', 'stale error')

    store.handleEvent({
      type: 'status_changed',
      connectionId: 'conn-1',
      data: {
        status: 'idle',
        scope: 'connection',
      },
    } as any)

    expect(session.status).toBe('idle')
    expect(session.inputErrorMessage).toBeNull()
  })

  it('preserves completed goal tool calls from the initial realtime event', () => {
    const { store, session } = prepareSession()
    const output = JSON.stringify({
      goal: {
        objective: 'Ship mobile goal card',
        status: 'complete',
        tokensUsed: 1200,
      },
    })

    store.handleEvent({
      type: 'tool_call',
      connectionId: 'conn-1',
      data: {
        id: 'codex-goal-1',
        name: 'Goal updated (complete): Ship mobile goal card',
        input: {
          status: 'complete',
          objective: 'Ship mobile goal card',
        },
        status: 'completed',
        rawOutput: output,
      },
    } as any)

    expect(session.liveMessage?.content).toEqual([
      {
        type: 'tool_call',
        tool_call: {
          id: 'codex-goal-1',
          name: 'Goal updated (complete): Ship mobile goal card',
          input: {
            status: 'complete',
            objective: 'Ship mobile goal card',
          },
          status: 'completed',
          output,
          rawOutput: output,
          error: undefined,
        },
      },
    ])
  })

  it('clears pending permission when another device resolves it', () => {
    const { store, session } = prepareSession()

    store.handleEvent({
      type: 'permission_request',
      connectionId: 'conn-1',
      data: {
        id: 'perm-1',
        description: 'Run command?',
        options: [],
      },
    } as any)

    expect(session.status).toBe('waiting_permission')
    expect(session.pendingPermission?.id).toBe('perm-1')

    store.handleEvent({
      type: 'permission_resolved',
      connectionId: 'conn-1',
      data: {
        requestId: 'perm-1',
        responderClientId: 'other-device',
      },
    } as any)

    expect(session.pendingPermission).toBeNull()
    expect(session.status).toBe('connected')
  })

  it('shows local cancel-request copy for active turn cancellation', () => {
    const { store, session } = prepareSession()
    session.status = 'thinking'

    store.handleEvent({
      type: 'turn_cancel_requested',
      connectionId: 'conn-1',
      data: {
        activeTurnId: 'turn-live',
        cancelRequestedByClientId: 'client-phone',
      },
    } as any)

    expect(session.status).toBe('thinking')
    expect(session.inputErrorMessage).toBe('正在取消当前任务...')
  })

  it('shows other-device cancel-request copy for active turn cancellation', () => {
    const { store, session } = prepareSession()
    session.status = 'thinking'

    store.handleEvent({
      type: 'turn_cancel_requested',
      connectionId: 'conn-1',
      data: {
        activeTurnId: 'turn-live',
        cancelRequestedByClientId: 'client-watch',
      },
    } as any)

    expect(session.status).toBe('thinking')
    expect(session.inputErrorMessage).toBe('其他设备正在取消当前任务。')
  })

  it('clears generating state after turn_cancelled', () => {
    const { store, session } = prepareSession()
    session.status = 'thinking'
    session.inputErrorMessage = '正在取消当前任务...'
    session.liveMessage = {
      role: 'assistant',
      content: [{ type: 'text', text: 'partial' }],
      isStreaming: true,
      timestamp: Date.now(),
    }

    store.handleEvent({
      type: 'turn_cancelled',
      connectionId: 'conn-1',
      data: { activeTurnId: 'turn-live', status: 'canceled' },
    } as any)

    expect(session.status).toBe('connected')
    expect(session.inputErrorMessage).toBeNull()
    expect(session.liveMessage).toBeNull()
  })

  it('surfaces recoverable copy after turn_cancel_failed', () => {
    const { store, session } = prepareSession()
    session.status = 'thinking'

    store.handleEvent({
      type: 'turn_cancel_failed',
      connectionId: 'conn-1',
      data: { message: 'provider refused interrupt' },
    } as any)

    expect(session.status).toBe('error')
    expect(session.inputErrorMessage).toBe('取消当前任务失败，请刷新后重试。')
  })

  it('tracks shared prompt queue lifecycle events', () => {
    const { store, session } = prepareSession()

    store.handleEvent({
      type: 'turn_queued',
      connectionId: 'conn-1',
      data: {
        sessionId: 'session-1',
        queueItemId: 'queue-1',
        queuePosition: 1,
        queueLength: 1,
        sourceClientId: 'client-phone',
        sourceDeviceName: 'Phone',
        promptPreview: 'run tests',
        createdAtMs: 1782630000000,
        runtime: 'claude',
        agentType: 'claude_code',
      },
    } as any)

    expect(session.sharedPromptQueue).toMatchObject({
      count: 1,
      lastMessage: '任务已加入队列。',
      items: [
        {
          queueItemId: 'queue-1',
          queuePosition: 1,
          promptPreview: 'run tests',
        },
      ],
    })
    expect(session.inputErrorMessage).toBe('任务已加入队列。')

    store.handleEvent({
      type: 'turn_started',
      connectionId: 'conn-1',
      data: {
        sessionId: 'session-1',
        queueItemId: 'queue-1',
        queueLength: 0,
        activeTurnId: 'turn-queued',
      },
    } as any)

    expect(session.sharedPromptQueue.count).toBe(0)
    expect(session.sharedPromptQueue.items).toHaveLength(0)
    expect(session.status).toBe('thinking')
    expect(session.inputErrorMessage).toBeNull()
  })

  it('rebuilds the shared queue from reorder and priority snapshots', () => {
    const { store, session } = prepareSession()

    store.handleEvent({
      type: 'turn_queued',
      connectionId: 'conn-1',
      data: {
        sessionId: 'session-1',
        queueItemId: 'queue-1',
        queuePosition: 1,
        queueLength: 3,
        priorityTier: 'normal',
        promptPreview: 'first',
      },
    } as any)
    store.handleEvent({
      type: 'turn_queued',
      connectionId: 'conn-1',
      data: {
        sessionId: 'session-1',
        queueItemId: 'queue-2',
        queuePosition: 2,
        queueLength: 3,
        priorityTier: 'normal',
        promptPreview: 'second',
      },
    } as any)
    store.handleEvent({
      type: 'turn_queued',
      connectionId: 'conn-1',
      data: {
        sessionId: 'session-1',
        queueItemId: 'queue-3',
        queuePosition: 3,
        queueLength: 3,
        priorityTier: 'normal',
        promptPreview: 'third',
      },
    } as any)

    store.handleEvent({
      type: 'turn_queue_reordered',
      connectionId: 'conn-1',
      data: {
        sessionId: 'session-1',
        queueItemId: 'queue-3',
        queuePosition: 1,
        queueLength: 3,
        priorityTier: 'normal',
        queueSnapshot: [
          {
            sessionId: 'session-1',
            queueItemId: 'queue-3',
            queuePosition: 1,
            queueLength: 3,
            priorityTier: 'normal',
            promptPreview: 'third',
            createdAtMs: 3,
          },
          {
            sessionId: 'session-1',
            queueItemId: 'queue-1',
            queuePosition: 2,
            queueLength: 3,
            priorityTier: 'normal',
            promptPreview: 'first',
            createdAtMs: 1,
          },
          {
            sessionId: 'session-1',
            queueItemId: 'queue-2',
            queuePosition: 3,
            queueLength: 3,
            priorityTier: 'normal',
            promptPreview: 'second',
            createdAtMs: 2,
          },
        ],
      },
    } as any)

    expect(session.sharedPromptQueue.items.map((item) => item.queueItemId)).toEqual([
      'queue-3',
      'queue-1',
      'queue-2',
    ])

    store.handleEvent({
      type: 'turn_queue_priority_changed',
      connectionId: 'conn-1',
      data: {
        sessionId: 'session-1',
        queueItemId: 'queue-2',
        queuePosition: 1,
        queueLength: 3,
        priorityTier: 'high',
        queueSnapshot: [
          {
            sessionId: 'session-1',
            queueItemId: 'queue-2',
            queuePosition: 1,
            queueLength: 3,
            priorityTier: 'high',
            promptPreview: 'second',
            createdAtMs: 2,
          },
          {
            sessionId: 'session-1',
            queueItemId: 'queue-3',
            queuePosition: 2,
            queueLength: 3,
            priorityTier: 'normal',
            promptPreview: 'third',
            createdAtMs: 3,
          },
          {
            sessionId: 'session-1',
            queueItemId: 'queue-1',
            queuePosition: 3,
            queueLength: 3,
            priorityTier: 'normal',
            promptPreview: 'first',
            createdAtMs: 1,
          },
        ],
      },
    } as any)

    expect(session.sharedPromptQueue.items.map((item) => item.queueItemId)).toEqual([
      'queue-2',
      'queue-3',
      'queue-1',
    ])
    expect(session.sharedPromptQueue.items[0].priorityTier).toBe('high')
    expect(session.sharedPromptQueue.count).toBe(3)
  })

  it('does not reinsert cancelled queue items from queue update events', () => {
    const { store, session } = prepareSession()

    store.handleEvent({
      type: 'turn_queued',
      connectionId: 'conn-1',
      data: {
        queueItemId: 'queue-1',
        queuePosition: 1,
        queueLength: 1,
      },
    } as any)
    store.handleEvent({
      type: 'turn_queue_cancelled',
      connectionId: 'conn-1',
      data: {
        queueItemId: 'queue-1',
        queueLength: 0,
      },
    } as any)
    store.handleEvent({
      type: 'turn_queue_updated',
      connectionId: 'conn-1',
      data: {
        queueItemId: 'queue-1',
        queuePosition: 1,
        queueLength: 0,
      },
    } as any)

    expect(session.sharedPromptQueue.count).toBe(0)
    expect(session.sharedPromptQueue.items).toEqual([])
  })

  it('surfaces queue start failures as recoverable runtime errors', () => {
    const { store, session } = prepareSession()

    store.handleEvent({
      type: 'turn_queued',
      connectionId: 'conn-1',
      data: {
        queueItemId: 'queue-1',
        queueLength: 1,
      },
    } as any)
    store.handleEvent({
      type: 'turn_queue_failed',
      connectionId: 'conn-1',
      data: {
        queueItemId: 'queue-1',
        queueLength: 0,
        message: 'provider failed',
      },
    } as any)

    expect(session.sharedPromptQueue.count).toBe(0)
    expect(session.sharedPromptQueue.items).toEqual([])
    expect(session.status).toBe('error')
    expect(session.inputErrorMessage).toBe('provider failed')
  })

  it('does not let an older snapshot overwrite newer streamed tail content', () => {
    const { store, session } = prepareSession()
    session.lastAppliedSeq = 12

    store.handleEvent({
      type: 'stream_batch',
      connectionId: 'conn-1',
      seq: 13,
      data: {
        delta: ' newer tail',
        contentType: 'text',
      },
    } as any)

    expect(store.getMessages(1)[0]?.content?.[0]).toEqual({
      type: 'text',
      text: ' newer tail',
    })

    store.hydrateLiveSnapshot(1, {
      event_seq: 10,
      live_message: {
        started_at: Date.now(),
        content: [
          { kind: 'text', text: 'older snapshot' },
        ],
      },
    })

    expect(store.getMessages(1)[0]?.content?.[0]).toEqual({
      type: 'text',
      text: ' newer tail',
    })
    expect(session.lastAppliedSeq).toBe(13)
  })

  it('does not let an older snapshot clear a newer pending permission', () => {
    const { store, session } = prepareSession()

    store.handleEvent({
      type: 'permission_request',
      connectionId: 'conn-1',
      seq: 22,
      data: {
        id: 'perm-latest',
        description: 'Run command?',
        options: [{ id: 'approve', label: 'Approve' }],
      },
    } as any)

    expect(session.status).toBe('waiting_permission')
    expect(session.pendingPermission?.id).toBe('perm-latest')

    store.hydrateLiveSnapshot(1, {
      event_seq: 21,
      status: 'connected',
      pending_permission: null,
    })

    expect(session.status).toBe('waiting_permission')
    expect(session.pendingPermission?.id).toBe('perm-latest')
    expect(session.lastAppliedSeq).toBe(22)
  })

  it('ignores stale snapshot live replay when completed assistant history is newer', () => {
    const { store, session } = prepareSession()
    session.localTurns = [
      {
        id: 'completed-a1',
        role: 'assistant',
        content: [{ type: 'text', text: 'completed reply' }],
        timestamp: 200,
        status: 'completed',
      },
    ] as any

    store.hydrateLiveSnapshot(1, {
      event_seq: 20,
      status: 'connected',
      live_message: {
        id: 'old-live',
        started_at: 100,
        content: [
          { kind: 'text', text: 'completed reply' },
        ],
      },
    })

    expect(session.liveMessage).toBeNull()
    expect(store.getMessages(1).map((turn) => turn.id)).toEqual(['completed-a1'])
  })

  it('accepts snapshot live content when it starts after existing assistant history', () => {
    const { store, session } = prepareSession()
    session.localTurns = [
      {
        id: 'completed-a1',
        role: 'assistant',
        content: [{ type: 'text', text: 'completed reply' }],
        timestamp: 100,
        status: 'completed',
      },
    ] as any

    store.hydrateLiveSnapshot(1, {
      event_seq: 20,
      status: 'prompting',
      live_message: {
        id: 'new-live',
        started_at: 300,
        content: [
          { kind: 'text', text: 'new streaming reply' },
        ],
      },
    })

    expect(session.liveMessage?.id).toBe('new-live')
    expect(store.getMessages(1).map((turn) => turn.id)).toEqual([
      'completed-a1',
      'live-1-new-live',
    ])
  })

  it('hydrates the in-flight user turn id from live snapshots', () => {
    const { store, session } = prepareSession()

    store.hydrateLiveSnapshot(1, {
      event_seq: 20,
      pending_user_message: {
        message_id: 'u-current',
      },
      live_message: {
        id: 'live-current',
        started_at: 300,
        content: [
          { kind: 'text', text: 'streaming reply' },
        ],
      },
    })

    expect(session.inFlightUserTurnId).toBe('u-current')

    store.hydrateLiveSnapshot(1, {
      event_seq: 21,
      pending_user_message: null,
    })

    expect(session.inFlightUserTurnId).toBeNull()
  })

  it('ignores realtime stream events already covered by the hydrated snapshot seq', () => {
    const { store } = prepareSession()

    store.hydrateLiveSnapshot(1, {
      event_seq: 10,
      live_message: {
        id: 'live-current',
        started_at: 300,
        content: [
          { kind: 'text', text: 'paragraph one\n\nparagraph two' },
        ],
      },
    })

    store.handleEvent({
      connectionId: 'conn-1',
      seq: 10,
      type: 'stream_batch',
      data: {
        delta: '\n\nparagraph two',
        contentType: 'text',
      },
    } as any)

    expect(store.getMessages(1)[0]?.content).toEqual([
      { type: 'text', text: 'paragraph one\n\nparagraph two' },
    ])

    store.handleEvent({
      connectionId: 'conn-1',
      seq: 11,
      type: 'stream_batch',
      data: {
        delta: '\n\nparagraph three',
        contentType: 'text',
      },
    } as any)

    expect(store.getMessages(1)[0]?.content).toEqual([
      { type: 'text', text: 'paragraph one\n\nparagraph two\n\nparagraph three' },
    ])
  })

  it('tracks a server history window per session and clears it with non-live cached state', () => {
    const store = useConversationRuntimeStore()
    const first = store.getOrCreateSession(1)
    const second = store.getOrCreateSession(2)
    const historyWindow = {
      turns_offset: 30,
      turns_total: 60,
      assistant_turns_before_offset: 15,
      prefix_hash: 'tail-prefix',
      uncovered_prefix_max_ts: 123,
    }

    expect(first.historyWindow).toBeNull()
    expect(second.historyWindow).toBeNull()

    store.setConversationHistoryWindow(1, historyWindow)

    expect(first.historyWindow).toEqual(historyWindow)
    expect(second.historyWindow).toBeNull()

    store.clearConversationHistoryWindow(1)
    expect(first.historyWindow).toBeNull()

    store.setConversationHistoryWindow(1, historyWindow)
    store.clearCachedSessionState()

    expect(first.historyWindow).toBeNull()
  })

  it('keeps cached session state for hot conversations', () => {
    const hot = require('@/services/conversation/hotConversationCoordinator')
    hot.isHotConversation.mockReturnValue(true)
    const store = useConversationRuntimeStore()
    const session = store.getOrCreateSession(1)
    session.localTurns = [{ id: 't1', role: 'assistant', content: [], timestamp: 1 }] as any
    session.status = 'connected'

    store.clearCachedSessionState()

    expect(session.localTurns).toHaveLength(1)
  })

  it('applies parsed conversation token usage to runtime stats', () => {
    const store = useConversationRuntimeStore()
    const session = store.getOrCreateSession(1)

    const applied = store.applyConversationDetailStats(1, {
      turns: [
        {
          id: 'assistant-1',
          role: 'assistant',
          content: [],
          timestamp: 1,
          usage: {
            input_tokens: 100,
            output_tokens: 35,
            cache_creation_input_tokens: 7,
            cache_read_input_tokens: 11,
          },
        },
      ],
    } as any)

    expect(applied).toBe(true)
    expect(session.stats).toEqual({
      inputTokens: 118,
      outputTokens: 35,
      totalTokens: 153,
      turnCount: 1,
    })
  })

  it('prefers session total usage when available', () => {
    const store = useConversationRuntimeStore()
    const session = store.getOrCreateSession(1)

    store.applyConversationDetailStats(1, {
      turns: [{ id: 'assistant-1', role: 'assistant', content: [], timestamp: 1 }],
      session_stats: {
        total_usage: {
          input_tokens: 200,
          output_tokens: 40,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 60,
        },
        total_tokens: 300,
      },
    } as any)

    expect(session.stats).toEqual({
      inputTokens: 260,
      outputTokens: 40,
      totalTokens: 300,
      turnCount: 1,
    })
  })

  it('applies in-flight user turn metadata from conversation detail', () => {
    const store = useConversationRuntimeStore()
    const session = store.getOrCreateSession(1)

    const applied = store.applyConversationDetailStats(1, {
      turns: [],
      in_flight_user_turn_id: 'u-current',
    } as any)

    expect(applied).toBe(true)
    expect(session.inFlightUserTurnId).toBe('u-current')

    store.applyConversationDetailStats(1, {
      turns: [],
      in_flight_user_turn_id: null,
    } as any)

    expect(session.inFlightUserTurnId).toBeNull()
  })

  it('drops the promoted assistant snapshot when the same live turn is still streaming', async () => {
    const store = useConversationRuntimeStore()

    store.setLiveMessage(
      1,
      [{ type: 'text', text: 'streaming reply' }],
      true,
      { id: 'lm-dup', timestamp: 100 }
    )
    await store.completeTurn(1)
    store.setLiveMessage(
      1,
      [{ type: 'text', text: 'streaming reply' }],
      true,
      { id: 'lm-dup', timestamp: 100 }
    )

    const timeline = store.getTimelineTurns(1)
    const assistantIds = timeline
      .filter((entry) => entry.turn.role === 'assistant')
      .map((entry) => entry.turn.id)

    expect(assistantIds.filter((id) => id === 'live-1-lm-dup')).toHaveLength(1)
    expect(timeline.find((entry) => entry.turn.id === 'live-1-lm-dup')?.phase).toBe('streaming')
    expect(store.getMessages(1).filter((turn) => turn.id === 'live-1-lm-dup')).toHaveLength(1)
  })

  it('keeps a completed assistant turn and a different streaming turn together', async () => {
    const store = useConversationRuntimeStore()

    store.setLiveMessage(
      1,
      [{ type: 'text', text: 'turn A' }],
      true,
      { id: 'lm-a', timestamp: 100 }
    )
    await store.completeTurn(1)
    store.setLiveMessage(
      1,
      [{ type: 'text', text: 'turn B' }],
      true,
      { id: 'lm-b', timestamp: 200 }
    )

    const assistantIds = store
      .getTimelineTurns(1)
      .filter((entry) => entry.turn.role === 'assistant')
      .map((entry) => entry.turn.id)

    expect(assistantIds).toContain('live-1-lm-a')
    expect(assistantIds).toContain('live-1-lm-b')
    expect(new Set(assistantIds).size).toBe(assistantIds.length)
  })

  it('suppresses a trailing persisted assistant partial when live content covers it', () => {
    const store = useConversationRuntimeStore()
    const session = store.getOrCreateSession(1)
    session.localTurns = [
      {
        id: 'u-current',
        role: 'user',
        content: [{ type: 'text', text: 'ask' }],
        timestamp: 100,
        status: 'completed',
      },
      {
        id: 'a-partial',
        role: 'assistant',
        content: [{ type: 'text', text: 'partial reply' }],
        timestamp: 110,
        status: 'completed',
      },
    ] as any

    store.setLiveMessage(
      1,
      [{ type: 'text', text: 'partial reply with more content' }],
      true,
      { id: 'lm-current', timestamp: 105 }
    )

    expect(store.getMessages(1).map((turn) => turn.id)).toEqual([
      'u-current',
      'live-1-lm-current',
    ])
  })

  it('suppresses a persisted text partial when structured live content covers its text', () => {
    const store = useConversationRuntimeStore()
    const session = store.getOrCreateSession(1)
    session.localTurns = [
      {
        id: 'u-current',
        role: 'user',
        content: [{ type: 'text', text: 'ask' }],
        timestamp: 100,
        status: 'completed',
      },
      {
        id: 'a-partial',
        role: 'assistant',
        content: [
          {
            type: 'text',
            text: 'I will create the worktree.\n\nUsing systematic debugging for baseline failure.',
          },
        ],
        timestamp: 110,
        status: 'completed',
      },
    ] as any

    store.setLiveMessage(
      1,
      [
        { type: 'text', text: 'I will create the worktree.\n\n' },
        {
          type: 'tool_call',
          tool_call: {
            id: 'tool-1',
            name: 'shell_command',
            input: {},
            status: 'running',
          },
        },
        { type: 'text', text: 'Using systematic debugging for baseline failure. More text.' },
      ],
      true,
      { id: 'lm-current', timestamp: 105 }
    )

    expect(store.getMessages(1).map((turn) => turn.id)).toEqual([
      'u-current',
      'live-1-lm-current',
    ])
  })

  it('uses the in-flight user turn id to suppress the covered assistant partial after that prompt', () => {
    const store = useConversationRuntimeStore()
    const session = store.getOrCreateSession(1)
    session.localTurns = [
      {
        id: 'u-current',
        role: 'user',
        content: [{ type: 'text', text: 'ask' }],
        timestamp: 100,
        status: 'completed',
      },
      {
        id: 'a-partial',
        role: 'assistant',
        content: [{ type: 'text', text: 'partial reply' }],
        timestamp: 110,
        status: 'completed',
      },
      {
        id: 'u-next',
        role: 'user',
        content: [{ type: 'text', text: 'queued ask' }],
        timestamp: 120,
        status: 'completed',
      },
    ] as any
    session.inFlightUserTurnId = 'u-current'

    store.setLiveMessage(
      1,
      [{ type: 'text', text: 'partial reply with more content' }],
      true,
      { id: 'lm-current', timestamp: 105 }
    )

    expect(store.getMessages(1).map((turn) => turn.id)).toEqual([
      'u-current',
      'u-next',
      'live-1-lm-current',
    ])
  })

  it('keeps a trailing completed assistant when live content does not cover it', () => {
    const store = useConversationRuntimeStore()
    const session = store.getOrCreateSession(1)
    session.localTurns = [
      {
        id: 'u-previous',
        role: 'user',
        content: [{ type: 'text', text: 'previous ask' }],
        timestamp: 100,
        status: 'completed',
      },
      {
        id: 'a-previous',
        role: 'assistant',
        content: [{ type: 'text', text: 'previous answer' }],
        timestamp: 110,
        status: 'completed',
      },
    ] as any

    store.setLiveMessage(
      1,
      [{ type: 'text', text: 'new streaming reply' }],
      true,
      { id: 'lm-next', timestamp: 200 }
    )

    expect(store.getMessages(1).map((turn) => turn.id)).toEqual([
      'u-previous',
      'a-previous',
      'live-1-lm-next',
    ])
  })

  it('does not accumulate duplicate local assistant turns after the same live turn is re-promoted', async () => {
    const store = useConversationRuntimeStore()

    store.setLiveMessage(
      1,
      [{ type: 'text', text: 'streaming reply' }],
      true,
      { id: 'lm-dup2', timestamp: 100 }
    )
    await store.completeTurn(1)
    store.setLiveMessage(
      1,
      [{ type: 'text', text: 'streaming reply' }],
      true,
      { id: 'lm-dup2', timestamp: 100 }
    )
    await store.completeTurn(1)

    const session = store.getOrCreateSession(1)
    expect(session.liveMessage).toBeNull()
    expect(session.localTurns.filter((turn) => turn.id === 'live-1-lm-dup2')).toHaveLength(1)

    const assistantIds = store
      .getTimelineTurns(1)
      .filter((entry) => entry.turn.role === 'assistant')
      .map((entry) => entry.turn.id)

    expect(assistantIds.filter((id) => id === 'live-1-lm-dup2')).toHaveLength(1)
    expect(new Set(assistantIds).size).toBe(assistantIds.length)
  })

  it('uses completion live_message payload as the authoritative completed assistant content', async () => {
    const store = useConversationRuntimeStore()

    store.setLiveMessage(
      1,
      [{ type: 'text', text: 'before final chunk' }],
      true,
      { id: 'lm-final', timestamp: 100 }
    )
    await store.completeTurn(1, {
      live_message: {
        id: 'lm-final',
        started_at: 100,
        content: [
          { kind: 'text', text: 'before final chunk plus final chunk' },
        ],
      },
    })

    expect(store.getMessages(1)).toEqual([
      expect.objectContaining({
        id: 'live-1-lm-final',
        role: 'assistant',
        status: 'completed',
        content: [
          { type: 'text', text: 'before final chunk plus final chunk' },
        ],
      }),
    ])
  })

  it('keeps the completed assistant visible while replay-gap calibration is pending', async () => {
    const sync = require('@/services/conversation/conversationSyncService')
    const repo = require('@/services/db/repositories/conversationRepository')
    const store = useConversationRuntimeStore()
    const session = store.getOrCreateSession(1)
    session.instanceKey = 'test-instance'
    let resolveReplayGap: (value: any) => void = () => {}

    repo.getNewestTurns.mockReturnValue([
      {
        id: 'persisted-assistant',
        conversationId: 1,
        instanceKey: 'test-instance',
        dedupeKey: 'remote:live-1-lm-gap',
        role: 'assistant',
        createdAt: 100,
        seq: 100,
        sortKey: 100,
        status: 'completed',
        version: 1,
        parts: [
          {
            id: 'persisted-assistant:0',
            turnId: 'persisted-assistant',
            conversationId: 1,
            partIndex: 0,
            type: 'text',
            payloadJson: JSON.stringify({ text: 'streaming reply' }),
            updatedAt: 100,
          },
        ],
      },
    ])
    sync.calibrateAfterReplayGap.mockReturnValue(
      new Promise((resolve) => {
        resolveReplayGap = resolve
      })
    )

    store.setLiveMessage(
      1,
      [{ type: 'text', text: 'streaming reply' }],
      true,
      { id: 'lm-gap', timestamp: 100 }
    )
    const completion = store.completeTurn(1)

    try {
      for (let i = 0; i < 10 && sync.calibrateAfterReplayGap.mock.calls.length === 0; i++) {
        await new Promise((resolve) => setTimeout(resolve, 0))
      }

      expect(sync.calibrateAfterReplayGap).toHaveBeenCalled()
      expect(store.getMessages(1)).toEqual([
        expect.objectContaining({
          id: 'persisted-assistant',
          role: 'assistant',
          status: 'completed',
          content: [{ type: 'text', text: 'streaming reply' }],
        }),
      ])
    } finally {
      resolveReplayGap({ turns: [] })
      await completion
      sync.calibrateAfterReplayGap.mockReset()
      repo.getNewestTurns.mockReturnValue([])
    }
  })

  it('treats a second already-drained completeTurn as a no-op', async () => {
    const sync = require('@/services/conversation/conversationSyncService')
    const store = useConversationRuntimeStore()
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})

    try {
      store.setLiveMessage(
        1,
        [{ type: 'text', text: 'done' }],
        true,
        { id: 'lm-drained', timestamp: 100 }
      )
      await store.completeTurn(1)
      jest.clearAllMocks()

      await store.completeTurn(1)

      expect(sync.calibrateAfterReplayGap).not.toHaveBeenCalled()
      expect(sync.calibrateAfterTurnComplete).not.toHaveBeenCalled()
      expect(store.getMessages(1).filter((turn) => turn.id === 'live-1-lm-drained')).toHaveLength(1)
    } finally {
      warnSpy.mockRestore()
    }
  })

  it('dedupes repeated turn_complete events with the same event sequence', async () => {
    const sync = require('@/services/conversation/conversationSyncService')
    const store = useConversationRuntimeStore()
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})

    try {
      await store.completeTurn(1, { __eventSeq: 44 })
      await store.completeTurn(1, { __eventSeq: 44 })

      expect(sync.calibrateAfterReplayGap).toHaveBeenCalledTimes(1)
      expect(sync.calibrateAfterTurnComplete).toHaveBeenCalledTimes(1)
    } finally {
      warnSpy.mockRestore()
    }
  })

  it('stops streaming external-user backfill after the running turn is captured once', async () => {
    const sync = require('@/services/conversation/conversationSyncService')
    const repo = require('@/services/db/repositories/conversationRepository')
    const store = useConversationRuntimeStore()
    const session = store.getOrCreateSession(1)
    session.connectionId = 'conn-1'
    session.instanceKey = 'test-instance'
    session.status = 'connected'

    sync.calibrateAfterReplayGap.mockResolvedValue({
      in_flight_user_turn_id: 'ext-user-1',
    })
    // 补齐一次后本地已有历史消息，守卫方可停止后续的流式全量刷新。
    repo.getNewestTurns.mockReturnValue([
      buildPersistedUserTurn('ext-user-1', 'external question'),
    ])

    try {
      // 观察者视角：其他设备发起的回合，本地没有 optimistic 用户轮次。
      store.handleEvent({
        type: 'stream_batch',
        connectionId: 'conn-1',
        data: { delta: 'external reply', contentType: 'text' },
      } as any)

      for (let i = 0; i < 10 && sync.calibrateAfterReplayGap.mock.calls.length === 0; i++) {
        await new Promise((resolve) => setTimeout(resolve, 0))
      }
      // 让 backfill 的 promise 链完成，捕获外部用户轮次。
      await new Promise((resolve) => setTimeout(resolve, 0))

      expect(sync.calibrateAfterReplayGap).toHaveBeenCalledTimes(1)
      expect(session.externalTurnBackfilled).toBe(true)

      // 绕过 1.5s 节流后，流式仍在进行，但不应再触发全量历史刷新。
      session.externalTurnBackfillLastAttemptAt = 0
      store.handleEvent({
        type: 'stream_batch',
        connectionId: 'conn-1',
        data: { delta: ' more text', contentType: 'text' },
      } as any)
      await new Promise((resolve) => setTimeout(resolve, 0))

      expect(sync.calibrateAfterReplayGap).toHaveBeenCalledTimes(1)
    } finally {
      sync.calibrateAfterReplayGap.mockReset()
      repo.getNewestTurns.mockReturnValue([])
    }
  })

  it('keeps syncing history while streaming when local messages are still empty', async () => {
    const sync = require('@/services/conversation/conversationSyncService')
    const repo = require('@/services/db/repositories/conversationRepository')
    const store = useConversationRuntimeStore()
    const session = store.getOrCreateSession(1)
    session.connectionId = 'conn-1'
    session.instanceKey = 'test-instance'
    session.status = 'connected'

    // 远端详情不回报 in-flight 用户轮次，且本地仍拉不到历史（返回空）。
    sync.calibrateAfterReplayGap.mockResolvedValue({})
    repo.getNewestTurns.mockReturnValue([])

    try {
      store.handleEvent({
        type: 'stream_batch',
        connectionId: 'conn-1',
        data: { delta: 'external reply', contentType: 'text' },
      } as any)
      for (let i = 0; i < 10 && sync.calibrateAfterReplayGap.mock.calls.length === 0; i++) {
        await new Promise((resolve) => setTimeout(resolve, 0))
      }
      await new Promise((resolve) => setTimeout(resolve, 0))

      expect(sync.calibrateAfterReplayGap).toHaveBeenCalledTimes(1)
      // 本地消息为空时，即使已尝试过也不锁死守卫，需要再拉一次历史。
      expect(session.externalTurnBackfilled).toBe(false)
      expect(session.inFlightUserTurnId).toBeNull()

      session.externalTurnBackfillLastAttemptAt = 0
      store.handleEvent({
        type: 'stream_batch',
        connectionId: 'conn-1',
        data: { delta: ' more text', contentType: 'text' },
      } as any)
      for (let i = 0; i < 10 && sync.calibrateAfterReplayGap.mock.calls.length < 2; i++) {
        await new Promise((resolve) => setTimeout(resolve, 0))
      }

      expect(sync.calibrateAfterReplayGap).toHaveBeenCalledTimes(2)
    } finally {
      sync.calibrateAfterReplayGap.mockReset()
      repo.getNewestTurns.mockReturnValue([])
    }
  })

  it('allows one more external-user backfill after a turn boundary resets the guard', async () => {
    const sync = require('@/services/conversation/conversationSyncService')
    const repo = require('@/services/db/repositories/conversationRepository')
    const store = useConversationRuntimeStore()
    const session = store.getOrCreateSession(1)
    session.connectionId = 'conn-1'
    session.instanceKey = 'test-instance'
    session.status = 'connected'

    sync.calibrateAfterReplayGap.mockResolvedValue({
      in_flight_user_turn_id: 'ext-user-1',
    })
    // 每次补齐后本地都有历史消息，避免"本地为空必须继续同步"覆盖回合守卫。
    repo.getNewestTurns.mockReturnValue([
      buildPersistedUserTurn('ext-user-1', 'external question'),
    ])

    try {
      store.handleEvent({
        type: 'stream_batch',
        connectionId: 'conn-1',
        data: { delta: 'external reply', contentType: 'text' },
      } as any)
      for (let i = 0; i < 10 && sync.calibrateAfterReplayGap.mock.calls.length === 0; i++) {
        await new Promise((resolve) => setTimeout(resolve, 0))
      }
      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(sync.calibrateAfterReplayGap).toHaveBeenCalledTimes(1)
      expect(session.externalTurnBackfilled).toBe(true)

      // 回合被取消属于回合边界，应重置守卫，让下一个回合可再补齐一次。
      store.handleEvent({
        type: 'turn_cancelled',
        connectionId: 'conn-1',
        data: {},
      } as any)
      expect(session.externalTurnBackfilled).toBe(false)

      session.externalTurnBackfillLastAttemptAt = 0
      store.handleEvent({
        type: 'stream_batch',
        connectionId: 'conn-1',
        data: { delta: 'next external reply', contentType: 'text' },
      } as any)
      for (let i = 0; i < 10 && sync.calibrateAfterReplayGap.mock.calls.length < 2; i++) {
        await new Promise((resolve) => setTimeout(resolve, 0))
      }

      expect(sync.calibrateAfterReplayGap).toHaveBeenCalledTimes(2)
    } finally {
      sync.calibrateAfterReplayGap.mockReset()
      repo.getNewestTurns.mockReturnValue([])
    }
  })

  it('synthesizes an external user turn from a realtime user_message event', () => {
    const { store, session } = prepareSession()

    store.handleEvent({
      type: 'user_message',
      connectionId: 'conn-1',
      data: {
        messageId: 'ext-msg-1',
        blocks: [{ type: 'text', text: 'external prompt' }],
      },
    } as any)

    const userTurns = session.localTurns.filter((turn) => turn.role === 'user')
    expect(userTurns).toHaveLength(1)
    expect(userTurns[0].id).toBe('ext-msg-1')
    expect(userTurns[0].content).toEqual([{ type: 'text', text: 'external prompt' }])
    expect(session.inFlightUserTurnId).toBe('ext-msg-1')
  })

  it('dedupes a repeated user_message with the same message id', () => {
    const { store, session } = prepareSession()

    const event = {
      type: 'user_message',
      connectionId: 'conn-1',
      data: {
        messageId: 'ext-msg-dup',
        blocks: [{ type: 'text', text: 'external prompt' }],
      },
    } as any
    store.handleEvent(event)
    store.handleEvent(event)

    expect(session.localTurns.filter((turn) => turn.role === 'user')).toHaveLength(1)
  })

  it('keeps a new user_message when it repeats text from a completed earlier turn', () => {
    const { store, session } = prepareSession()
    session.localTurns = [
      {
        id: 'old-user',
        role: 'user',
        content: [{ type: 'text', text: '继续' }],
        timestamp: 100,
        status: 'completed',
      },
      {
        id: 'old-assistant',
        role: 'assistant',
        content: [{ type: 'text', text: '上一轮已完成' }],
        timestamp: 101,
        status: 'completed',
      },
    ] as any

    store.handleEvent({
      type: 'user_message',
      connectionId: 'conn-1',
      data: {
        messageId: 'new-user-same-text',
        blocks: [{ type: 'text', text: '继续' }],
      },
    } as any)

    expect(session.localTurns.filter((turn) => turn.role === 'user').map((turn) => turn.id)).toEqual([
      'old-user',
      'new-user-same-text',
    ])
    expect(session.inFlightUserTurnId).toBe('new-user-same-text')
  })

  it('persists the authoritative realtime user_message turn with the completed assistant', async () => {
    const { store, session } = prepareSession()
    const persistence = require('@/services/conversation/conversationDetailPersistence')
    session.instanceKey = 'test-instance'

    store.handleEvent({
      type: 'user_message',
      connectionId: 'conn-1',
      data: {
        messageId: 'user-event-1',
        blocks: [{ type: 'text', text: 'my prompt' }],
      },
    } as any)
    store.setLiveMessage(
      1,
      [{ type: 'text', text: 'assistant reply' }],
      true,
      { id: 'live-event-1', timestamp: 200 }
    )

    await store.completeTurn(1)

    expect(persistence.buildPersistedTurnRecord).toHaveBeenCalledTimes(2)
    expect(persistence.buildPersistedTurnRecord).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        turn: expect.objectContaining({
          id: 'user-event-1',
          role: 'user',
          content: [{ type: 'text', text: 'my prompt' }],
        }),
      })
    )
    expect(persistence.buildPersistedTurnRecord).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        turn: expect.objectContaining({
          role: 'assistant',
          content: [{ type: 'text', text: 'assistant reply' }],
        }),
      })
    )
  })

  it('does not backfill history after user_message has supplied the current turn', async () => {
    const sync = require('@/services/conversation/conversationSyncService')
    const { store, session } = prepareSession()
    session.instanceKey = 'test-instance'

    store.handleEvent({
      type: 'user_message',
      connectionId: 'conn-1',
      data: {
        messageId: 'user-event-2',
        blocks: [{ type: 'text', text: 'my prompt' }],
      },
    } as any)
    store.handleEvent({
      type: 'stream_batch',
      connectionId: 'conn-1',
      data: { delta: 'assistant reply', contentType: 'text' },
    } as any)
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(sync.calibrateAfterReplayGap).not.toHaveBeenCalled()
    expect(session.externalTurnBackfilled).toBe(true)
  })

  it('keeps a realtime user_message when an earlier replay-gap backfill resolves late', async () => {
    const sync = require('@/services/conversation/conversationSyncService')
    const repo = require('@/services/db/repositories/conversationRepository')
    const { store, session } = prepareSession()
    session.instanceKey = 'test-instance'
    let resolveReplayGap: (value: any) => void = () => {}

    sync.calibrateAfterReplayGap.mockReturnValue(
      new Promise((resolve) => {
        resolveReplayGap = resolve
      })
    )
    repo.getNewestTurns.mockReturnValue([
      buildPersistedUserTurn('stale-user', 'stale prompt'),
    ])

    try {
      store.handleEvent({
        type: 'stream_batch',
        connectionId: 'conn-1',
        data: { delta: 'assistant reply', contentType: 'text' },
      } as any)
      for (let i = 0; i < 10 && sync.calibrateAfterReplayGap.mock.calls.length === 0; i++) {
        await new Promise((resolve) => setTimeout(resolve, 0))
      }
      expect(sync.calibrateAfterReplayGap).toHaveBeenCalledTimes(1)

      store.handleEvent({
        type: 'user_message',
        connectionId: 'conn-1',
        data: {
          messageId: 'user-event-late',
          blocks: [{ type: 'text', text: 'my prompt' }],
        },
      } as any)

      resolveReplayGap({ in_flight_user_turn_id: 'stale-user' })
      await new Promise((resolve) => setTimeout(resolve, 0))
      await new Promise((resolve) => setTimeout(resolve, 0))

      expect(session.localTurns).toEqual([
        expect.objectContaining({
          id: 'user-event-late',
          role: 'user',
          content: [{ type: 'text', text: 'my prompt' }],
        }),
      ])
      expect(session.inFlightUserTurnId).toBe('user-event-late')
      expect(session.externalTurnBackfilled).toBe(true)
    } finally {
      resolveReplayGap({})
      sync.calibrateAfterReplayGap.mockReset()
      repo.getNewestTurns.mockReturnValue([])
    }
  })

  it('does not re-synthesize the same prompt when a backfill re-keyed it with a persisted id', () => {
    const { store, session } = prepareSession()

    // 后端重播的实时事件用 message_id 作 id。
    store.handleEvent({
      type: 'user_message',
      connectionId: 'conn-1',
      data: {
        messageId: 'ext-msg-1',
        blocks: [{ type: 'text', text: 'external prompt' }],
      },
    } as any)
    expect(session.localTurns.filter((turn) => turn.role === 'user')).toHaveLength(1)

    // 模拟 maybeBackfillExternalUserTurn 全量拉取后，用 DB 持久 id 换掉了本地轮次
    // （id 与实时 message_id 不一致，但内容相同）。
    session.localTurns = [
      {
        id: 'db-persisted-42',
        role: 'user',
        content: [{ type: 'text', text: 'external prompt' }],
        timestamp: 100,
        status: 'completed',
      },
    ] as any

    // 后端重播同一条 user_message：仅按 id 判断会漏判，内容签名应命中并跳过，
    // 否则 localTurns 会无限增长、撑爆内存。
    store.handleEvent({
      type: 'user_message',
      connectionId: 'conn-1',
      data: {
        messageId: 'ext-msg-1',
        blocks: [{ type: 'text', text: 'external prompt' }],
      },
    } as any)

    expect(session.localTurns.filter((turn) => turn.role === 'user')).toHaveLength(1)
  })

  it('stops streaming external-user backfill after the attempt cap even when nothing is captured', async () => {
    const sync = require('@/services/conversation/conversationSyncService')
    const repo = require('@/services/db/repositories/conversationRepository')
    const store = useConversationRuntimeStore()
    const session = store.getOrCreateSession(1)
    session.connectionId = 'conn-1'
    session.instanceKey = 'test-instance'
    session.status = 'connected'

    // 旧后端：既不回报 in-flight 用户轮次 id，也拉不到任何历史（始终为空）。
    // captured 永远判不出来，只有硬上限能止住无限全量拉取。
    sync.calibrateAfterReplayGap.mockResolvedValue({})
    repo.getNewestTurns.mockReturnValue([])

    try {
      for (let attempt = 0; attempt < 8; attempt++) {
        session.externalTurnBackfillLastAttemptAt = 0
        store.handleEvent({
          type: 'stream_batch',
          connectionId: 'conn-1',
          data: { delta: `chunk ${attempt}`, contentType: 'text' },
        } as any)
        await new Promise((resolve) => setTimeout(resolve, 0))
        await new Promise((resolve) => setTimeout(resolve, 0))
      }

      // 达到硬上限后，即便绕过 1.5s 节流、流式仍在进行，也不再触发全量拉取。
      const callsAtCap = sync.calibrateAfterReplayGap.mock.calls.length
      expect(callsAtCap).toBeGreaterThan(0)
      expect(callsAtCap).toBeLessThanOrEqual(5)

      session.externalTurnBackfillLastAttemptAt = 0
      store.handleEvent({
        type: 'stream_batch',
        connectionId: 'conn-1',
        data: { delta: 'after cap', contentType: 'text' },
      } as any)
      await new Promise((resolve) => setTimeout(resolve, 0))

      expect(sync.calibrateAfterReplayGap.mock.calls.length).toBe(callsAtCap)
    } finally {
      sync.calibrateAfterReplayGap.mockReset()
      repo.getNewestTurns.mockReturnValue([])
    }
  })

  it('restores the external-user backfill quota after a turn boundary', async () => {
    const sync = require('@/services/conversation/conversationSyncService')
    const repo = require('@/services/db/repositories/conversationRepository')
    const store = useConversationRuntimeStore()
    const session = store.getOrCreateSession(1)
    session.connectionId = 'conn-1'
    session.instanceKey = 'test-instance'
    session.status = 'connected'

    sync.calibrateAfterReplayGap.mockResolvedValue({})
    repo.getNewestTurns.mockReturnValue([])

    try {
      for (let attempt = 0; attempt < 8; attempt++) {
        session.externalTurnBackfillLastAttemptAt = 0
        store.handleEvent({
          type: 'stream_batch',
          connectionId: 'conn-1',
          data: { delta: `chunk ${attempt}`, contentType: 'text' },
        } as any)
        await new Promise((resolve) => setTimeout(resolve, 0))
        await new Promise((resolve) => setTimeout(resolve, 0))
      }
      const callsAtCap = sync.calibrateAfterReplayGap.mock.calls.length

      // 回合边界重置配额，下一个回合可以再补齐。
      store.handleEvent({
        type: 'turn_cancelled',
        connectionId: 'conn-1',
        data: {},
      } as any)
      expect(session.externalTurnBackfillAttempts).toBe(0)

      session.status = 'connected'
      session.externalTurnBackfillLastAttemptAt = 0
      store.handleEvent({
        type: 'stream_batch',
        connectionId: 'conn-1',
        data: { delta: 'next turn', contentType: 'text' },
      } as any)
      await new Promise((resolve) => setTimeout(resolve, 0))
      await new Promise((resolve) => setTimeout(resolve, 0))

      expect(sync.calibrateAfterReplayGap.mock.calls.length).toBe(callsAtCap + 1)
    } finally {
      sync.calibrateAfterReplayGap.mockReset()
      repo.getNewestTurns.mockReturnValue([])
    }
  })
  it('reloads only the cached tail after completing a turn', async () => {
    const { store, session } = prepareSession()
    const repo = require('@/services/db/repositories/conversationRepository')
    session.instanceKey = 'test-instance'
    repo.getNewestTurns.mockReturnValue([
      buildPersistedUserTurn('tail-user', 'cached tail question'),
    ])

    try {
      store.handleEvent({
        type: 'user_message',
        connectionId: 'conn-1',
        data: {
          messageId: 'user-event-tail-only',
          blocks: [{ type: 'text', text: 'current prompt' }],
        },
      } as any)
      store.setLiveMessage(
        1,
        [{ type: 'text', text: 'assistant reply' }],
        true,
        { id: 'live-tail-only', timestamp: 200 },
      )

      await store.completeTurn(1)

      expect(repo.getNewestTurns).toHaveBeenCalledWith(1, 10)
    } finally {
      repo.getNewestTurns.mockReturnValue([])
    }
  })

})
