import { createPinia, setActivePinia } from 'pinia'
import { usePetStore } from '@/stores/pet'

describe('pet store voice settings', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('starts with voice enabled', () => {
    const store = usePetStore()
    expect(store.voiceEnabled).toBe(true)
  })

  it('can update the voice toggle explicitly', () => {
    const store = usePetStore()
    store.setVoiceEnabled(false)
    expect(store.voiceEnabled).toBe(false)
    store.setVoiceEnabled(true)
    expect(store.voiceEnabled).toBe(true)
  })
})
