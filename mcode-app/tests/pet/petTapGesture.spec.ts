import {
  PET_DOUBLE_TAP_WINDOW_MS,
  shouldDelaySingleTapForDoubleTap,
  shouldTreatAsDoubleTap,
} from '@/services/petTapGesture'

describe('pet tap gesture helper', () => {
  it('detects double taps inside the configured window', () => {
    expect(shouldTreatAsDoubleTap(1000, 1000 + PET_DOUBLE_TAP_WINDOW_MS - 10)).toBe(true)
  })

  it('treats delayed taps as separate interactions', () => {
    expect(shouldTreatAsDoubleTap(1000, 1000 + PET_DOUBLE_TAP_WINDOW_MS + 10)).toBe(false)
  })

  it('does not delay H5 single taps so Web Speech stays user-gesture initiated', () => {
    expect(shouldDelaySingleTapForDoubleTap(true)).toBe(false)
  })

  it('keeps the single-tap delay outside H5 for double-tap detection', () => {
    expect(shouldDelaySingleTapForDoubleTap(false)).toBe(true)
  })
})
