import { pickBubbleText } from '@/services/petConfig'

describe('pet unit-test harness', () => {
  it('resolves src aliases inside jest', () => {
    expect(typeof pickBubbleText('pet_interact')).toBe('string')
  })
})
