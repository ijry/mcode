import type {
  MotionId,
  MotionTemplate,
  MotionConfigMap,
  MotionGroup,
} from '@/types/petMotion'
import type { EmotionState } from '@/types/pet'

/**
 * Phase 1 motion templates.
 *
 * Each template defines eligibility (allowedEmotions, allowedHours),
 * cooldown, weight for random selection, decorations, and body class.
 */
export const MOTION_TEMPLATES: MotionTemplate[] = [
  // ── Idle motions ──
  {
    id: 'idle-look-around',
    group: 'idle',
    durationMs: 3000,
    cooldownMs: 20000,
    weight: 3,
    allowedEmotions: ['idle'],
    interruptible: true,
    sceneDecorations: [],
    bodyClass: 'look-around',
    priority: 'low',
  },
  {
    id: 'idle-tail-swish',
    group: 'idle',
    durationMs: 2000,
    cooldownMs: 12000,
    weight: 4,
    allowedEmotions: ['idle', 'happy', 'bored'],
    interruptible: true,
    sceneDecorations: [],
    bodyClass: 'tail-swish',
    priority: 'low',
  },
  {
    id: 'stretch-yawn',
    group: 'idle',
    durationMs: 3500,
    cooldownMs: 35000,
    weight: 2,
    allowedEmotions: ['idle', 'bored'],
    allowedHours: [14, 15, 16],
    interruptible: true,
    sceneDecorations: [],
    bodyClass: 'stretch-yawn',
    priority: 'low',
  },

  // ── Sleep motions ──
  {
    id: 'sleep-curl',
    group: 'sleep',
    durationMs: 6000,
    cooldownMs: 15000,
    weight: 3,
    allowedEmotions: ['sleeping'],
    interruptible: false,
    sceneDecorations: [],
    bodyClass: 'sleep-curl',
    priority: 'medium',
  },
  {
    id: 'sleep-zzz',
    group: 'sleep',
    durationMs: 5000,
    cooldownMs: 20000,
    weight: 4,
    allowedEmotions: ['sleeping'],
    interruptible: true,
    sceneDecorations: ['zzz'],
    bodyClass: 'sleep-zzz',
    priority: 'medium',
  },

  // ── Snack motions ──
  {
    id: 'snack-nibble',
    group: 'snack',
    durationMs: 3500,
    cooldownMs: 30000,
    weight: 2,
    allowedEmotions: ['idle', 'happy'],
    interruptible: true,
    sceneDecorations: ['snack'],
    bodyClass: 'snack-nibble',
    trigger: 'tap',
    priority: 'high',
  },
  {
    id: 'snack-happy-chew',
    group: 'snack',
    durationMs: 3000,
    cooldownMs: 30000,
    weight: 2,
    allowedEmotions: ['happy', 'excited'],
    interruptible: true,
    sceneDecorations: ['snack', 'crumbs'],
    bodyClass: 'snack-happy-chew',
    priority: 'medium',
  },

  // ── Play motions ──
  {
    id: 'play-hop',
    group: 'play',
    durationMs: 2500,
    cooldownMs: 25000,
    weight: 2,
    allowedEmotions: ['happy', 'excited'],
    interruptible: true,
    sceneDecorations: [],
    bodyClass: 'play-hop',
    priority: 'high',
  },
  {
    id: 'play-ball',
    group: 'play',
    durationMs: 4000,
    cooldownMs: 35000,
    weight: 1,
    allowedEmotions: ['happy', 'excited'],
    interruptible: true,
    sceneDecorations: ['ball'],
    bodyClass: 'play-ball',
    trigger: 'doubleTap',
    priority: 'high',
  },

  // ── Celebration ──
  {
    id: 'self-proud',
    group: 'celebration',
    durationMs: 3000,
    cooldownMs: 40000,
    weight: 1,
    allowedEmotions: ['happy', 'excited'],
    interruptible: true,
    sceneDecorations: ['sparkles'],
    bodyClass: 'self-proud',
    trigger: 'levelUp',
    priority: 'high',
  },
]

/** Lookup map from motion id to template — built once */
export const MOTION_CONFIG_MAP: MotionConfigMap = Object.fromEntries(
  MOTION_TEMPLATES.map(t => [t.id, t]),
) as MotionConfigMap

/** Get all motion IDs for a given group */
export function getMotionsByGroup(group: MotionGroup): MotionTemplate[] {
  return MOTION_TEMPLATES.filter(t => t.group === group)
}

/** Get all motion IDs eligible for a given emotion */
export function getMotionsByEmotion(emotion: EmotionState): MotionTemplate[] {
  return MOTION_TEMPLATES.filter(t => t.allowedEmotions.includes(emotion))
}

/** Check if a motion can play at a given hour */
export function isMotionAllowedAtHour(template: MotionTemplate, hour: number): boolean {
  if (!template.allowedHours || template.allowedHours.length === 0) return true
  return template.allowedHours.includes(hour)
}

/** Get motions that match a specific trigger */
export function getMotionsByTrigger(trigger: string): MotionTemplate[] {
  return MOTION_TEMPLATES.filter(t => t.trigger === trigger)
}
