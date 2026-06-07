declare module '*uni_modules/uts-plugin-tts' {
  export type TTSOptions = {
    text: string
    rate?: number
    pitch?: number
    volume?: number
    language?: string
  }

  export type TTSCallbacks = {
    onStart?: () => void
    onComplete?: () => void
    onError?: (error: string) => void
    onProgress?: (progress: number) => void
  }

  export function speak(options: TTSOptions, callbacks?: TTSCallbacks): void
  export function stop(): void
  export function pause(): void
  export function resume(): void
  export function isSpeaking(): boolean
  export function getVoices(): Array<{
    identifier: string
    name: string
    language: string
    quality: string
  }>
  export function setVoice(identifier: string): void
  export function isAvailable(): boolean
}
