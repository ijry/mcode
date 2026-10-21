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

describe('pet defaults to hidden', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('starts hidden so it does not occupy a floating slot before opt-in', () => {
    const store = usePetStore()
    expect(store.hidden).toBe(true)
    expect(store.initialized).toBe(false)
  })

  it('can be turned on explicitly once the user picks a pet', () => {
    const store = usePetStore()
    store.initPet('fox', '小狐狸')
    store.setHidden(false)
    expect(store.initialized).toBe(true)
    expect(store.hidden).toBe(false)

    store.setHidden(true)
    expect(store.hidden).toBe(true)
  })
})
