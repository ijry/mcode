import { createPinia, setActivePinia } from 'pinia'
import { usePetStore } from '@/stores/pet'
import * as ttsModule from '@/uni_modules/up-tts'
import { isPetSpeechAvailable, speakPetText, stopPetSpeech } from '@/services/petVoice'

type TtsMock = typeof ttsModule & {
  __reset: () => void
  __setAvailable: (value: boolean) => void
  __setSpeaking: (value: boolean) => void
}

const tts = ttsModule as TtsMock

describe('pet voice service', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    tts.__reset()
  })

  it('skips speech when voice is disabled', () => {
    const store = usePetStore()
    store.setVoiceEnabled(false)

    expect(speakPetText('别调皮啦，快工作吧。')).toBe(false)
    expect(tts.speak).not.toHaveBeenCalled()
  })

  it('stops the current utterance before speaking a new line', () => {
    tts.__setSpeaking(true)

    expect(speakPetText('这次做得不错。')).toBe(true)
    expect(tts.stop).toHaveBeenCalledTimes(1)
    expect(tts.speak).toHaveBeenCalledWith(
      expect.objectContaining({
        text: '这次做得不错。',
        language: 'zh-CN',
        onError: expect.any(Function),
      }),
    )
  })

  it('reports availability from the wrapped plugin', () => {
    tts.__setAvailable(false)
    expect(isPetSpeechAvailable()).toBe(false)
  })

  it('can stop pet speech without throwing', () => {
    stopPetSpeech()
    expect(tts.stop).toHaveBeenCalledTimes(1)
  })
})
