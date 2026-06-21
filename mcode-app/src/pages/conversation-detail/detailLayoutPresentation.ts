export function buildMessageListPageStyle(input: {
  viewportHeight: number
  topChromeHeight: number
  bottomComposerHeight: number
}) {
  const minHeight = Math.max(
    0,
    Number(input.viewportHeight || 0)
      - Number(input.topChromeHeight || 0)
      - Number(input.bottomComposerHeight || 0)
  )
  if (
    Number(input.topChromeHeight || 0) <= 0
    && Number(input.bottomComposerHeight || 0) <= 0
    && minHeight <= 0
  ) {
    return undefined
  }
  return {
    paddingTop: `${Math.max(0, Number(input.topChromeHeight || 0))}px`,
    paddingBottom: `${Math.max(0, Number(input.bottomComposerHeight || 0))}px`,
    minHeight: `${minHeight}px`,
  }
}

export function buildTopOffsetStyle(topOffsetPx: number) {
  return {
    top: `${Math.max(0, Number(topOffsetPx || 0))}px`,
  }
}

export function buildHistoryStatusStyle(input: {
  navbarHeight: number
  toolbarHeight: number
}) {
  return buildTopOffsetStyle(
    Math.max(0, Number(input.navbarHeight || 0)) + Math.max(0, Number(input.toolbarHeight || 0))
  )
}
