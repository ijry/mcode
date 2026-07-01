import type { DetailShellTabItem } from "./detailTabsPresentation"
import type { QueuedDraft, UploadedAttachment } from "./detailDataNormalization"
import type { HistoryPageCursor } from "./detailScrollState"

export interface DetailTabState {
  tab: DetailShellTabItem
  draftText: string
  attachments: UploadedAttachment[]
  draftQueue: QueuedDraft[]
  queueExpanded: boolean
  toolRowExpanded: boolean
  composerPanelMode: string
  expandedConfigKey: string
  askQuestionSelectionsJson: string
  pageScrollTop: number
  lastMeasuredScrollTop: number
  anchorMessageId: string
  shouldAutoFollowBottom: boolean
  hasUnreadBelow: boolean
  hasMoreHistory: boolean
  oldestLoadedCursor: HistoryPageCursor | null
  showPlanDrawer: boolean
  questionSubmitting: boolean
  permissionSubmitting: boolean
}

export function createDetailTabState(tab: DetailShellTabItem): DetailTabState {
  return {
    tab,
    draftText: "",
    attachments: [],
    draftQueue: [],
    queueExpanded: false,
    toolRowExpanded: false,
    composerPanelMode: "",
    expandedConfigKey: "",
    askQuestionSelectionsJson: "{}",
    pageScrollTop: 0,
    lastMeasuredScrollTop: 0,
    anchorMessageId: "",
    shouldAutoFollowBottom: true,
    hasUnreadBelow: false,
    hasMoreHistory: false,
    oldestLoadedCursor: null,
    showPlanDrawer: false,
    questionSubmitting: false,
    permissionSubmitting: false,
  }
}
