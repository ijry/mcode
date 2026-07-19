export type DetailTabMultitaskMode = "off" | "mobile" | "pc"

export const DETAIL_TAB_MULTITASK_MODE_KEY = "mcode_detail_tab_multitask_mode"

const VALID_MODES = new Set<DetailTabMultitaskMode>(["off", "mobile", "pc"])

export function normalizeDetailTabMultitaskMode(value: unknown): DetailTabMultitaskMode {
  return typeof value === "string" && VALID_MODES.has(value as DetailTabMultitaskMode)
    ? (value as DetailTabMultitaskMode)
    : "off"
}

export function readDetailTabMultitaskMode(): DetailTabMultitaskMode {
  const mode = normalizeDetailTabMultitaskMode(
    uni.getStorageSync(DETAIL_TAB_MULTITASK_MODE_KEY)
  )
  uni.setStorageSync(DETAIL_TAB_MULTITASK_MODE_KEY, mode)
  return mode
}

export function writeDetailTabMultitaskMode(mode: DetailTabMultitaskMode): DetailTabMultitaskMode {
  const normalized = normalizeDetailTabMultitaskMode(mode)
  uni.setStorageSync(DETAIL_TAB_MULTITASK_MODE_KEY, normalized)
  return normalized
}
