export const PET_DOUBLE_TAP_WINDOW_MS = 260
export const PET_SINGLE_TAP_DELAY_MS = 220
export const PET_TAP_INTERACTION_DURATION_MS = 320
export const PET_EXCITED_INTERACTION_DURATION_MS = 460

export function shouldTreatAsDoubleTap(
  lastTapAt: number,
  nextTapAt: number,
  windowMs = PET_DOUBLE_TAP_WINDOW_MS,
): boolean {
  return lastTapAt > 0 && nextTapAt - lastTapAt <= windowMs
}
