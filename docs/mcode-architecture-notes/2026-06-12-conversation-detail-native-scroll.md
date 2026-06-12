# Conversation Detail Native Scroll

The `mcode-app` conversation detail page now uses page-level native scrolling for the main message timeline instead of an internal `scroll-view`. This avoids viewport-height inconsistencies in iOS home-screen fullscreen mode and keeps the fixed composer visible across platforms that do not support `dvh`.

## Layout Strategy

1. The main message list is a normal block container, not a nested scroll container.
2. The page measures three cross-platform heights with `uni-app` APIs and selector queries:
   - native navbar height
   - top in-page chrome height (`detail-toolbar`, shared-live hint, history row)
   - bottom composer height (`input-wrap`)
3. Those measurements are converted into `padding-top`, `padding-bottom`, and `min-height` for the message list so browser/native page scrolling respects the fixed top and bottom chrome.

## Scroll State

Existing conversation runtime persistence still stores:

1. `scrollTop`
2. `anchorMessageId`
3. `nearBottom`

The restore path now uses `uni.pageScrollTo` instead of `scroll-view` properties. Auto-follow, unread-below behavior, older-history loading, and scroll-to-bottom FAB state are all derived from `onPageScroll`.

## Why This Change

`scroll-view` height tied to viewport math behaved differently between:

1. normal browser mode
2. iOS added-to-home-screen fullscreen mode

Using page-native scrolling removes that nested viewport dependency and lets the detail page rely on the host browser/webview's own scroll model.
