import * as ttsModule from '@/../uni_modules/uts-plugin-tts'
import { usePetStore } from '@/stores/pet'

type TtsApi = {
  speak?: (options: typeof DEFAULT_OPTIONS & { text: string }, callbacks?: { onError?: (error: string) => void }) => void
  stop?: () => void
  isSpeaking?: () => boolean
  isAvailable?: () => boolean
}

const DEFAULT_OPTIONS = {
  rate: 0.46,
  pitch: 1.28,
  volume: 0.9,
  language: 'zh-CN',
}

function resolveTtsApi(): TtsApi {
  const moduleApi = ttsModule as TtsApi & { TTSModule?: TtsApi }
  if (typeof moduleApi.speak === 'function') {
    return moduleApi
  }
  if (moduleApi.TTSModule && typeof moduleApi.TTSModule.speak === 'function') {
    return moduleApi.TTSModule
  }
  return {}
}

function safeIsAvailable(): boolean {
  try {
    const api = resolveTtsApi()
    return typeof api.isAvailable === 'function' && api.isAvailable()
  } catch (error) {
    console.warn('[petVoice] availability check failed', error)
    return false
  }
}

function safeIsSpeaking(): boolean {
  try {
    const api = resolveTtsApi()
    return typeof api.isSpeaking === 'function' && api.isSpeaking()
  } catch (error) {
    console.warn('[petVoice] speaking check failed', error)
    return false
  }
}

export function isPetSpeechAvailable(): boolean {
  return safeIsAvailable()
}

export function stopPetSpeech(): void {
  try {
    resolveTtsApi().stop?.()
  } catch (error) {
    console.warn('[petVoice] stop failed', error)
  }
}

export function speakPetText(text: string): boolean {
  const petStore = usePetStore()
  const trimmed = text.trim()

  if (!trimmed || !petStore.voiceEnabled || !safeIsAvailable()) {
    return false
  }

  try {
    const api = resolveTtsApi()
    if (typeof api.speak !== 'function') {
      return false
    }

    if (safeIsSpeaking()) {
      api.stop?.()
    }

    api.speak(
      {
        text: trimmed,
        ...DEFAULT_OPTIONS,
      },
      {
        onError: (error) => {
          console.warn('[petVoice] speak failed', error)
        },
      },
    )
    return true
  } catch (error) {
    console.warn('[petVoice] unexpected speak error', error)
    return false
  }
}
