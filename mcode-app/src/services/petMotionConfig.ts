import type {
  MotionId,
  MotionTemplate,
  MotionConfigMap,
  MotionGroup,
} from '@/types/petMotion'
import type { EmotionState } from '@/types/pet'

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
    id: 'idle-ear-twitch',
    group: 'idle',
    durationMs: 1800,
    cooldownMs: 15000,
    weight: 3,
    allowedEmotions: ['idle', 'curious'],
    interruptible: true,
    sceneDecorations: [],
    bodyClass: 'ear-twitch',
    priority: 'low',
  },
  {
    id: 'idle-groom',
    group: 'idle',
    durationMs: 3200,
    cooldownMs: 28000,
    weight: 2,
    allowedEmotions: ['idle', 'happy'],
    interruptible: true,
    sceneDecorations: [],
    bodyClass: 'groom',
    priority: 'low',
  },
  {
    id: 'idle-sneeze',
    group: 'idle',
    durationMs: 1500,
    cooldownMs: 45000,
    weight: 1,
    allowedEmotions: ['idle', 'bored'],
    interruptible: true,
    sceneDecorations: ['sweat'],
    bodyClass: 'sneeze',
    priority: 'low',
  },
  {
    id: 'idle-shake',
    group: 'idle',
    durationMs: 1200,
    cooldownMs: 18000,
    weight: 2,
    allowedEmotions: ['idle'],
    interruptible: true,
    sceneDecorations: [],
    bodyClass: 'body-shake',
    priority: 'low',
  },

  // ── Bored motions ──

  {
    id: 'bored-sigh',
    group: 'bored',
    durationMs: 3000,
    cooldownMs: 25000,
    weight: 4,
    allowedEmotions: ['bored'],
    interruptible: true,
    sceneDecorations: [],
    bodyClass: 'bored-sigh',
    priority: 'low',
  },
  {
    id: 'bored-slump',
    group: 'bored',
    durationMs: 4000,
    cooldownMs: 30000,
    weight: 3,
    allowedEmotions: ['bored'],
    interruptible: true,
    sceneDecorations: [],
    bodyClass: 'bored-slump',
    priority: 'low',
  },

  // ── Stretch / yawn ──

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

  // ── Curious motions ──

  {
    id: 'curious-peek',
    group: 'curious',
    durationMs: 2800,
    cooldownMs: 20000,
    weight: 4,
    allowedEmotions: ['curious'],
    interruptible: true,
    sceneDecorations: ['thought'],
    bodyClass: 'curious-peek',
    priority: 'medium',
  },
  {
    id: 'curious-sniff',
    group: 'curious',
    durationMs: 2200,
    cooldownMs: 18000,
    weight: 3,
    allowedEmotions: ['curious'],
    interruptible: true,
    sceneDecorations: [],
    bodyClass: 'curious-sniff',
    priority: 'medium',
  },
  {
    id: 'curious-tilt-deep',
    group: 'curious',
    durationMs: 2500,
    cooldownMs: 22000,
    weight: 3,
    allowedEmotions: ['curious'],
    interruptible: true,
    sceneDecorations: ['thought'],
    bodyClass: 'curious-tilt-deep',
    priority: 'medium',
  },

  // ── Busy / alert motions ──

  {
    id: 'busy-type',
    group: 'busy',
    durationMs: 3000,
    cooldownMs: 15000,
    weight: 4,
    allowedEmotions: ['busy'],
    interruptible: true,
    sceneDecorations: [],
    bodyClass: 'busy-type',
    priority: 'medium',
  },
  {
    id: 'alert-freeze',
    group: 'busy',
    durationMs: 2000,
    cooldownMs: 20000,
    weight: 3,
    allowedEmotions: ['alert'],
    interruptible: false,
    sceneDecorations: ['sweat'],
    bodyClass: 'alert-freeze',
    priority: 'medium',
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
  {
    id: 'sleep-dream',
    group: 'sleep',
    durationMs: 5500,
    cooldownMs: 30000,
    weight: 2,
    allowedEmotions: ['sleeping'],
    interruptible: true,
    sceneDecorations: ['heart'],
    bodyClass: 'sleep-dream',
    priority: 'medium',
  },

  // ── Excited motions ──

  {
    id: 'excited-spin',
    group: 'excited',
    durationMs: 2000,
    cooldownMs: 20000,
    weight: 3,
    allowedEmotions: ['excited'],
    interruptible: true,
    sceneDecorations: ['sparkles'],
    bodyClass: 'excited-spin',
    priority: 'medium',
  },
  {
    id: 'excited-wiggle',
    group: 'excited',
    durationMs: 2500,
    cooldownMs: 18000,
    weight: 4,
    allowedEmotions: ['excited'],
    interruptible: true,
    sceneDecorations: [],
    bodyClass: 'excited-wiggle',
    priority: 'medium',
  },

  // ── Happy motions ──

  {
    id: 'happy-dance',
    group: 'happy',
    durationMs: 3000,
    cooldownMs: 22000,
    weight: 3,
    allowedEmotions: ['happy'],
    interruptible: true,
    sceneDecorations: ['music'],
    bodyClass: 'happy-dance',
    priority: 'medium',
  },
  {
    id: 'happy-heart',
    group: 'happy',
    durationMs: 2500,
    cooldownMs: 25000,
    weight: 2,
    allowedEmotions: ['happy'],
    interruptible: true,
    sceneDecorations: ['heart'],
    bodyClass: 'happy-heart',
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
  {
    id: 'play-chase-tail',
    group: 'play',
    durationMs: 3000,
    cooldownMs: 30000,
    weight: 2,
    allowedEmotions: ['excited', 'happy'],
    interruptible: true,
    sceneDecorations: [],
    bodyClass: 'chase-tail',
    priority: 'medium',
  },
  {
    id: 'play-pounce',
    group: 'play',
    durationMs: 1800,
    cooldownMs: 22000,
    weight: 2,
    allowedEmotions: ['excited', 'alert'],
    interruptible: true,
    sceneDecorations: [],
    bodyClass: 'pounce',
    priority: 'medium',
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
  {
    id: 'celebrate-confetti',
    group: 'celebration',
    durationMs: 3500,
    cooldownMs: 60000,
    weight: 1,
    allowedEmotions: ['excited'],
    interruptible: true,
    sceneDecorations: ['confetti', 'sparkles'],
    bodyClass: 'celebrate-confetti',
    priority: 'medium',
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
