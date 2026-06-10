import { speak, stop, isSpeaking, isAvailable } from '@/uni_modules/up-tts'
import { usePetStore } from '@/stores/pet'

const DEFAULT_OPTIONS = {
  rate: 0.46,
  pitch: 1.28,
  volume: 0.9,
  language: 'zh-CN',
}

let ttsInitErrorLogged = false

function safeIsAvailable(): boolean {
  try {
    return isAvailable()
  } catch (error) {
    if (!ttsInitErrorLogged) {
      ttsInitErrorLogged = true
      console.warn('[petVoice] availability check failed', error)
    }
    return false
  }
}

function safeIsSpeaking(): boolean {
  try {
    return isSpeaking()
  } catch (error) {
    if (!ttsInitErrorLogged) {
      ttsInitErrorLogged = true
      console.warn('[petVoice] speaking check failed', error)
    }
    return false
  }
}

export function isPetSpeechAvailable(): boolean {
  return safeIsAvailable()
}

export function stopPetSpeech(): void {
  try {
    stop()
  } catch (error) {
    if (!ttsInitErrorLogged) {
      ttsInitErrorLogged = true
      console.warn('[petVoice] stop failed', error)
    }
  }
}

export function speakPetText(text: string): boolean {
  const petStore = usePetStore()
  const trimmed = text.trim()

  if (!trimmed || !petStore.voiceEnabled) {
    console.log('[petVoice] skipped before speak', {
      hasText: Boolean(trimmed),
      voiceEnabled: petStore.voiceEnabled,
    })
    return false
  }

  try {
    console.log('[petVoice] speak request', {
      text: trimmed,
      available: safeIsAvailable(),
    })

    if (safeIsSpeaking()) {
      stop()
    }

    speak(
      {
        text: trimmed,
        ...DEFAULT_OPTIONS,
        onStart: () => {
          console.log('[petVoice] onStart')
        },
        onComplete: () => {
          console.log('[petVoice] onComplete')
        },
        onError: (error) => {
          console.warn('[petVoice] speak failed', error)
        },
      },
    )
    return true
  } catch (error) {
    if (!ttsInitErrorLogged) {
      ttsInitErrorLogged = true
      console.warn('[petVoice] unexpected speak error', error)
    }
    return false
  }
}
