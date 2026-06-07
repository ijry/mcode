import { ref, type Ref } from 'vue'
import type {
  MotionId,
  MotionTemplate,
  MotionState,
  MotionPriority,
  SceneDecoration,
} from '@/types/petMotion'
import type { EmotionState } from '@/types/pet'
import {
  MOTION_CONFIG_MAP,
  MOTION_TEMPLATES,
  isMotionAllowedAtHour,
} from '@/services/petMotionConfig'

// ── Priority numeric mapping ──

const PRIORITY_LEVEL: Record<MotionPriority, number> = {
  high: 3,
  medium: 2,
  low: 1,
}

function priorityNumber(p: MotionPriority): number {
  return PRIORITY_LEVEL[p]
}

// ── Reactive state ──

/** Currently active motion, or null if idle */
const currentMotion = ref<MotionState | null>(null)

/** Scene decorations to render alongside the pet */
const currentDecorations = ref<SceneDecoration[]>([])

/** Cooldown end timestamps (Date.now() value) per motion id */
const cooldowns = new Map<MotionId, number>()

/** The last motion that was played (prevent immediate repeat) */
let lastMotionId: MotionId | null = null

/** Internal timer for auto-clearing finished motions */
let motionClearTimer: ReturnType<typeof setTimeout> | null = null

/** Whether the engine has been initialized */
let engineInitialized = false

// ── Internal helpers ──

function clearMotionTimer() {
  if (motionClearTimer) {
    clearTimeout(motionClearTimer)
    motionClearTimer = null
  }
}

/** Remove expired cooldowns to prevent memory leaks */
function pruneCooldowns() {
  const now = Date.now()
  for (const [id, expiry] of cooldowns) {
    if (now >= expiry) {
      cooldowns.delete(id)
    }
  }
}

/**
 * Weighted random selection from eligible templates.
 * Returns null if the list is empty.
 */
function weightedPick(templates: MotionTemplate[]): MotionTemplate | null {
  if (templates.length === 0) return null
  if (templates.length === 1) return templates[0]

  const totalWeight = templates.reduce((sum, t) => sum + t.weight, 0)
  let rand = Math.random() * totalWeight

  for (const template of templates) {
    rand -= template.weight
    if (rand <= 0) return template
  }

  // Fallback: return the last one
  return templates[templates.length - 1]
}

/**
 * Check whether a new motion at `newPriority` can preempt the current
 * motion at `currentPriority`.
 */
function canPreempt(
  newPriority: MotionPriority,
  currentPriority: MotionPriority,
  currentInterruptible: boolean,
): boolean {
  if (!currentInterruptible) return false
  return priorityNumber(newPriority) >= priorityNumber(currentPriority)
}

// ── Public API ──

/**
 * Initialize the motion engine. Safe to call multiple times.
 */
export function initMotionEngine() {
  if (engineInitialized) return { currentMotion, currentDecorations }
  engineInitialized = true
  pruneCooldowns()
  return { currentMotion, currentDecorations }
}

/**
 * Select the best eligible motion for the given context.
 *
 * @param emotion - Current pet emotion
 * @param hour - Current hour (0-23)
 * @param trigger - Optional trigger that narrows selection to matching motions
 * @returns A selected motion template, or null if none eligible
 */
export function selectMotion(
  emotion: EmotionState,
  hour: number,
  trigger?: string,
): MotionTemplate | null {
  pruneCooldowns()

  let candidates = MOTION_TEMPLATES

  // Filter by allowed emotions
  candidates = candidates.filter(t => t.allowedEmotions.includes(emotion))

  // Filter by hour restriction
  candidates = candidates.filter(t => isMotionAllowedAtHour(t, hour))

  // Filter out motions on cooldown
  const now = Date.now()
  candidates = candidates.filter(t => {
    const expiry = cooldowns.get(t.id)
    return expiry === undefined || now >= expiry
  })

  // Filter out the last played motion (prevent immediate repeat)
  if (lastMotionId) {
    candidates = candidates.filter(t => t.id !== lastMotionId)
  }

  if (candidates.length === 0) return null

  // If a trigger is provided, try to find matching motions first
  if (trigger) {
    const triggered = candidates.filter(t => t.trigger === trigger)
    if (triggered.length > 0) {
      return weightedPick(triggered)
    }
  }

  // Also exclude motions tied to triggers we didn't ask for
  // (trigger-specific motions shouldn't play as ambient)
  const ambientCandidates = candidates.filter(t => !t.trigger)
  if (ambientCandidates.length === 0) return null

  return weightedPick(ambientCandidates)
}

/**
 * Start playing a motion by ID.
 * Automatically schedules a timer to clear the motion when it expires.
 *
 * @param id - Motion ID to play
 * @returns The new MotionState, or null if the motion template wasn't found
 */
export function playMotion(id: MotionId): MotionState | null {
  const template = MOTION_CONFIG_MAP[id]
  if (!template) return null

  // Clear any existing motion and timers
  clearMotion()
  clearMotionTimer()

  const state: MotionState = {
    id: template.id,
    template,
    startedAt: Date.now(),
    decorations: [...template.sceneDecorations],
    bodyClass: template.bodyClass,
  }

  currentMotion.value = state
  currentDecorations.value = [...template.sceneDecorations]
  lastMotionId = id

  // Set cooldown
  cooldowns.set(id, Date.now() + template.cooldownMs)

  // Auto-clear when motion duration expires
  motionClearTimer = setTimeout(() => {
    if (currentMotion.value?.id === id) {
      clearMotion()
    }
    motionClearTimer = null
  }, template.durationMs)

  return state
}

/**
 * Request to play a motion, respecting preemption rules.
 *
 * @param id - Motion ID to play
 * @param priority - Priority of the request
 * @returns true if the motion was started, false if it was rejected
 */
export function requestMotion(id: MotionId, priority: MotionPriority): boolean {
  const template = MOTION_CONFIG_MAP[id]
  if (!template) return false

  // If a motion is already playing, check preemption
  if (currentMotion.value) {
    const currentTemplate = currentMotion.value.template
    if (!canPreempt(priority, currentTemplate.priority, currentTemplate.interruptible)) {
      return false
    }
  }

  const result = playMotion(id)
  return result !== null
}

/**
 * Stop the current motion and clear all decorations.
 */
export function clearMotion() {
  currentMotion.value = null
  currentDecorations.value = []
  clearMotionTimer()
}

/**
 * Check if a motion is currently active.
 */
export function isMotionActive(): boolean {
  return currentMotion.value !== null
}

/**
 * Get the currently active motion ID (or null).
 */
export function getActiveMotionId(): MotionId | null {
  return currentMotion.value?.id ?? null
}

/**
 * Cleanup — call on component unmount.
 */
export function destroyMotionEngine() {
  clearMotion()
  cooldowns.clear()
  lastMotionId = null
  engineInitialized = false
}

/**
 * Get reactive refs without re-initializing.
 */
export function useMotionEngine() {
  return { currentMotion, currentDecorations }
}
