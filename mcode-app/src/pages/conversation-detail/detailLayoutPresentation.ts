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

export function resolveDetailShellViewportHeight(input: {
  windowHeight: number
  navbarHeight: number
  hasNavbarPlaceholder?: boolean
}) {
  const windowHeight = Math.max(0, Number(input.windowHeight || 0))
  const navbarHeight = Math.max(0, Number(input.navbarHeight || 0))
  if (input.hasNavbarPlaceholder === true) {
    return Math.max(0, windowHeight - navbarHeight)
  }
  return windowHeight
}

export function resolveBottomComposerHeight(input: {
  composerStackHeight?: number | null
  inputStatusHeight?: number | null
  inputMainHeight?: number | null
  inputToolHeight?: number | null
  bottomOffset?: number | null
  fallbackGap?: number | null
}) {
  const composerStackHeight = Math.max(0, Number(input.composerStackHeight || 0))
  const bottomOffset = Math.max(0, Number(input.bottomOffset ?? 6))
  if (composerStackHeight > 0) return composerStackHeight + bottomOffset

  return (
    Math.max(0, Number(input.inputStatusHeight || 0)) +
    Math.max(0, Number(input.inputMainHeight || 0)) +
    Math.max(0, Number(input.inputToolHeight || 0)) +
    Math.max(0, Number(input.fallbackGap ?? 36))
  )
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
