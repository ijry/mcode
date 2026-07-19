# Settings Entry And Detail Tab Multitask Modes

## Scope

This change moves mobile conversation preferences out of the profile page into a
dedicated `pages/settings/index` page. The profile page now exposes a single
settings navigation row. The settings page owns:

- conversation list live-stream preview;
- conversation-detail TAB multitask mode.

## Detail TAB Modes

`mcode-app` stores the selected detail TAB behavior in
`mcode_detail_tab_multitask_mode`. Valid values are:

- `off`: default. Detail renders only the current conversation and does not read
  or write remote `opened_tabs`.
- `mobile`: mobile-owned tabs. Detail reads and writes
  `mcode_mobile_detail_tabs:<remoteInstanceKey>` in local storage. Switching and
  closing tabs affect only the phone.
- `pc`: PC-synced tabs. Detail keeps the existing `list_opened_tabs`,
  `save_opened_tabs`, opened-tabs broadcast, and prompt-time ensure-tab behavior.

Unknown stored values normalize back to `off`.

## Data Flow

On detail entry and return from settings, the page reads
`readDetailTabMultitaskMode()` before hydrating the tab shell.

In `off` mode, the tab source is a synthetic single-item list built from the
route conversation. The tab bar is hidden and top chrome height uses zero tab
height.

In `mobile` mode, `ensureMobileDetailTab()` adds the route conversation to the
local mobile tab list for the current remote instance. `activateMobileDetailTab`
and `closeMobileDetailTab` update the same local list. No gateway tab commands
are called.

In `pc` mode, the existing remote opened-tabs flow remains the source of truth.
The page subscribes to opened-tabs broadcasts, reads `list_opened_tabs`, and
only writes `save_opened_tabs` through the existing PC tab sync service.

## Compatibility

No ACP protocol, SQLite schema, or backend command changes are required. Older
clients that do not implement this preference continue to behave like their
existing default. This mobile client defaults to `off`, so PC tab state is no
longer touched unless the user explicitly selects "同步 PC 端".

## Native iOS/Android Guidance

Native clients should expose the same three values and default to `off`. Use a
per-remote-instance local tab store for `mobile`; do not mix it with PC
`opened_tabs`. Only `pc` mode should call the remote opened-tabs APIs or apply
remote opened-tabs broadcasts to the visible detail tab shell.
