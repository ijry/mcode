declare module '@uni_modules/up-tts' {
  export type TTSOptions = {
    text: string
    rate?: number
    pitch?: number
    volume?: number
    language?: string
    onStart?: () => void
    onComplete?: () => void
    onError?: (error: string) => void
    onProgress?: (progress: number) => void
  }

  export type TTSCallbacks = {
    onStart?: () => void
    onComplete?: () => void
    onError?: (error: string) => void
    onProgress?: (progress: number) => void
  }

  export type TTSVoice = {
    identifier: string
    name: string
    language: string
    quality: string
  }

  export function speak(options: TTSOptions): void
  export function stop(): void
  export function pause(): void
  export function resume(): void
  export function isSpeaking(): boolean
  export function getVoices(): TTSVoice[]
  export function setVoice(identifier: string): void
  export function isAvailable(): boolean
}

declare module '@/uni_modules/up-tts' {
  export type TTSOptions = {
    text: string
    rate?: number
    pitch?: number
    volume?: number
    language?: string
    onStart?: () => void
    onComplete?: () => void
    onError?: (error: string) => void
    onProgress?: (progress: number) => void
  }

  export type TTSCallbacks = {
    onStart?: () => void
    onComplete?: () => void
    onError?: (error: string) => void
    onProgress?: (progress: number) => void
  }

  export function speak(options: TTSOptions): void
  export function stop(): void
  export function pause(): void
  export function resume(): void
  export function isSpeaking(): boolean
  export type TTSVoice = {
    identifier: string
    name: string
    language: string
    quality: string
  }

  export function getVoices(): TTSVoice[]
  export function setVoice(identifier: string): void
  export function isAvailable(): boolean
}

declare module '*uni_modules/up-tts' {
  export type TTSOptions = {
    text: string
    rate?: number
    pitch?: number
    volume?: number
    language?: string
    onStart?: () => void
    onComplete?: () => void
    onError?: (error: string) => void
    onProgress?: (progress: number) => void
  }

  export type TTSCallbacks = {
    onStart?: () => void
    onComplete?: () => void
    onError?: (error: string) => void
    onProgress?: (progress: number) => void
  }

  export type TTSVoice = {
    identifier: string
    name: string
    language: string
    quality: string
  }

  export function speak(options: TTSOptions): void
  export function stop(): void
  export function pause(): void
  export function resume(): void
  export function isSpeaking(): boolean
  export function getVoices(): TTSVoice[]
  export function setVoice(identifier: string): void
  export function isAvailable(): boolean
}
