import { playPetTapSound, resetPetAudioForTests } from '@/services/petAudio'

describe('pet tap audio', () => {
  afterEach(() => {
    resetPetAudioForTests()
  })

  it('creates one audio context and plays the packaged tap sound', () => {
    expect(playPetTapSound()).toBe(true)

    const createInnerAudioContext = (global as any).uni.createInnerAudioContext as jest.Mock
    expect(createInnerAudioContext).toHaveBeenCalledTimes(1)

    const ctx = createInnerAudioContext.mock.results[0].value
    expect(ctx.src).toBe('/static/pets/pet-tap.wav')
    expect(ctx.play).toHaveBeenCalledTimes(1)
  })
})
