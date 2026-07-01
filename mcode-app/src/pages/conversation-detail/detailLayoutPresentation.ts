export function buildMessageListPageStyle(input: {
  viewportHeight: number
  topChromeHeight: number
  bottomComposerHeight: number
}) {
  const topChromeHeight = Math.max(0, Number(input.topChromeHeight || 0))
  const bottomComposerHeight = Math.max(0, Number(input.bottomComposerHeight || 0))
  const viewportBodyHeight = Math.max(0, Number(input.viewportHeight || 0) - topChromeHeight)
  if (
    topChromeHeight <= 0
    && bottomComposerHeight <= 0
    && viewportBodyHeight <= 0
  ) {
    return undefined
  }
  return {
    marginTop: `${topChromeHeight}px`,
    height: `${viewportBodyHeight}px`,
  }
}

export function buildMessageListContentStyle(bottomComposerHeightPx: number) {
  const bottomComposerHeight = Math.max(0, Number(bottomComposerHeightPx || 0))
  if (bottomComposerHeight <= 0) return undefined
  return {
    paddingBottom: `${bottomComposerHeight}px`,
  }
}

export function buildTopOffsetStyle(topOffsetPx: number) {
  return {
    top: `${Math.max(0, Number(topOffsetPx || 0))}px`,
  }
}

export function buildHistoryStatusStyle(input: {
  navbarHeight: number
  tabsBarHeight?: number
  toolbarHeight: number
}) {
  return buildTopOffsetStyle(
    Math.max(0, Number(input.navbarHeight || 0))
    + Math.max(0, Number(input.tabsBarHeight || 0))
    + Math.max(0, Number(input.toolbarHeight || 0))
  )
}
