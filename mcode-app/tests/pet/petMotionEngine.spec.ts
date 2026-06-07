import {
  initMotionEngine,
  selectMotion,
  playMotion,
  requestMotion,
  clearMotion,
  isMotionActive,
  getActiveMotionId,
  destroyMotionEngine,
} from '@/services/petMotionEngine'
import { MOTION_CONFIG_MAP } from '@/services/petMotionConfig'

describe('petMotionEngine', () => {
  beforeEach(() => {
    destroyMotionEngine()
    initMotionEngine()
  })

  describe('selectMotion', () => {
    it('returns null when no motions are eligible for the emotion', () => {
      // sad has no motions configured
      const result = selectMotion('sad', 12)
      expect(result).toBeNull()
    })

    it('returns a motion for alert emotion', () => {
      // alert-freeze and play-pounce are configured for alert
      const result = selectMotion('alert', 12)
      expect(result).not.toBeNull()
      expect(result!.allowedEmotions).toContain('alert')
    })

    it('returns a valid motion for idle emotion', () => {
      const result = selectMotion('idle', 12)
      expect(result).not.toBeNull()
      expect(result!.allowedEmotions).toContain('idle')
    })

    it('returns a valid motion for sleeping emotion', () => {
      const result = selectMotion('sleeping', 12)
      expect(result).not.toBeNull()
      expect(result!.allowedEmotions).toContain('sleeping')
    })

    it('respects hour restrictions (stretch-yawn at hour 14)', () => {
      // At hour 14, stretch-yawn is eligible
      const result = selectMotion('idle', 14)
      expect(result).not.toBeNull()
    })

    it('does not return stretch-yawn outside its allowed hours', () => {
      // At hour 10, stretch-yawn should NOT be eligible
      // But other idle motions should be
      const result = selectMotion('idle', 10)
      expect(result).not.toBeNull()
      // Verify stretch-yawn can't be selected at hour 10 by checking
      // multiple selections
      const ids = new Set<string>()
      for (let i = 0; i < 20; i++) {
        const r = selectMotion('idle', 10)
        if (r) ids.add(r.id)
      }
      expect(ids.has('stretch-yawn')).toBe(false)
    })

    it('does not return motions that are on cooldown', () => {
      // Play a motion to put it on cooldown
      const first = selectMotion('idle', 12)
      expect(first).not.toBeNull()
      playMotion(first!.id)

      // Immediately try to select the same motion
      // The last played motion should also be excluded
      const second = selectMotion('idle', 12)
      if (second) {
        expect(second.id).not.toBe(first!.id)
      }
    })

    it('does not repeat the last motion', () => {
      const first = selectMotion('idle', 12)
      expect(first).not.toBeNull()
      playMotion(first!.id)

      // Clear the active motion so we can select again
      clearMotion()

      const second = selectMotion('idle', 12)
      // It should be a different motion
      if (second) {
        expect(second.id).not.toBe(first!.id)
      }
    })

    it('returns null when all motions are on cooldown or excluded', () => {
      // Play all idle motions to exhaust them
      for (let i = 0; i < 10; i++) {
        const m = selectMotion('idle', 12)
        if (!m) break
        playMotion(m.id)
        clearMotion()
      }
      // At this point, all idle motions should be on cooldown
      const result = selectMotion('idle', 12)
      expect(result).toBeNull()
    })
  })

  describe('playMotion', () => {
    it('returns a MotionState for a valid motion ID', () => {
      const state = playMotion('idle-look-around')
      expect(state).not.toBeNull()
      expect(state!.id).toBe('idle-look-around')
      expect(state!.bodyClass).toBe('look-around')
      expect(Array.isArray(state!.decorations)).toBe(true)
      expect(state!.startedAt).toBeLessThanOrEqual(Date.now())
    })

    it('returns null for an invalid motion ID', () => {
      // @ts-expect-error testing invalid id
      const state = playMotion('invalid-motion')
      expect(state).toBeNull()
    })

    it('makes isMotionActive return true', () => {
      expect(isMotionActive()).toBe(false)
      playMotion('idle-look-around')
      expect(isMotionActive()).toBe(true)
    })

    it('makes getActiveMotionId return the correct ID', () => {
      playMotion('idle-tail-swish')
      expect(getActiveMotionId()).toBe('idle-tail-swish')
    })
  })

  describe('clearMotion', () => {
    it('resets active motion to null', () => {
      playMotion('idle-look-around')
      expect(isMotionActive()).toBe(true)

      clearMotion()
      expect(isMotionActive()).toBe(false)
      expect(getActiveMotionId()).toBeNull()
    })
  })

  describe('requestMotion', () => {
    it('starts a motion when no motion is active', () => {
      expect(isMotionActive()).toBe(false)
      const started = requestMotion('idle-look-around', 'low')
      expect(started).toBe(true)
      expect(getActiveMotionId()).toBe('idle-look-around')
    })

    it('preempts a low priority motion with high priority', () => {
      requestMotion('idle-look-around', 'low')
      expect(getActiveMotionId()).toBe('idle-look-around')

      const started = requestMotion('self-proud', 'high')
      expect(started).toBe(true)
      expect(getActiveMotionId()).toBe('self-proud')
    })

    it('does not preempt a non-interruptible motion', () => {
      playMotion('sleep-curl')
      expect(getActiveMotionId()).toBe('sleep-curl')

      // sleep-curl is non-interruptible
      const started = requestMotion('self-proud', 'high')
      expect(started).toBe(false)
      expect(getActiveMotionId()).toBe('sleep-curl')
    })

    it('does not preempt a high priority motion with low priority', () => {
      requestMotion('self-proud', 'high')
      expect(getActiveMotionId()).toBe('self-proud')

      const started = requestMotion('idle-look-around', 'low')
      expect(started).toBe(false)
      expect(getActiveMotionId()).toBe('self-proud')
    })

    it('preempts equal priority when current is interruptible', () => {
      // Both are high priority and interruptible
      requestMotion('snack-nibble', 'high')
      expect(getActiveMotionId()).toBe('snack-nibble')

      const started = requestMotion('play-hop', 'high')
      expect(started).toBe(true)
      expect(getActiveMotionId()).toBe('play-hop')
    })

    it('returns false for invalid motion ID', () => {
      // @ts-expect-error testing invalid id
      const started = requestMotion('invalid', 'high')
      expect(started).toBe(false)
    })
  })

  describe('selectMotion with trigger', () => {
    it('prefers trigger-matched motions', () => {
      // Play and clear a motion so we can select again
      const result = selectMotion('idle', 12, 'tap')
      expect(result).not.toBeNull()
      expect(result!.trigger).toBe('tap')
    })
  })

  describe('idle motions available at different hours', () => {
    it('stretch-yawn is selectable at hour 14 with idle emotion', () => {
      // Force multiple selections at hour 14
      let foundStretch = false
      for (let i = 0; i < 30; i++) {
        destroyMotionEngine()
        initMotionEngine()
        const result = selectMotion('idle', 14)
        if (result?.id === 'stretch-yawn') {
          foundStretch = true
          break
        }
        // Clear cooldowns by destroying
      }
      expect(foundStretch).toBe(true)
    })
  })
})
