const PET_TAP_AUDIO_SRC = '/static/pets/pet-tap.wav'

let tapAudioContext: UniApp.InnerAudioContext | null = null

function canSetObeyMuteSwitch(context: UniApp.InnerAudioContext): boolean {
  let target: object | null = context as object

  while (target) {
    const descriptor = Object.getOwnPropertyDescriptor(target, 'obeyMuteSwitch')
    if (descriptor) {
      return descriptor.writable === true || typeof descriptor.set === 'function'
    }

    target = Object.getPrototypeOf(target)
  }

  return false
}

function tryDisableMuteSwitch(context: UniApp.InnerAudioContext): void {
  if (!canSetObeyMuteSwitch(context)) {
    return
  }

  context.obeyMuteSwitch = false
}

function getTapAudioContext(): UniApp.InnerAudioContext | null {
  if (tapAudioContext) {
    return tapAudioContext
  }

  if (typeof uni === 'undefined' || typeof uni.createInnerAudioContext !== 'function') {
    return null
  }

  const context = uni.createInnerAudioContext()
  context.autoplay = false
  tryDisableMuteSwitch(context)
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
