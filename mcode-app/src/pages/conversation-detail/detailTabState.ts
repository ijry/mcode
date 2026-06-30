import type { DetailShellTabItem } from "./detailTabsPresentation"

export interface DetailTabState {
  tab: DetailShellTabItem
  draftText: string
  showPlanDrawer: boolean
  questionSubmitting: boolean
  permissionSubmitting: boolean
}

export function createDetailTabState(tab: DetailShellTabItem): DetailTabState {
  return {
    tab,
    draftText: "",
    showPlanDrawer: false,
    questionSubmitting: false,
    permissionSubmitting: false,
  }
}

export function isDetailTabMounted(windowIndexes: number[], index: number) {
  return Array.isArray(windowIndexes) && windowIndexes.includes(index)
}
