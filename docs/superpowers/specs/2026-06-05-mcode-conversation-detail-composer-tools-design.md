# MCode Conversation Detail Composer Tools Design

## Goal

Replace the conversation detail `+` action in `mcode-app` with an inline tools panel that expands below the composer, so users can access attachment upload, todo insertion, model selection, reasoning strength switching, and permission profile switching without leaving the detail page.

## Problem

The current conversation detail composer uses the `+` button as an attachment action trigger only. This is too narrow for the real send flow because users also need a place to inspect and adjust session runtime options before sending a message.

At the same time, the detail page already has some related capabilities:

- attachment upload helpers
- local todo storage
- ACP session mode and config option APIs
- a half-wired model picker shell

But these capabilities are fragmented and do not form one coherent send-adjacent interaction area.

## User Outcomes

After this change:

1. Tapping `+` opens an inline panel below the input box instead of a transient action menu.
2. The panel separates execution actions from session configuration.
3. Attachment upload and todo insertion complete quickly and auto-close the panel.
4. Model, reasoning strength, and permission profile remain visible as current session config and can be changed in place without auto-closing the panel.
5. Session config options come from the connected remote agent dynamically instead of hardcoded local enums.

## Non-Goals

1. Redesigning the existing pending permission approval card.
2. Writing session config changes into the message timeline.
3. Adding backend ACP endpoints or changing ACP payload shapes.
4. Persisting composer config state into a cross-page offline cache in the first version.
5. Editing arbitrary remote config groups beyond the three user-visible categories in scope here.

## Existing Capabilities To Reuse

The feature should reuse existing detail-page and ACP capabilities instead of introducing a new protocol:

- `chooseImages`
- `chooseFiles`
- `uploadPickedFiles`
- `attachments`
- local todo storage under `mcode_todos`
- `acp_describe_agent_options`
- `acp_set_mode`
- `acp_set_config_option`

The create-conversation page already contains the right remote-config pattern:

- dynamic probe of agent options
- `selectedModeId`
- `selectedValues`
- chip-style single-select rendering

The detail page should reuse this mental model and only adapt it to an inline collapsed composer panel.

## Recommended Approach

Use one inline composer tools panel with two sections:

1. quick actions
2. session config

This is the recommended approach because:

- it keeps all send-adjacent actions near the composer
- it avoids overlay menus that hide current state
- it makes current runtime config visible before the user sends a message
- it matches the approved mixed-collapse behavior:
  - execution actions auto-close the panel
  - config edits keep the panel open

Alternatives considered:

1. Pure entry list where every item opens a secondary picker
- Rejected because config inspection becomes too indirect and too click-heavy.

2. Fully expanded config card with all options always visible
- Rejected because it would make the mobile composer area too tall and unstable.

3. Keep `+` as attachment-only and add config elsewhere
- Rejected because it splits one send workflow into multiple unrelated entry points.

## UX Design

### Composer Stack Order

Inside the existing composer area, preserve this vertical order:

1. pending permission card
2. composer tools panel
3. upload queue
4. attachment preview
5. queued drafts bar and panel
6. input row

This keeps pending authorization requests at the highest priority while still making the tools panel part of the composer system rather than a floating overlay.

### Plus Button Behavior

The `+` button changes from a one-shot action trigger into a panel toggle:

1. Tap once to expand the tools panel.
2. Tap again to collapse it.
3. Expanding the panel does not cover the message list with a popup.
4. Sending a message does not forcibly collapse the panel.

### Panel Sections

The panel contains two groups.

#### Quick Actions

- `附件上传`
- `从待办选择获取任务`

#### Session Config

- `模型`
- `推理强度`
- `授权类型`

### Mixed Collapse Rules

Approved interaction behavior:

1. `附件上传` executes and then closes the whole panel.
2. `从待办选择获取任务` fills the input and then closes the whole panel.
3. `模型`
4. `推理强度`
5. `授权类型`

Items 3 through 5 do not close the whole panel when changed.

### Config Row Behavior

Each config category is rendered as a summary row:

- label
- current value
- expand arrow

Examples:

- `模型  GPT-5.4`
- `推理强度  high`
- `授权类型  ask`

Only one config category can be expanded at a time. Expanding one category collapses the others.

When expanded, the row reveals a chip-style single-choice list under that row only.

### Attachment Upload Behavior

The quick action entry for `附件上传` expands one lightweight second-level action strip:

- `图片`
- `文件`

Choosing either action uses the existing detail page upload helpers and then collapses the full tools panel once file selection has been kicked off successfully.

### Todo Insertion Behavior

`从待办选择获取任务` opens a bottom sheet listing local incomplete todos only.

When the user taps a todo:

1. append or insert the todo text into the current composer input
2. close the todo sheet
3. close the tools panel

