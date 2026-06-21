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
  acpApi: {},
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

jest.mock('@/services/db/migrations', () => ({
  ensureConversationSchema: jest.fn(),
}))

jest.mock('@/services/db/repositories/conversationRepository', () => ({
  getNewestTurns: jest.fn(() => []),
  getOlderTurns: jest.fn(() => []),
  insertCompletedTurn: jest.fn(),
}))

jest.mock('@/services/conversation/conversationDetailPersistence', () => ({
  buildPersistedTurnRecord: jest.fn(),
}))

describe('conversationRuntime ACP error handling', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    jest.clearAllMocks()
  })

  function prepareSession(status: 'idle' | 'connected' | 'error' = 'connected', error: string | null = null) {
    const store = useConversationRuntimeStore()
    const session = store.getOrCreateSession(1)
    session.connectionId = 'conn-1'
    session.status = status
    session.inputErrorMessage = error
    return { store, session }
  }

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

  it('does not let an older snapshot overwrite newer streamed tail content', () => {
    const { store, session } = prepareSession()
    session.lastAppliedSeq = 12

    store.handleEvent({
      type: 'stream_batch',
      connectionId: 'conn-1',
      seq: 12,
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
    expect(session.lastAppliedSeq).toBe(12)
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
})
