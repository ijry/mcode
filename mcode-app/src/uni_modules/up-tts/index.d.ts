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

export declare function speak(options: TTSOptions): void
export declare function stop(): void
export declare function pause(): void
export declare function resume(): void
export declare function isSpeaking(): boolean
export declare function getVoices(): TTSVoice[]
export declare function setVoice(identifier: string): void
export declare function isAvailable(): boolean