The todo action does not create or complete todos from this page in v1. It only imports task text into the current composer.

## Data Model In MCode

Keep the first version local to the conversation detail page. Do not add a new global store yet.

Suggested local state:

```ts
type ComposerConfigKey = "model" | "reasoning" | "permission" | ""

interface DetailAgentConfigState {
  status: "idle" | "loading" | "ready" | "failed"
  modes: SessionModeStateInfo | null
  configOptions: SessionConfigOptionInfo[]
  selectedModeId: string | null
  selectedValues: Record<string, string>
}
```

Additional local refs:

- `showComposerTools: boolean`
- `expandedConfigKey: ComposerConfigKey`
- `showTodoPicker: boolean`
- `showAttachmentKinds: boolean`

This state is page-local and resets naturally when the detail page is destroyed.

## Remote Data And Option Mapping

### Dynamic Config Source

The detail page must not hardcode agent-specific option enums. It should read the current remote agent capability snapshot through `acp_describe_agent_options`.

### Category Mapping Rules

The UI exposes exactly three config categories, but the remote payload is generic. The detail page therefore maps generic ACP options into these user-facing categories:

1. `模型`
- source: `modes.available_modes`

2. `推理强度`
- source: first matching `config_option` whose identity or label suggests `reasoning`, `thinking`, or `effort`

3. `授权类型`
- source: first matching `config_option` whose identity or label suggests `permission`, `approval`, `sandbox`, or similar approval-profile semantics

Matching should consider stable option identifiers first and display labels second.

### Missing Category Behavior

If a category is not present in the remote payload:

1. show the row
2. display `远端未提供`
3. disable expansion for that row

This keeps the layout stable while making capability gaps explicit.

## Load Flow

Probe agent config when the detail page has enough context to identify the current remote agent and working directory.

Recommended trigger points:

1. after initial detail hydration resolves `currentAgentType`
2. after connection reuse or reconnect restores the active runtime context
3. whenever the effective agent type or working directory changes

The request should be bound to the latest page context so stale async responses cannot overwrite a newer detail state.

### Default Selection Projection

When the probe succeeds:

1. set `selectedModeId` from `modes.current_mode_id` when available
2. set `selectedValues` from each option's current or default remote value
3. retain still-valid local selections when reloading the same semantic option set
4. drop invalid local selections if the remote schema changed

## Apply Flow

### When A Live ACP Connection Exists

If `session.connectionId` exists:

1. selecting a model calls `acp_set_mode`
2. selecting reasoning strength calls `acp_set_config_option`
3. selecting permission profile calls `acp_set_config_option`

Update local selected state only after the remote call succeeds.

### When No Live ACP Connection Exists Yet

If the detail page does not currently have a usable ACP connection:

1. accept the local UI selection
2. store it in page-local config state
3. apply it later when the first live connection is established

This ensures empty or not-yet-reactivated conversations can still be prepared before the next send.

### Deferred Apply Semantics

When the detail page later establishes or reuses a live ACP connection:

1. pass `selectedModeId` as the preferred mode when that path is available
2. replay each selected config option through `acp_set_config_option`

This mirrors the already-approved create-conversation agent config flow.

## Error Handling

### Config Probe Failure

If `acp_describe_agent_options` fails:

1. keep the tools panel usable for attachment and todo actions
2. show a compact config warning state
3. render config rows as unavailable
4. do not block sending

### Config Apply Failure

If `acp_set_mode` or `acp_set_config_option` fails:

1. show a toast
2. keep the panel open
3. keep the previous selected value in the summary row
4. do not silently switch the UI to an unconfirmed value

### Todo Load Failure

If local todo parsing fails or returns invalid data:

1. show an empty-state sheet
2. do not crash the detail page

### Attachment Entry Failure

If the platform does not support the chosen file path:

1. preserve the existing upload error toast behavior
2. do not change panel state except in the success path

## Implementation Scope

Primary file:

- `mcode-app/src/pages/conversation-detail/index.vue`

Possible supporting type reuse:

- `mcode-app/src/types/acp.ts`

The first version should avoid extracting new shared components unless the detail page becomes materially harder to maintain after the panel is added.

## Testing

Run a targeted TypeScript check for `mcode-app` with `vue-tsc --noEmit`.

Manual verification should confirm:

1. The `+` button toggles an inline panel below the composer instead of opening the old attachment action path.
2. `附件上传` still supports image and file upload using the existing upload queue and attachment preview.
3. `从待办选择获取任务` imports one local incomplete todo into the composer and closes the panel.
4. Only one config category expands at a time.
5. Model, reasoning strength, and permission profile render from remote agent options when available.
6. Changing a config with a live connection applies immediately and keeps the panel open.
7. Missing remote config categories render as unavailable instead of disappearing.
8. Config probe failure does not block attachment upload, todo insertion, or sending.
