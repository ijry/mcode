import { hasRenderableRuntimeState } from '@/services/conversation/runtimeViewState'

describe('hasRenderableRuntimeState', () => {
  it('does not treat a bare connection shell as renderable content', () => {
    expect(
      hasRenderableRuntimeState({
        localTurns: [],
        optimisticTurns: [],
        liveMessage: null,
        pendingPermission: null,
      })
    ).toBe(false)
  })

  it('treats persisted local turns as renderable content', () => {
    expect(
      hasRenderableRuntimeState({
        localTurns: [{ id: 'turn-1' }],
        optimisticTurns: [],
        liveMessage: null,
        pendingPermission: null,
      })
    ).toBe(true)
  })

  it('treats live message or pending permission as renderable content', () => {
    expect(
      hasRenderableRuntimeState({
        localTurns: [],
        optimisticTurns: [],
        liveMessage: { content: [] },
        pendingPermission: null,
      })
    ).toBe(true)

    expect(
      hasRenderableRuntimeState({
        localTurns: [],
        optimisticTurns: [],
        liveMessage: null,
        pendingPermission: { id: 'perm-1' },
      })
    ).toBe(true)
  })
})
