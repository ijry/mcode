import { isAvailable, isSpeaking, speak, stop } from '@/../uni_modules/uts-plugin-tts'
import { usePetStore } from '@/stores/pet'

const DEFAULT_OPTIONS = {
  rate: 0.52,
  pitch: 1.08,
  volume: 0.95,
  language: 'zh-CN',
}

function safeIsAvailable(): boolean {
  try {
    return typeof isAvailable === 'function' && isAvailable()
  } catch (error) {
    console.warn('[petVoice] availability check failed', error)
    return false
  }
}

function safeIsSpeaking(): boolean {
  try {
    return typeof isSpeaking === 'function' && isSpeaking()
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
    stop()
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
    if (safeIsSpeaking()) {
      stop()
    }

    speak(
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
