import type { DetailShellTabItem } from "./detailTabsPresentation"

/**
 * 每个详情页 tab 的本地 UI 状态（切 tab 时保存 / 恢复）。
 *
 * **这里只放详情页自己拥有的状态。** 草稿（`draftText` / `attachments` / `draftQueue` /
 * `queueExpanded`）和 composer UI（`toolRowExpanded` / `composerPanelMode` /
 * `expandedConfigKey`）已随输入框迁到 `ConversationDetailInteractivePane.vue`：
 *
 * - 草稿改为**按会话落 SQLite**（`conversation_runtime` 表），不再靠切 tab 的内存快照
 *   —— pane 是销毁式挂载（±1 窗口），内存快照撑不过跨窗口切换。
 * - composer UI 状态（工具行展开、面板模式）是纯瞬态，pane 重新挂载时回到默认即可。
 *
 * 留在这里的 8 个字段都不是为 composer 存在的：问题作答、滚动位置、抽屉与提交中标记。
 */
export interface DetailTabState {
  tab: DetailShellTabItem
  askQuestionSelectionsJson: string
  pageScrollTop: number
  lastMeasuredScrollTop: number
  anchorMessageId: string
  shouldAutoFollowBottom: boolean
  hasUnreadBelow: boolean
  showPlanDrawer: boolean
  questionSubmitting: boolean
  permissionSubmitting: boolean
}

export function createDetailTabState(tab: DetailShellTabItem): DetailTabState {
  return {
    tab,
    askQuestionSelectionsJson: "{}",
    pageScrollTop: 0,
    lastMeasuredScrollTop: 0,
    anchorMessageId: "",
    shouldAutoFollowBottom: true,
    hasUnreadBelow: false,
    showPlanDrawer: false,
    questionSubmitting: false,
    permissionSubmitting: false,
  }
}
