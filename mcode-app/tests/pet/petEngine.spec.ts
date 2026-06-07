import { createPinia, setActivePinia } from 'pinia'

const mockRuntimeStore = {
  sessions: new Map(),
}

jest.mock('@/stores/conversationRuntime', () => ({
  useConversationRuntimeStore: () => mockRuntimeStore,
}))

jest.mock('@/services/petVoice', () => ({
  speakPetText: jest.fn(() => true),
}))

import { usePetStore } from '@/stores/pet'
import { destroyPetEngine, petInteract, usePetEngine } from '@/services/petEngine'
import { speakPetText } from '@/services/petVoice'

const mockSpeakPetText = speakPetText as jest.MockedFunction<typeof speakPetText>

describe('pet engine interaction speech', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockSpeakPetText.mockClear()

    const { currentBubble, currentEmotion } = usePetEngine()
    currentBubble.value = null
    currentEmotion.value = 'idle'
  })

  afterEach(() => {
    destroyPetEngine()
  })

  it('speaks the exact line shown in the bubble for a normal interaction', () => {
    const store = usePetStore()
    store.initialized = true

    petInteract()

    const { currentBubble } = usePetEngine()
    expect(currentBubble.value?.text).toBeTruthy()
    expect(mockSpeakPetText).toHaveBeenCalledWith(currentBubble.value?.text)
  })

  it('skips speech when the user disabled voice', () => {
    const store = usePetStore()
    store.setVoiceEnabled(false)

    petInteract()

    expect(mockSpeakPetText).not.toHaveBeenCalled()
  })
})
