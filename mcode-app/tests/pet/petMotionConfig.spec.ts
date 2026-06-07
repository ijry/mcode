import {
  MOTION_TEMPLATES,
  MOTION_CONFIG_MAP,
  getMotionsByGroup,
  getMotionsByEmotion,
  isMotionAllowedAtHour,
  getMotionsByTrigger,
} from '@/services/petMotionConfig'
import type { MotionId } from '@/types/petMotion'

describe('petMotionConfig', () => {
  describe('MOTION_TEMPLATES', () => {
    it('has at least one motion template', () => {
      expect(MOTION_TEMPLATES.length).toBeGreaterThan(0)
    })

    it('has at least 25 motions', () => {
      expect(MOTION_TEMPLATES.length).toBeGreaterThanOrEqual(25)
    })

    it('all motion IDs are unique', () => {
      const ids = MOTION_TEMPLATES.map(t => t.id)
      const uniqueIds = new Set(ids)
      expect(uniqueIds.size).toBe(ids.length)
    })

    it('every template has required fields', () => {
      for (const template of MOTION_TEMPLATES) {
        expect(template.id).toBeTruthy()
        expect(template.group).toBeTruthy()
        expect(template.durationMs).toBeGreaterThan(0)
        expect(template.cooldownMs).toBeGreaterThan(0)
        expect(template.weight).toBeGreaterThan(0)
        expect(template.allowedEmotions.length).toBeGreaterThan(0)
        expect(typeof template.interruptible).toBe('boolean')
        expect(Array.isArray(template.sceneDecorations)).toBe(true)
        expect(typeof template.bodyClass).toBe('string')
        expect(template.priority).toBeTruthy()
      }
    })

    it('all durations are reasonable (between 500ms and 10000ms)', () => {
      for (const template of MOTION_TEMPLATES) {
        expect(template.durationMs).toBeGreaterThanOrEqual(500)
        expect(template.durationMs).toBeLessThanOrEqual(10000)
      }
    })

    it('all cooldowns are >= durationMs (no overlap)', () => {
      for (const template of MOTION_TEMPLATES) {
        expect(template.cooldownMs).toBeGreaterThanOrEqual(template.durationMs)
      }
    })
  })

  describe('MOTION_CONFIG_MAP', () => {
    it('includes all motions', () => {
      const mapIds = Object.keys(MOTION_CONFIG_MAP)
      expect(mapIds.length).toBe(MOTION_TEMPLATES.length)
    })

    it('returns correct template by ID', () => {
      const lookAround = MOTION_CONFIG_MAP['idle-look-around']
      expect(lookAround).toBeTruthy()
      expect(lookAround.group).toBe('idle')
    })
  })

  describe('getMotionsByGroup', () => {
    it('returns correct count for idle group', () => {
      const idleMotions = getMotionsByGroup('idle')
      // look-around, tail-swish, ear-twitch, groom, sneeze, shake, stretch-yawn
      expect(idleMotions.length).toBe(7)
    })

    it('returns correct count for sleep group', () => {
      const sleepMotions = getMotionsByGroup('sleep')
      // sleep-curl, sleep-zzz, sleep-dream
      expect(sleepMotions.length).toBe(3)
    })

    it('returns empty array for unknown group', () => {
      // @ts-expect-error testing invalid group
      const empty = getMotionsByGroup('unknown')
      expect(empty).toEqual([])
    })
  })

  describe('getMotionsByEmotion', () => {
    it('returns idle motions for idle emotion', () => {
      const motions = getMotionsByEmotion('idle')
      expect(motions.length).toBeGreaterThanOrEqual(3)
    })

    it('returns sleep motions for sleeping emotion', () => {
      const motions = getMotionsByEmotion('sleeping')
      // sleep-curl, sleep-zzz, sleep-dream
      expect(motions.length).toBe(3)
      for (const m of motions) {
        expect(m.allowedEmotions).toContain('sleeping')
      }
    })

    it('returns motions for alert emotion', () => {
      const motions = getMotionsByEmotion('alert')
      // alert-freeze, play-pounce
      expect(motions.length).toBeGreaterThanOrEqual(1)
      for (const m of motions) {
        expect(m.allowedEmotions).toContain('alert')
      }
    })

    it('returns no motions for sad emotion', () => {
      const motions = getMotionsByEmotion('sad')
      expect(motions.length).toBe(0)
    })
  })

  describe('isMotionAllowedAtHour', () => {
    it('returns true when no hour restriction', () => {
      const template = MOTION_CONFIG_MAP['idle-look-around']
      expect(template.allowedHours).toBeUndefined()
      expect(isMotionAllowedAtHour(template, 0)).toBe(true)
      expect(isMotionAllowedAtHour(template, 23)).toBe(true)
    })

    it('returns true when hour is in allowed range', () => {
      const template = MOTION_CONFIG_MAP['stretch-yawn']
      expect(template.allowedHours).toEqual([14, 15, 16])
      expect(isMotionAllowedAtHour(template, 14)).toBe(true)
      expect(isMotionAllowedAtHour(template, 15)).toBe(true)
      expect(isMotionAllowedAtHour(template, 16)).toBe(true)
    })

    it('returns false when hour is outside allowed range', () => {
      const template = MOTION_CONFIG_MAP['stretch-yawn']
      expect(isMotionAllowedAtHour(template, 10)).toBe(false)
      expect(isMotionAllowedAtHour(template, 20)).toBe(false)
    })
  })

  describe('getMotionsByTrigger', () => {
    it('returns snack-nibble for tap trigger', () => {
      const motions = getMotionsByTrigger('tap')
      expect(motions.length).toBe(1)
      expect(motions[0].id).toBe('snack-nibble')
    })

    it('returns play-ball for doubleTap trigger', () => {
      const motions = getMotionsByTrigger('doubleTap')
      expect(motions.length).toBe(1)
      expect(motions[0].id).toBe('play-ball')
    })

    it('returns self-proud for levelUp trigger', () => {
      const motions = getMotionsByTrigger('levelUp')
      expect(motions.length).toBe(1)
      expect(motions[0].id).toBe('self-proud')
    })

    it('returns empty array for unknown trigger', () => {
      const motions = getMotionsByTrigger('unknown')
      expect(motions).toEqual([])
    })
  })
})
