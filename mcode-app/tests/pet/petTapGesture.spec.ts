import { PET_DOUBLE_TAP_WINDOW_MS, shouldTreatAsDoubleTap } from '@/services/petTapGesture'

describe('pet tap gesture helper', () => {
  it('detects double taps inside the configured window', () => {
    expect(shouldTreatAsDoubleTap(1000, 1000 + PET_DOUBLE_TAP_WINDOW_MS - 10)).toBe(true)
  })

  it('treats delayed taps as separate interactions', () => {
    expect(shouldTreatAsDoubleTap(1000, 1000 + PET_DOUBLE_TAP_WINDOW_MS + 10)).toBe(false)
  })
})
