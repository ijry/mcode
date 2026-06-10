import { watch, ref, type WatchStopHandle } from 'vue'
import type { EmotionState, BubbleMessage } from '@/types/pet'
import { useConversationRuntimeStore } from '@/stores/conversationRuntime'
import { usePetStore } from '@/stores/pet'
import { pickBubbleMessage } from '@/services/petConfig'
import { speakPetText } from '@/services/petVoice'
import {
  initMotionEngine,
  selectMotion,
  playMotion,
  requestMotion,
  useMotionEngine,
  destroyMotionEngine,
} from '@/services/petMotionEngine'

/** Current computed emotion state — reactive */
const currentEmotion = ref<EmotionState>('idle')

/** Current bubble message — reactive, null means no bubble */
const currentBubble = ref<BubbleMessage | null>(null)

/** Current motion state — reactive, from motion engine */
const currentMotion = useMotionEngine().currentMotion

/** Current scene decorations — reactive, from motion engine */
const currentDecorations = useMotionEngine().currentDecorations

/** Timers */
let idleTimer: ReturnType<typeof setTimeout> | null = null
let sleepTimer: ReturnType<typeof setTimeout> | null = null
let happyTimer: ReturnType<typeof setTimeout> | null = null
let bubbleTimer: ReturnType<typeof setTimeout> | null = null
let permissionTimer: ReturnType<typeof setTimeout> | null = null
let transientEmotionTimer: ReturnType<typeof setTimeout> | null = null
let motionTimer: ReturnType<typeof setTimeout> | null = null

/** Track last status to detect transitions */
let lastStatus = ''
let engineInitialized = false
let stopRuntimeWatch: WatchStopHandle | null = null

function clearAllTimers() {
  if (idleTimer) { clearTimeout(idleTimer); idleTimer = null }
  if (sleepTimer) { clearTimeout(sleepTimer); sleepTimer = null }
  if (happyTimer) { clearTimeout(happyTimer); happyTimer = null }
  if (bubbleTimer) { clearTimeout(bubbleTimer); bubbleTimer = null }
  if (permissionTimer) { clearTimeout(permissionTimer); permissionTimer = null }
  if (transientEmotionTimer) { clearTimeout(transientEmotionTimer); transientEmotionTimer = null }
  if (motionTimer) { clearTimeout(motionTimer); motionTimer = null }
}

function showBubble(trigger: string) {
  const petStore = usePetStore()
  const message = pickBubbleMessage(trigger)
  if (!message) {
    console.warn('[petEngine] no bubble message for trigger', trigger)
    return null
  }

  if (bubbleTimer) clearTimeout(bubbleTimer)

  currentBubble.value = petStore.bubbleMuted ? null : message
  console.log('[petEngine] showBubble', {
    trigger,
    text: message.text,
    bubbleMuted: petStore.bubbleMuted,
    voiceEnabled: petStore.voiceEnabled,
  })

  if (petStore.voiceEnabled) {
    speakPetText(message.text)
  }

  if (currentBubble.value) {
    bubbleTimer = setTimeout(() => {
      currentBubble.value = null
      bubbleTimer = null
    }, message.duration)
  } else {
    bubbleTimer = null
  }

  return message
}

function computeEmotion(): EmotionState {
  const runtimeStore = useConversationRuntimeStore()

  let highestPriorityStatus = ''
  let hasActiveConnection = false

  for (const [, session] of runtimeStore.sessions) {
    if (session.connectionId) hasActiveConnection = true
    const priority = statusPriority(session.status)
    if (priority > statusPriority(highestPriorityStatus)) {
      highestPriorityStatus = session.status
    }
  }

  switch (highestPriorityStatus) {
    case 'waiting_permission':
      return 'alert'
    case 'error':
      return 'sad'
    case 'thinking':
      return 'curious'
    case 'running_tool':
      return 'busy'
    case 'connecting':
      return 'curious'
    default:
      break
  }

  if (!hasActiveConnection) {
    return currentEmotion.value === 'sleeping' ? 'sleeping' : 'idle'
  }

  return 'idle'
}

function statusPriority(status: string): number {
  switch (status) {
    case 'waiting_permission': return 6
    case 'error': return 5
    case 'thinking': return 4
    case 'running_tool': return 3
    case 'connecting': return 2
    case 'connected': return 1
    case 'idle': return 0
    default: return -1
  }
}

function onStatusChange(newStatus: string) {
  const petStore = usePetStore()
  clearAllTimers()

  if (newStatus === 'idle' && isActiveStatus(lastStatus)) {
    currentEmotion.value = 'happy'
    showBubble('turn_complete')
    petStore.addExp('agent', 3)
    petStore.recordStat('totalTurns')

    happyTimer = setTimeout(() => {
      happyTimer = null
      currentEmotion.value = computeEmotion()
      startIdleTimers()
    }, 5000)

    lastStatus = newStatus
    return
  }

  if (newStatus === 'running_tool') {
    petStore.addExp('agent', 2)
    petStore.recordStat('totalToolCalls')
  }

  if (newStatus === 'waiting_permission') {
    permissionTimer = setTimeout(() => {
      showBubble('waiting_permission_long')
      permissionTimer = null
    }, 30000)
  }

  if (newStatus === 'error') {
    showBubble('error')
  }

  currentEmotion.value = computeEmotion()
  startIdleTimers()

  lastStatus = newStatus
}

