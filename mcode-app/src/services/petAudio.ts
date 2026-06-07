const PET_TAP_AUDIO_SRC = '/static/pets/pet-tap.wav'

let tapAudioContext: UniApp.InnerAudioContext | null = null

function getTapAudioContext(): UniApp.InnerAudioContext | null {
  if (tapAudioContext) {
    return tapAudioContext
  }

  if (typeof uni === 'undefined' || typeof uni.createInnerAudioContext !== 'function') {
    return null
  }

  const context = uni.createInnerAudioContext()
  context.autoplay = false
  context.obeyMuteSwitch = false
  context.src = PET_TAP_AUDIO_SRC
  context.onError((error) => {
    console.warn('[petAudio] tap sound failed', error)
  })

  tapAudioContext = context
  return tapAudioContext
}

export function playPetTapSound(): boolean {
  const context = getTapAudioContext()
  if (!context) return false

  try {
    context.stop()
    context.src = PET_TAP_AUDIO_SRC
    context.play()
    return true
  } catch (error) {
    console.warn('[petAudio] play failed', error)
    return false
  }
}

export function resetPetAudioForTests(): void {
  if (!tapAudioContext) return

  tapAudioContext.destroy?.()
  tapAudioContext = null
}
