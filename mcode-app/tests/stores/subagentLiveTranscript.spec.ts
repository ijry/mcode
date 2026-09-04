import { createPinia, setActivePinia } from 'pinia'
import { useConversationRuntimeStore } from '@/stores/conversationRuntime'

jest.mock('@/stores/auth', () => ({
  useAuthStore: () => ({
    currentRemoteInstance: () => ({ instanceKey: 'test-instance' }),
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
  pruneConversationTurnsToNewest: jest.fn(() => 0),
}))

jest.mock('@/services/conversation/conversationDetailPersistence', () => ({
  buildPersistedTurnRecord: jest.fn(),
}))

/**
 * 子智能体的实时正文归属。
 *
 * 这是「mcode 直接展示太长了」的直接成因：服务端把子智能体内部的 text/thinking
 * 也当普通 `stream_batch` 广播出来，只在 `_meta.claudeCode.parentToolUseId` 上标注
 * 归属。不分流的话，一个跑十分钟的子智能体会把它内部所有推理整段追加进父气泡，
 * 用户要滚很久才能看到主线程的下一句话。
 */
describe('subagent live transcript routing', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    jest.clearAllMocks()
  })

  function prepareSession() {
    const store = useConversationRuntimeStore()
    const session = store.getOrCreateSession(1)
    session.connectionId = 'conn-1'
    session.status = 'connected'
    return { store, session }
  }

  function streamBatch(delta: string, parentToolUseId?: string, contentType = 'text') {
    return {
      type: 'stream_batch',
      connectionId: 'conn-1',
      data: { delta, contentType, parentToolUseId },
    } as any
  }

  it('keeps attributed chunks out of the parent bubble', () => {
    const { store, session } = prepareSession()

    store.handleEvent(streamBatch('主线程回复。'))
    store.handleEvent(streamBatch('子智能体在读文件…', 'task-1'))
    store.handleEvent(streamBatch('子智能体读完了。', 'task-1'))

    // 父气泡里只有主线程那一句 —— 这就是「不再太长」的全部含义。
    expect(session.liveMessage?.content).toEqual([{ type: 'text', text: '主线程回复。' }])
    expect(store.getSubagentTranscripts(1)).toEqual({
      'task-1': '子智能体在读文件…子智能体读完了。',
    })
  })

  it('does not flip the session status to thinking', () => {
    const { store, session } = prepareSession()
    // 父 tool_call 已经把状态设成 running_tool（底部显示「正在执行工具」）。
    session.status = 'running_tool'

    store.handleEvent(streamBatch('子智能体内部推理', 'task-1', 'thinking'))

    // 子智能体每来一个 chunk 就翻成「思考中」会让底部状态条在整个子任务期间反复
    // 抖动、且描述的是错的层级。
    expect(session.status).toBe('running_tool')
  })

  it('does not consume the parent placeholder thinking capsule', () => {
    const { store, session } = prepareSession()
    store.beginPlaceholderThinking(1)
    expect(session.liveMessage?.isPlaceholderThinking).toBe(true)

    store.handleEvent(streamBatch('子智能体开始干活', 'task-1'))

    // 占位胶囊代表「主线程正在想」。被子智能体的内容清掉的话，主线程真正开始
    // 输出前这段时间就没有任何进行中提示了。
    expect(session.liveMessage?.isPlaceholderThinking).toBe(true)
    expect(store.getSubagentTranscripts(1)['task-1']).toBe('子智能体开始干活')
  })

  it('retains chunks that arrive before the parent tool_call event', () => {
    const { store } = prepareSession()

    // 事件顺序不保证：内部 chunk 可能先于父 tool_call 到达。按 id 缓冲而不是往
    // 已存在的 tool_call 上挂，正是为了这一帧不丢。
    store.handleEvent(streamBatch('早到的一段', 'task-1'))
    store.handleEvent({
      type: 'tool_call',
      connectionId: 'conn-1',
      data: {
        id: 'task-1',
        name: 'Task',
        input: { subagent_type: 'Explore' },
        status: 'running',
        meta: { claudeCode: { subagent: true } },
      },
    } as any)

    expect(store.getSubagentTranscripts(1)['task-1']).toBe('早到的一段')
  })

  it('buffers each subagent separately', () => {
    const { store } = prepareSession()

    // 并发子智能体是常态（一条消息里 fan-out 好几个）。按 tool_call id 分桶，
    // 混在一起就等于每个胶囊都显示别人的内容。
    store.handleEvent(streamBatch('A 的内容', 'task-a'))
    store.handleEvent(streamBatch('B 的内容', 'task-b'))
    store.handleEvent(streamBatch('A 的第二段', 'task-a'))

    expect(store.getSubagentTranscripts(1)).toEqual({
      'task-a': 'A 的内容A 的第二段',
      'task-b': 'B 的内容',
    })
  })

  it('clears the buffers at the turn boundary', async () => {
    const { store, session } = prepareSession()
    session.instanceKey = 'test-instance'
    store.handleEvent(streamBatch('本回合的子智能体内容', 'task-1'))
    expect(store.getSubagentTranscripts(1)['task-1']).toBeTruthy()

    store.setLiveMessage(1, [{ type: 'text', text: '完成' }], true, {
      id: 'live-1',
      timestamp: 200,
    })
    await store.completeTurn(1)

    // 回合结束后权威内容来自历史回填的 `agent_stats`。不清的话下一回合的胶囊会
    // 顶着上一回合的尾巴，而那段文字与新任务毫无关系。
    expect(store.getSubagentTranscripts(1)).toEqual({})
  })

  it('caps a single subagent buffer and keeps the tail', () => {
    const { store } = prepareSession()

    // 十分钟的子智能体不能让内存无界增长；胶囊展开时只看尾部。
    for (let index = 0; index < 60; index++) {
      store.handleEvent(streamBatch('x'.repeat(100), 'task-1'))
    }
    store.handleEvent(streamBatch('TAIL', 'task-1'))

    const transcript = store.getSubagentTranscripts(1)['task-1']
    expect(transcript.length).toBeLessThanOrEqual(4000)
    // 裁头保尾：最新进展必须还在。
    expect(transcript.endsWith('TAIL')).toBe(true)
  })

  it('ignores empty deltas instead of creating an empty bucket', () => {
    const { store } = prepareSession()
    store.handleEvent(streamBatch('', 'task-1'))
    // 空桶会让胶囊的 `hasBody` 判定误以为有内容可展开，点开却是一片空白。
    expect(store.getSubagentTranscripts(1)).toEqual({})
  })

  it('exposes a plain object snapshot, not the internal Map', () => {
    const { store } = prepareSession()
    store.handleEvent(streamBatch('内容', 'task-1'))

    const snapshot = store.getSubagentTranscripts(1)
    expect(snapshot instanceof Map).toBe(false)
    // 组件侧要能直接 `transcripts[toolCall.id]`；返回 Map 的话模板里取不到值，
    // 而且不会报错 —— 胶囊只是永远空着。
    expect(snapshot['task-1']).toBe('内容')
    // 未知会话返回空对象而不是 undefined，调用点不必判空。
    expect(store.getSubagentTranscripts(999)).toEqual({})
  })

  // 这个容器是 `:subagent-transcripts`，传给 v-for 里**每一个** MessageBubble。
  // 以前每次调用都拷一个新对象：子智能体每来一个 chunk → computed 失效 → 新身份 →
  // 整张列表所有气泡（各含 up-markdown）patch 一遍。身份必须稳定，Vue 才能退化到
  // 「按属性追踪」，让只读了自己那个 key 的气泡不受别人的 chunk 影响。
  it('keeps the container identity stable across chunks and turn boundaries', async () => {
    const { store, session } = prepareSession()
    session.instanceKey = 'test-instance'

    const first = store.getSubagentTranscripts(1)
    store.handleEvent(streamBatch('A1', 'task-a'))
    expect(store.getSubagentTranscripts(1)).toBe(first)

    store.handleEvent(streamBatch('A2', 'task-a'))
    store.handleEvent(streamBatch('B1', 'task-b'))
    expect(store.getSubagentTranscripts(1)).toBe(first)

    store.setLiveMessage(1, [{ type: 'text', text: '完成' }], true, {
      id: 'live-1',
      timestamp: 200,
    })
    await store.completeTurn(1)

    // 回合边界是就地删 key，不是换新对象。
    expect(store.getSubagentTranscripts(1)).toBe(first)
    expect(store.getSubagentTranscripts(1)).toEqual({})
  })

  // 未知会话也要给同一个实例，否则调用点每次拿到的都是新身份。
  it('returns a shared empty view for unknown conversations', () => {
    const { store } = prepareSession()
    expect(store.getSubagentTranscripts(998)).toBe(store.getSubagentTranscripts(999))
  })

  it('keeps the authoritative subagent marker across tool_call_update', () => {
    const { store, session } = prepareSession()
    store.handleEvent({
      type: 'tool_call',
      connectionId: 'conn-1',
      data: {
        id: 'task-1',
        name: 'Task',
        input: { subagent_type: 'Explore' },
        status: 'running',
        meta: { claudeCode: { subagent: true } },
      },
    } as any)
    // update 常常不带 meta。直接赋值会擦掉首帧的权威标记 —— 胶囊在流式中途
    // 退化成普通工具组，用户看到它「变形」。
    store.handleEvent({
      type: 'tool_call_update',
      connectionId: 'conn-1',
      data: { id: 'task-1', status: 'completed', output: 'done' },
    } as any)

    const part = session.liveMessage?.content.find(
      (item: any) => item.type === 'tool_call' && item.tool_call?.id === 'task-1',
    ) as any
    expect(part.tool_call.meta).toEqual({ claudeCode: { subagent: true } })
    expect(part.tool_call.status).toBe('completed')
  })
})