function isActiveStatus(status: string): boolean {
  return ['thinking', 'running_tool', 'waiting_permission', 'connecting'].includes(status)
}

function startIdleTimers() {
  idleTimer = setTimeout(() => {
    if (currentEmotion.value === 'idle') {
      currentEmotion.value = 'bored'
    }
    idleTimer = null
  }, 10 * 60 * 1000)

  sleepTimer = setTimeout(() => {
    const runtimeStore = useConversationRuntimeStore()
    let hasActive = false
    for (const [, session] of runtimeStore.sessions) {
      if (session.connectionId) { hasActive = true; break }
    }
    if (!hasActive) {
      currentEmotion.value = 'sleeping'
    }
    sleepTimer = null
  }, 30 * 60 * 1000)
}

/**
 * Schedule the next ambient motion check.
 * Picks a random interval between 8-15 seconds.
 */
function scheduleAmbientMotion() {
  if (motionTimer) {
    clearTimeout(motionTimer)
    motionTimer = null
  }

  const intervalMs = 8000 + Math.floor(Math.random() * 7000)

  motionTimer = setTimeout(() => {
    motionTimer = null

    const emotion = currentEmotion.value
    // Only run ambient motions in idle-compatible states
    const ambientEmotions: EmotionState[] = ['idle', 'sleeping', 'happy', 'bored']
    if (!ambientEmotions.includes(emotion)) {
      scheduleAmbientMotion()
      return
    }

    // Don't select if a motion is already playing
    if (currentMotion.value) {
      scheduleAmbientMotion()
      return
    }

    const hour = new Date().getHours()
    const selected = selectMotion(emotion, hour)
    if (selected) {
      playMotion(selected.id)
    }

    scheduleAmbientMotion()
  }, intervalMs)
}

function showGreeting() {
  const hour = new Date().getHours()
  if (hour < 12) {
    showBubble('morning')
  } else if (hour < 18) {
    showBubble('afternoon')
  } else {
    showBubble('evening')
  }
}

function setTransientEmotion(
  nextEmotion: EmotionState,
  duration: number,
  resolveEmotion: (previousEmotion: EmotionState, currentTemporaryEmotion: EmotionState) => EmotionState,
) {
  const previousEmotion = currentEmotion.value
  currentEmotion.value = nextEmotion

  if (transientEmotionTimer) {
    clearTimeout(transientEmotionTimer)
    transientEmotionTimer = null
  }

  transientEmotionTimer = setTimeout(() => {
    currentEmotion.value = resolveEmotion(previousEmotion, nextEmotion)
    transientEmotionTimer = null
  }, duration)
}

/** Trigger pet interaction (single-tap) */
export function petInteract() {
  const petStore = usePetStore()
  const result = petStore.addExp('user', 2)
  showBubble('pet_interact')

  setTransientEmotion('happy', 2000, (previousEmotion, currentTemporaryEmotion) => (
    previousEmotion === currentTemporaryEmotion ? computeEmotion() : previousEmotion
  ))

  // Trigger snack-nibble motion
  requestMotion('snack-nibble', 'high')

  return result
}

/** Trigger stronger pet interaction (double-tap) */
export function petInteractExcited() {
  const petStore = usePetStore()
  const result = petStore.addExp('user', 3)
  showBubble('pet_interact_excited')

  setTransientEmotion('excited', 2400, (previousEmotion, currentTemporaryEmotion) => (
    previousEmotion === currentTemporaryEmotion ? computeEmotion() : previousEmotion
  ))

  // Trigger play-hop motion
  requestMotion('play-hop', 'high')

  return result
}

/** Trigger level-up celebration */
export function showLevelUpCelebration() {
  showBubble('level_up')
  setTransientEmotion('excited', 4000, () => computeEmotion())

  // Trigger self-proud celebration motion
  requestMotion('self-proud', 'high')
}

/**
 * Initialize the pet engine.
 * Call once from PetFloat.vue on mount.
 */
export function initPetEngine() {
  if (engineInitialized) return { currentEmotion, currentBubble, currentMotion, currentDecorations }
  engineInitialized = true

  const runtimeStore = useConversationRuntimeStore()

  // Initialize motion engine
  initMotionEngine()

  stopRuntimeWatch = watch(
    () => {
      let highest = ''
      for (const [, session] of runtimeStore.sessions) {
        if (statusPriority(session.status) > statusPriority(highest)) {
          highest = session.status
        }
      }
      return highest
    },
    (newStatus) => {
      onStatusChange(newStatus)
    },
    { immediate: true }
  )

  showGreeting()

  const petStore = usePetStore()
  if (petStore.initialized) {
    petStore.signInToday()
  }

  startIdleTimers()

  // Start ambient motion scheduling
  scheduleAmbientMotion()

  return { currentEmotion, currentBubble, currentMotion, currentDecorations }
}

/** Get reactive refs without re-initializing */
export function usePetEngine() {
  return { currentEmotion, currentBubble, currentMotion, currentDecorations }
}

/** Cleanup */
export function destroyPetEngine() {
  clearAllTimers()
  destroyMotionEngine()
  if (stopRuntimeWatch) {
    stopRuntimeWatch()
    stopRuntimeWatch = null
  }
  engineInitialized = false
}
