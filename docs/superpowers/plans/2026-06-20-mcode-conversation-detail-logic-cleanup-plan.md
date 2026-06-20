# MCode Conversation Detail Logic Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract deterministic conversation-detail presentation and normalization logic from the 5956-line Vue page into focused, tested TypeScript modules without changing runtime behavior.

**Architecture:** Keep `conversation-detail/index.vue` as the owner of lifecycle hooks, refs, API calls, store writes, timers, layout measurement, and `uni` side effects. Move pure transformations into sibling modules under `src/pages/conversation-detail/`, and cover each module with Jest tests before wiring the page to imports.

**Tech Stack:** Vue 3 script setup, uni-app, TypeScript, Jest, uview-plus.

## Global Constraints

- Preserve current UI, routing, API calls, runtime lifecycle, realtime behavior, local cache behavior, dark-mode styling, and mobile/native compatibility.
- Do not split Vue template sections into child components in this phase.
- Do not change page layout, text, styling, theme variables, or `uview-plus` prop bindings.
- Do not change ACP, realtime, opened-tab sync, SQLite persistence, or runtime store protocols.
- Do not change send queue semantics, optimistic message behavior, permission behavior, ask-question behavior, or scroll behavior.
- Do not remove `mcode-app/src/pages/session-detail/index.vue` in this phase.
- Keep helpers deterministic and side-effect free: no gateways, repositories, stores, timers, `uni`, or DOM/layout measurement inside extracted modules.
- Every mcode change must add or update a Markdown note under `docs/mcode-architecture-notes/`.

---

## File Structure

- Create: `mcode-app/src/pages/conversation-detail/detailMessagePresentation.ts`
  - Owns render-item building for adjacent assistant-message merge.
- Create: `mcode-app/src/pages/conversation-detail/detailDataNormalization.ts`
  - Owns generic string/object helpers, backend turn/content normalization, agent type normalization, persisted draft and attachment recovery helpers.
- Create: `mcode-app/src/pages/conversation-detail/detailInteractionPresentation.ts`
  - Owns permission description splitting and ask-question answer shaping.
- Create: `mcode-app/src/pages/conversation-detail/detailPlanPresentation.ts`
  - Owns plan/task extraction, task status normalization, labels, and filter item counts.
- Modify: `mcode-app/src/pages/conversation-detail/index.vue`
  - Import the extracted helpers, remove duplicated inline helpers and moved page-local interfaces, keep stateful page code in place.
- Create: `mcode-app/tests/pages/conversation-detail/detailMessagePresentation.spec.ts`
- Create: `mcode-app/tests/pages/conversation-detail/detailDataNormalization.spec.ts`
- Create: `mcode-app/tests/pages/conversation-detail/detailInteractionPresentation.spec.ts`
- Create: `mcode-app/tests/pages/conversation-detail/detailPlanPresentation.spec.ts`
- Create: `docs/mcode-architecture-notes/2026-06-20-conversation-detail-logic-cleanup.md`

---

### Task 1: Message Render Presentation

**Files:**
- Create: `mcode-app/src/pages/conversation-detail/detailMessagePresentation.ts`
- Create: `mcode-app/tests/pages/conversation-detail/detailMessagePresentation.spec.ts`

**Interfaces:**
- Consumes: `MessageTurn` and `ContentPart` from `@/types/acp`.
- Produces:
  - `RenderMessageItem`
  - `buildRenderMessageItems(messages: MessageTurn[]): RenderMessageItem[]`

- [ ] **Step 1: Write the failing test**

Create `mcode-app/tests/pages/conversation-detail/detailMessagePresentation.spec.ts`:

```ts
import { buildRenderMessageItems } from "@/pages/conversation-detail/detailMessagePresentation"
import type { MessageTurn } from "@/types/acp"

const turn = (overrides: Partial<MessageTurn>): MessageTurn => ({
  id: "turn",
  role: "assistant",
  content: [],
  timestamp: 1000,
  ...overrides,
})

describe("detailMessagePresentation", () => {
  it("keeps a single assistant turn unmerged", () => {
    const items = buildRenderMessageItems([
      turn({ id: "a1", role: "assistant", content: [{ type: "text", text: "one" }] }),
    ])

    expect(items).toEqual([
      {
        key: "a1",
        anchorId: "a1",
        sourceIds: ["a1"],
        message: expect.objectContaining({
          id: "a1",
          content: [{ type: "text", text: "one" }],
        }),
      },
    ])
  })

  it("merges only adjacent assistant runs and anchors them to the last assistant turn", () => {
    const items = buildRenderMessageItems([
      turn({ id: "u1", role: "user", content: [{ type: "text", text: "ask" }] }),
      turn({ id: "a1", role: "assistant", content: [{ type: "text", text: "first" }], timestamp: 10 }),
      turn({ id: "a2", role: "assistant", content: [{ type: "thinking", thinking: "second" }], timestamp: 20 }),
      turn({ id: "u2", role: "user", content: [{ type: "text", text: "next" }], timestamp: 30 }),
    ])

    expect(items.map((item) => item.key)).toEqual(["u1", "merged-a1-a2", "u2"])
    expect(items[1]).toEqual({
      key: "merged-a1-a2",
      anchorId: "a2",
      sourceIds: ["a1", "a2"],
      message: expect.objectContaining({
        id: "a2",
        role: "assistant",
        timestamp: 20,
        content: [
          { type: "text", text: "first" },
          { type: "thinking", thinking: "second" },
        ],
      }),
    })
  })

  it("clones merged content so caller mutations do not mutate source turns", () => {
    const messages = [
      turn({ id: "a1", content: [{ type: "text", text: "first" }] }),
      turn({ id: "a2", content: [{ type: "text", text: "second" }] }),
    ]

    const items = buildRenderMessageItems(messages)
    items[0].message.content[0].text = "changed"

    expect(messages[0].content[0].text).toBe("first")
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
cd mcode-app
pnpm test:unit -- --runTestsByPath tests/pages/conversation-detail/detailMessagePresentation.spec.ts
```

Expected: FAIL because `detailMessagePresentation.ts` does not exist.

- [ ] **Step 3: Add the message presentation module**

Create `mcode-app/src/pages/conversation-detail/detailMessagePresentation.ts`:

```ts
import type { ContentPart, MessageTurn } from "@/types/acp"

export interface RenderMessageItem {
  key: string
  anchorId: string
  sourceIds: string[]
  message: MessageTurn
}

function cloneContentParts(parts: ContentPart[]): ContentPart[] {
  return JSON.parse(JSON.stringify(parts || [])) as ContentPart[]
}

export function buildRenderMessageItems(messages: MessageTurn[]): RenderMessageItem[] {
  if (!Array.isArray(messages) || messages.length === 0) return []

  const result: RenderMessageItem[] = []
  let assistantBuffer: MessageTurn[] = []

  const pushBufferedAssistantMessages = () => {
    if (assistantBuffer.length === 0) return

    if (assistantBuffer.length === 1) {
      const single = assistantBuffer[0]
      result.push({
        key: single.id,
        anchorId: single.id,
        sourceIds: [single.id],
        message: single,
      })
      assistantBuffer = []
      return
    }

    const first = assistantBuffer[0]
    const last = assistantBuffer[assistantBuffer.length - 1]
    result.push({
      key: `merged-${first.id}-${last.id}`,
      anchorId: last.id,
      sourceIds: assistantBuffer.map((item) => item.id),
      message: {
        ...last,
        id: last.id,
        content: assistantBuffer.flatMap((item) => cloneContentParts(item.content || [])),
        timestamp: last.timestamp,
      },
    })
    assistantBuffer = []
  }

  for (const message of messages) {
    if (message.role === "assistant") {
      assistantBuffer.push(message)
      continue
    }

    pushBufferedAssistantMessages()
    result.push({
      key: message.id,
      anchorId: message.id,
      sourceIds: [message.id],
      message,
    })
  }

  pushBufferedAssistantMessages()
  return result
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run:

```bash
cd mcode-app
pnpm test:unit -- --runTestsByPath tests/pages/conversation-detail/detailMessagePresentation.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add mcode-app/src/pages/conversation-detail/detailMessagePresentation.ts mcode-app/tests/pages/conversation-detail/detailMessagePresentation.spec.ts
git commit -m "refactor: extract detail message presentation"
```

---

### Task 2: Data Normalization Helpers

**Files:**
- Create: `mcode-app/src/pages/conversation-detail/detailDataNormalization.ts`
- Create: `mcode-app/tests/pages/conversation-detail/detailDataNormalization.spec.ts`

**Interfaces:**
- Consumes: `ContentPart`, `MessageTurn` from `@/types/acp`.
- Produces:
  - `UploadedAttachment`, `QueuedDraft`, `ConversationDraftSnapshot`, `RestoredIdFactory`
  - `firstString(...values: unknown[]): string | undefined`
  - `toObject(raw: unknown): Record<string, any> | null`
  - `safeParseArray(value?: string | null): any[]`
  - `normalizeList(input: unknown): any[]`
  - `normalizeTurns(rawTurns: unknown): MessageTurn[]`
  - `normalizeContentParts(rawContent: unknown, rawBlocks?: unknown): ContentPart[]`
  - `getTurnContentParts(turn: unknown): ContentPart[]`
  - `normalizeAgentType(raw?: string): string`
  - `normalizeAttachments(source: unknown, createId: RestoredIdFactory): UploadedAttachment[]`
  - `normalizeDraftQueue(source: unknown, createId: RestoredIdFactory): QueuedDraft[]`
  - `cloneAttachments(source: UploadedAttachment[]): UploadedAttachment[]`
  - `cloneDraftQueue(source: QueuedDraft[]): QueuedDraft[]`

- [ ] **Step 1: Write the failing test**

Create `mcode-app/tests/pages/conversation-detail/detailDataNormalization.spec.ts`:

```ts
import {
  cloneDraftQueue,
  firstString,
  getTurnContentParts,
  normalizeAgentType,
  normalizeAttachments,
  normalizeContentParts,
  normalizeDraftQueue,
  normalizeList,
  normalizeTurns,
  safeParseArray,
  toObject,
} from "@/pages/conversation-detail/detailDataNormalization"

const createId = (prefix: string) => `${prefix}-stable`

describe("detailDataNormalization", () => {
  beforeEach(() => {
    jest.spyOn(Date, "now").mockReturnValue(1700000000000)
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it("extracts first non-empty string and parses objects defensively", () => {
    expect(firstString("", "  ok  ", "later")).toBe("ok")
    expect(firstString(null, 1, {})).toBeUndefined()
    expect(toObject('{"a":1}')).toEqual({ a: 1 })
    expect(toObject("not-json")).toBeNull()
    expect(safeParseArray("[1,2]")).toEqual([1, 2])
    expect(safeParseArray('{"no":true}')).toEqual([])
    expect(normalizeList("x")).toEqual([])
  })

  it("normalizes backend turns and content parts", () => {
    const turns = normalizeTurns([
      {
        id: "u1",
        role: "user",
        content: "hello",
        timestamp: "2026-06-20T00:00:00.000Z",
      },
      {
        role: "assistant",
        blocks: [
          { type: "text", text: "answer" },
          { type: "tool_use", tool_use_id: "tool-1", tool_name: "TaskList", input_preview: '{"x":1}' },
          { type: "tool_result", tool_use_id: "tool-1", output_preview: "done" },
        ],
      },
    ])

    expect(turns[0]).toEqual(expect.objectContaining({
      id: "u1",
      role: "user",
      content: [{ type: "text", text: "hello" }],
    }))
    expect(turns[1].id).toBe("turn-1-1700000000000")
    expect(turns[1].content).toEqual([
      { type: "text", text: "answer" },
      {
        type: "tool_call",
        tool_call: {
          id: "tool-1",
          name: "TaskList",
          input: { x: 1 },
          output: "done",
          status: "completed",
          error: undefined,
        },
      },
    ])
  })

  it("normalizes typed content parts and turn content fallback", () => {
    expect(normalizeContentParts([
      { type: "thinking", thinking: "think" },
      { type: "image", image: { url: "https://img", alt: "alt" } },
      { type: "plan", plan: { steps: [{ title: "ship" }, { description: "" }] } },
      "plain",
    ])).toEqual([
      { type: "thinking", thinking: "think" },
      { type: "image", image: { url: "https://img", alt: "alt" } },
      { type: "plan", plan: { steps: [{ description: "ship", completed: false }], status: undefined } },
      { type: "text", text: "plain" },
    ])

    expect(getTurnContentParts({ blocks: [{ type: "image", uri: "file://a.png" }] })).toEqual([
      { type: "image", image: { url: "file://a.png", alt: "image" } },
    ])
  })

  it("normalizes agent aliases", () => {
    expect(normalizeAgentType("claudecode")).toBe("claude_code")
    expect(normalizeAgentType("codex_cli")).toBe("codex")
    expect(normalizeAgentType("gemini_cli")).toBe("gemini")
    expect(normalizeAgentType("opencode")).toBe("open_code")
    expect(normalizeAgentType("openclaw")).toBe("open_claw")
    expect(normalizeAgentType("")).toBe("claude_code")
  })

  it("normalizes attachments and drafts with an explicit restored id factory", () => {
    const attachments = normalizeAttachments([
      { kind: "image", url: "https://image", name: "image.png", size: 5, type: "image/png" },
      { kind: "file", url: "https://file", id: "file-1" },
      { kind: "file" },
    ], createId)

    expect(attachments).toEqual([
      {
        id: "att-restored-0-stable",
        url: "https://image",
        name: "image.png",
        size: 5,
        type: "image/png",
        kind: "image",
      },
      {
        id: "file-1",
        url: "https://file",
        name: "",
        size: 0,
        type: "application/octet-stream",
        kind: "file",
      },
    ])

    const drafts = normalizeDraftQueue([
      { text: "queued", status: "sending", attachments, createdAt: 123 },
      { text: "failed", status: "failed", error: "bad", attachments: [] },
    ], createId)

    expect(drafts[0]).toEqual(expect.objectContaining({
      id: "draft-restored-0-stable",
      text: "queued",
      status: "pending",
      attachments,
      createdAt: 123,
    }))
    expect(drafts[1]).toEqual(expect.objectContaining({
      status: "failed",
      error: "bad",
    }))

    const cloned = cloneDraftQueue(drafts)
    cloned[0].attachments[0].name = "changed"
    expect(drafts[0].attachments[0].name).toBe("image.png")
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
cd mcode-app
pnpm test:unit -- --runTestsByPath tests/pages/conversation-detail/detailDataNormalization.spec.ts
```

Expected: FAIL because `detailDataNormalization.ts` does not exist.

- [ ] **Step 3: Add the data normalization module**

Create `mcode-app/src/pages/conversation-detail/detailDataNormalization.ts` with the exact helpers currently embedded in the page. Use explicit restored id factories for draft and attachment fallback ids:

```ts
import type { ContentPart, MessageTurn } from "@/types/acp"

export interface UploadedAttachment {
  id: string
  url: string
  name: string
  size: number
  type: string
  kind: "image" | "file"
}

export interface QueuedDraft {
  id: string
  text: string
  attachments: UploadedAttachment[]
  createdAt: number
  status: "pending" | "sending" | "failed"
  error?: string
}

export interface ConversationDraftSnapshot {
  composerText: string
  draftQueue: QueuedDraft[]
  attachments: UploadedAttachment[]
  queueExpanded: boolean
}

export type RestoredIdFactory = (prefix: string) => string

export function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim()
  }
  return undefined
}

export function toObject(raw: unknown): Record<string, any> | null {
  if (!raw) return null
  if (typeof raw === "object") return raw as Record<string, any>
  if (typeof raw !== "string") return null

  const text = raw.trim()
  if (!text) return null

  try {
    const parsed = JSON.parse(text)
    if (parsed && typeof parsed === "object") return parsed as Record<string, any>
    return null
  } catch {
    return null
  }
}

export function safeParseArray(value?: string | null) {
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function normalizeList(input: unknown): any[] {
  return Array.isArray(input) ? input : []
}

export function normalizeTurns(rawTurns: unknown): MessageTurn[] {
  if (!Array.isArray(rawTurns)) return []
  return rawTurns.map((raw, index) => normalizeTurn(raw, index)).filter(Boolean) as MessageTurn[]
}

function normalizeTurn(raw: any, index: number): MessageTurn | null {
  if (!raw || typeof raw !== "object") return null
  const rawRole = String(raw.role || "").toLowerCase()
  const role = rawRole === "user" ? "user" : "assistant"
  const content = normalizeContentParts(raw.content, raw.blocks)
  const id = firstString(raw.id) || `turn-${index}-${Date.now()}`
  const timestamp =
    typeof raw.timestamp === "number"
      ? raw.timestamp
      : typeof raw.timestamp === "string"
        ? Date.parse(raw.timestamp) || Date.now()
        : typeof raw.created_at === "number"
          ? raw.created_at
          : Date.now()

  return {
    id,
    role,
    content,
    timestamp,
    status: raw.status,
    error: firstString(raw.error),
  }
}

export function normalizeContentParts(rawContent: unknown, rawBlocks?: unknown): ContentPart[] {
  if (Array.isArray(rawBlocks) && rawBlocks.length > 0) {
    const parts = normalizeBlocks(rawBlocks)
    if (parts.length > 0) return parts
  }

  if (Array.isArray(rawContent)) {
    const hasCodegToolBlocks = rawContent.some((part: any) => {
      const type = firstString(part?.type)
      return type === "tool_use" || type === "tool_result"
    })
    if (hasCodegToolBlocks) {
      const parts = normalizeBlocks(rawContent)
      if (parts.length > 0) return parts
    }
    return rawContent
      .map((part) => normalizeContentPart(part))
      .filter(Boolean) as ContentPart[]
  }

  const text = firstString(rawContent)
  if (text) return [{ type: "text", text }]
  return []
}

function normalizeContentPart(raw: any): ContentPart | null {
  if (!raw || typeof raw !== "object") {
    const text = firstString(raw)
    return text ? { type: "text", text } : null
  }

  const type = firstString(raw.type)
  if (type === "text") return { type: "text", text: firstString(raw.text) || "" }
  if (type === "thinking") return { type: "thinking", thinking: firstString(raw.thinking) || "" }
  if (type === "tool_call" && raw.tool_call && typeof raw.tool_call === "object") {
    return {
      type: "tool_call",
      tool_call: {
        id: firstString(raw.tool_call.id) || `tool-${Date.now()}`,
        name: firstString(raw.tool_call.name) || "unknown",
        input: (raw.tool_call.input && typeof raw.tool_call.input === "object")
          ? raw.tool_call.input
          : {},
        status: raw.tool_call.status,
        output: firstString(raw.tool_call.output),
        error: firstString(raw.tool_call.error),
      },
    }
  }
  if (type === "image" && raw.image && typeof raw.image === "object") {
    return {
      type: "image",
      image: {
        url: firstString(raw.image.url) || "",
        alt: firstString(raw.image.alt),
      },
    }
  }
  if (type === "plan" && raw.plan && typeof raw.plan === "object") {
    const steps = Array.isArray(raw.plan.steps) ? raw.plan.steps : []
    return {
      type: "plan",
      plan: {
        steps: steps
          .map((step: any) => ({
            description: firstString(step?.description, step?.title, step?.content) || "",
            completed: Boolean(step?.completed),
          }))
          .filter((step: any) => step.description),
        status: raw.plan.status,
      },
    }
  }

  const text = firstString(raw.text, raw.content, raw.description)
  return text ? { type: "text", text } : null
}

export function getTurnContentParts(turn: any): ContentPart[] {
  if (turn?.content && Array.isArray(turn.content)) return turn.content as ContentPart[]
  return normalizeContentParts(turn?.content, turn?.blocks)
}

export function normalizeAgentType(raw?: string): string {
  const value = String(raw || "").trim().toLowerCase().replace(/[\s-]/g, "_")
  if (!value) return "claude_code"
  if (value === "claudecode") return "claude_code"
  if (value === "codex_cli") return "codex"
  if (value === "gemini_cli" || value === "google_gemini" || value === "gemini_code") return "gemini"
  if (value === "cline_cli") return "cline"
  if (value === "opencode") return "open_code"
  if (value === "open_code_cli") return "open_code"
  if (value === "openclaw") return "open_claw"
  if (value === "open_claw_cli") return "open_claw"
  return value
}

function normalizeBlocks(rawBlocks: unknown[]): ContentPart[] {
  const parts: ContentPart[] = []
  const consumedResultIndexes = new Set<number>()

  for (let index = 0; index < rawBlocks.length; index++) {
    if (consumedResultIndexes.has(index)) continue
    const block = rawBlocks[index] as any
    if (!block || typeof block !== "object") continue
    const type = firstString(block.type)
    if (type === "text") {
      parts.push({ type: "text", text: firstString(block.text) || "" })
      continue
    }
    if (type === "thinking") {
      parts.push({ type: "thinking", thinking: firstString(block.text) || "" })
      continue
    }
    if (type === "image") {
      const uri = firstString(block.uri)
      const data = firstString(block.data)
      const mime = firstString(block.mime_type) || "image/png"
      parts.push({
        type: "image",
        image: {
          url: uri || (data ? `data:${mime};base64,${data}` : ""),
          alt: "image",
        },
      })
      continue
    }
    if (type === "tool_use") {
      const toolUseId = firstString(block.tool_use_id)
      const inputPreview = firstString(block.input_preview)
      const nextBlock = rawBlocks[index + 1] as any
      const canPairByPosition =
        !toolUseId &&
        nextBlock &&
        typeof nextBlock === "object" &&
        firstString(nextBlock.type) === "tool_result" &&
        !firstString(nextBlock.tool_use_id)
      const matchedResult =
        toolUseId
          ? rawBlocks.find((candidate: any) =>
              candidate &&
              typeof candidate === "object" &&
              firstString(candidate.type) === "tool_result" &&
              firstString(candidate.tool_use_id) === toolUseId
            )
          : canPairByPosition
            ? nextBlock
            : null

      if (canPairByPosition) {
        consumedResultIndexes.add(index + 1)
      }

      const output = matchedResult ? firstString(matchedResult.output_preview) || "" : undefined
      const isError = Boolean(matchedResult?.is_error)
      parts.push({
        type: "tool_call",
        tool_call: {
          id: toolUseId || `tool-${index}-${Date.now()}`,
          name: firstString(block.tool_name) || "tool",
          input: toObject(inputPreview) || {},
          output,
          status: matchedResult ? (isError ? "error" : "completed") : "running",
          error: isError ? output : undefined,
        },
      })
      continue
    }
    if (type === "tool_result") {
      const toolUseId = firstString(block.tool_use_id)
      const output = firstString(block.output_preview) || ""
      if (toolUseId) {
        const matched = [...parts].reverse().find(
          (part) => part.type === "tool_call" && part.tool_call?.id === toolUseId
        )
        if (matched?.tool_call) {
          matched.tool_call.output = output
          matched.tool_call.status = block.is_error ? "error" : "completed"
          if (block.is_error) matched.tool_call.error = output
          continue
        }
      }
      parts.push({
        type: "tool_call",
        tool_call: {
          id: toolUseId || `tool-${index}-${Date.now()}`,
          name: "tool_result",
          input: {},
          output,
          status: block.is_error ? "error" : "completed",
          error: block.is_error ? output : undefined,
        },
      })
    }
  }

  return parts
}

export function normalizeAttachments(
  source: unknown,
  createId: RestoredIdFactory
): UploadedAttachment[] {
  if (!Array.isArray(source)) return []
  return source
    .map((item, index) => normalizeAttachment(item, index, createId))
    .filter(Boolean) as UploadedAttachment[]
}

function normalizeAttachment(
  source: unknown,
  index: number,
  createId: RestoredIdFactory
): UploadedAttachment | null {
  if (!source || typeof source !== "object") return null
  const record = source as Record<string, unknown>
  const kind = record.kind === "image" ? "image" : record.kind === "file" ? "file" : null
  const url = typeof record.url === "string" ? record.url : ""
  if (!kind || !url) return null
  return {
    id: typeof record.id === "string" && record.id ? record.id : createId(`att-restored-${index}`),
    url,
    name: typeof record.name === "string" ? record.name : "",
    size: Number(record.size || 0),
    type: typeof record.type === "string" ? record.type : "application/octet-stream",
    kind,
  }
}

export function normalizeDraftQueue(
  source: unknown,
  createId: RestoredIdFactory
): QueuedDraft[] {
  if (!Array.isArray(source)) return []
  return source
    .map((item, index) => normalizeDraft(item, index, createId))
    .filter(Boolean) as QueuedDraft[]
}

function normalizeDraft(
  source: unknown,
  index: number,
  createId: RestoredIdFactory
): QueuedDraft | null {
  if (!source || typeof source !== "object") return null
  const record = source as Record<string, unknown>
  const rawStatus = record.status === "failed" ? "failed" : record.status === "sending" ? "sending" : "pending"
  const status: QueuedDraft["status"] = rawStatus === "sending" ? "pending" : rawStatus
  return {
    id: typeof record.id === "string" && record.id ? record.id : createId(`draft-restored-${index}`),
    text: typeof record.text === "string" ? record.text : "",
    attachments: normalizeAttachments(record.attachments, createId),
    createdAt: Number(record.createdAt || Date.now()),
    status,
    error: status === "failed" && typeof record.error === "string" ? record.error : undefined,
  }
}

export function cloneAttachments(source: UploadedAttachment[]) {
  return source.map((item) => ({ ...item }))
}

export function cloneDraftQueue(source: QueuedDraft[]) {
  return source.map((item) => ({
    ...item,
    attachments: cloneAttachments(item.attachments),
  }))
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run:

```bash
cd mcode-app
pnpm test:unit -- --runTestsByPath tests/pages/conversation-detail/detailDataNormalization.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add mcode-app/src/pages/conversation-detail/detailDataNormalization.ts mcode-app/tests/pages/conversation-detail/detailDataNormalization.spec.ts
git commit -m "refactor: extract detail data normalization"
```

---

### Task 3: Interaction Presentation Helpers

**Files:**
- Create: `mcode-app/src/pages/conversation-detail/detailInteractionPresentation.ts`
- Create: `mcode-app/tests/pages/conversation-detail/detailInteractionPresentation.spec.ts`

**Interfaces:**
- Consumes: `PendingQuestionState`, `QuestionAnswer` from `@/types/acp`.
- Produces:
  - `QuestionSelectionState`
  - `createQuestionSelectionState(pending: PendingQuestionState | null | undefined): Record<string, QuestionSelectionState>`
  - `isQuestionSelectionAnswered(selection: QuestionSelectionState): boolean`
  - `buildQuestionAnswer(pending, selections, declined): QuestionAnswer`
  - `questionLabelText(label: string): string`
  - `isQuestionRecommended(label: string): boolean`
  - `splitPermissionDescription(description: string): { textParts: string[]; commandBlock: string }`

- [ ] **Step 1: Write the failing test**

Create `mcode-app/tests/pages/conversation-detail/detailInteractionPresentation.spec.ts`:

```ts
import {
  buildQuestionAnswer,
  createQuestionSelectionState,
  isQuestionRecommended,
  isQuestionSelectionAnswered,
  questionLabelText,
  splitPermissionDescription,
  type QuestionSelectionState,
} from "@/pages/conversation-detail/detailInteractionPresentation"
import type { PendingQuestionState } from "@/types/acp"

const pending: PendingQuestionState = {
  question_id: "question-request",
  created_at: "2026-06-20T00:00:00.000Z",
  questions: [
    {
      id: "q1",
      question: "Pick one",
      header: "Choice",
      multi_select: false,
      options: [{ label: "A (Recommended)", description: "" }],
    },
    {
      id: "q2",
      question: "Pick many",
      header: "Multi",
      multi_select: true,
      options: [{ label: "B", description: "" }],
    },
  ],
}

describe("detailInteractionPresentation", () => {
  it("splits permission command text from user-facing description", () => {
    const result = splitPermissionDescription([
      "智能体请求继续当前操作",
      "Command: pnpm exec vue-tsc --noEmit --pretty false",
      "--project mcode-app/tsconfig.json",
    ].join("\n"))

    expect(result).toEqual({
      textParts: ["智能体请求继续当前操作"],
      commandBlock: "pnpm exec vue-tsc --noEmit --pretty false\n--project mcode-app/tsconfig.json",
    })
  })

  it("returns default permission text for empty descriptions", () => {
    expect(splitPermissionDescription("")).toEqual({
      textParts: ["智能体请求继续当前操作"],
      commandBlock: "",
    })
  })

  it("normalizes recommended question labels", () => {
    expect(questionLabelText("A (Recommended)")).toBe("A")
    expect(isQuestionRecommended("A (Recommended)")).toBe(true)
    expect(isQuestionRecommended("A")).toBe(false)
  })

  it("creates empty selection state and detects answered selections", () => {
    const selections = createQuestionSelectionState(pending)
    expect(selections).toEqual({
      q1: { selected: [], otherActive: false, otherText: "" },
      q2: { selected: [], otherActive: false, otherText: "" },
    })
    expect(isQuestionSelectionAnswered(selections.q1)).toBe(false)
    expect(isQuestionSelectionAnswered({ selected: [], otherActive: true, otherText: "custom" })).toBe(true)
  })

  it("builds submitted and declined ask-question answers", () => {
    const selections: Record<string, QuestionSelectionState> = {
      q1: { selected: ["A (Recommended)"], otherActive: false, otherText: "" },
      q2: { selected: ["B"], otherActive: true, otherText: "custom" },
    }

    expect(buildQuestionAnswer(pending, selections, false)).toEqual({
      declined: false,
      answers: [
        { questionId: "q1", labels: ["A (Recommended)"] },
        { questionId: "q2", labels: ["B", "custom"] },
      ],
    })
    expect(buildQuestionAnswer(pending, selections, true)).toEqual({
      declined: true,
      answers: [],
    })
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
cd mcode-app
pnpm test:unit -- --runTestsByPath tests/pages/conversation-detail/detailInteractionPresentation.spec.ts
```

Expected: FAIL because `detailInteractionPresentation.ts` does not exist.

- [ ] **Step 3: Add the interaction presentation module**

Create `mcode-app/src/pages/conversation-detail/detailInteractionPresentation.ts`:

```ts
import type { PendingQuestionState, QuestionAnswer } from "@/types/acp"
import { firstString } from "./detailDataNormalization"

export interface QuestionSelectionState {
  selected: string[]
  otherActive: boolean
  otherText: string
}

export function createQuestionSelectionState(
  pending: PendingQuestionState | null | undefined
): Record<string, QuestionSelectionState> {
  const next: Record<string, QuestionSelectionState> = {}
  for (const question of pending?.questions || []) {
    next[question.id] = {
      selected: [],
      otherActive: false,
      otherText: "",
    }
  }
  return next
}

export function isQuestionSelectionAnswered(selection: QuestionSelectionState): boolean {
  return (
    selection.selected.length > 0 ||
    (selection.otherActive && Boolean(selection.otherText.trim()))
  )
}

export function buildQuestionAnswer(
  pending: PendingQuestionState | null | undefined,
  selections: Record<string, QuestionSelectionState>,
  declined: boolean
): QuestionAnswer {
  if (declined) {
    return { answers: [], declined: true }
  }
  return {
    declined: false,
    answers: (pending?.questions || []).map((question) => {
      const selection = selections[question.id] || {
        selected: [],
        otherActive: false,
        otherText: "",
      }
      const labels = [...selection.selected]
      const otherText = selection.otherText.trim()
      if (selection.otherActive && otherText) {
        labels.push(otherText)
      }
      return {
        questionId: question.id,
        labels,
      }
    }),
  }
}

export function questionLabelText(label: string) {
  return String(label || "").replace(/\s*\(recommended\)\s*$/i, "").trim() || label
}

export function isQuestionRecommended(label: string) {
  return /\s*\(recommended\)\s*$/i.test(String(label || "")) && Boolean(questionLabelText(label))
}

export function splitPermissionDescription(description: string): {
  textParts: string[]
  commandBlock: string
} {
  const text = String(description || "").trim()
  if (!text) {
    return {
      textParts: ["智能体请求继续当前操作"],
      commandBlock: "",
    }
  }

  const normalized = text.replace(/\r\n/g, "\n")
  const lines = normalized
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)

  const commandLines: string[] = []
  const textParts: string[] = []
  let collectingCommand = false

  lines.forEach((line) => {
    if (looksLikePermissionCommandLine(line)) {
      collectingCommand = true
      commandLines.push(stripPermissionCommandPrefix(line))
      return
    }

    if (collectingCommand && looksLikeCommandContinuation(line)) {
      commandLines.push(line)
      return
    }

    collectingCommand = false
    textParts.push(line)
  })

  if (commandLines.length === 0) {
    return {
      textParts: [normalized],
      commandBlock: "",
    }
  }

  return {
    textParts,
    commandBlock: commandLines.join("\n"),
  }
}

function looksLikePermissionCommandLine(line: string): boolean {
  if (!line) return false
  if (/^(command|cmd|命令|执行命令)\s*[:：]/i.test(line)) return true
  if (line.length >= 72 && /[\\/]/.test(line)) return true
  if (line.length >= 96 && /--?[a-z0-9]/i.test(line)) return true
  return false
}

function looksLikeCommandContinuation(line: string): boolean {
  if (!line) return false
  if (/^(>|\$|#)/.test(line)) return true
  if (/^(--?[a-z0-9]|\/|\.\.?[\\/])/.test(line)) return true
  if (line.length >= 48 && /[=\\/]/.test(line)) return true
  return false
}

function stripPermissionCommandPrefix(line: string): string {
  return line.replace(/^(command|cmd|命令|执行命令)\s*[:：]\s*/i, "")
}

export function questionInputValue(event: unknown) {
  return typeof event === "string"
    ? event
    : firstString((event as any)?.detail?.value, (event as any)?.target?.value) || ""
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run:

```bash
cd mcode-app
pnpm test:unit -- --runTestsByPath tests/pages/conversation-detail/detailInteractionPresentation.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add mcode-app/src/pages/conversation-detail/detailInteractionPresentation.ts mcode-app/tests/pages/conversation-detail/detailInteractionPresentation.spec.ts
git commit -m "refactor: extract detail interaction presentation"
```

---

### Task 4: Plan Task Presentation Helpers

**Files:**
- Create: `mcode-app/src/pages/conversation-detail/detailPlanPresentation.ts`
- Create: `mcode-app/tests/pages/conversation-detail/detailPlanPresentation.spec.ts`

**Interfaces:**
- Consumes: `ContentPart`, `MessageTurn`, `ToolCall` from `@/types/acp`; `firstString`, `getTurnContentParts`, and `toObject` from `detailDataNormalization.ts`.
- Produces:
  - `PlanTaskStatus`, `PlanTask`, `PlanTaskFilter`
  - `buildPlanTasks(input: { messages: MessageTurn[]; liveContent?: ContentPart[] }): PlanTask[]`
  - `countPlanTasksByStatus(tasks: PlanTask[], status: PlanTaskStatus): number`
  - `buildPlanFilterItems(tasks: PlanTask[]): Array<{ key: PlanTaskFilter; label: string; count: number }>`
  - `taskStatusLabel(status: PlanTaskStatus): string`
  - `normalizeTaskStatus(value: unknown): PlanTaskStatus`

- [ ] **Step 1: Write the failing test**

Create `mcode-app/tests/pages/conversation-detail/detailPlanPresentation.spec.ts`:

```ts
import {
  buildPlanFilterItems,
  buildPlanTasks,
  normalizeTaskStatus,
  taskStatusLabel,
} from "@/pages/conversation-detail/detailPlanPresentation"
import type { MessageTurn } from "@/types/acp"

const message = (overrides: Partial<MessageTurn>): MessageTurn => ({
  id: "m1",
  role: "assistant",
  content: [],
  timestamp: 1000,
  ...overrides,
})

describe("detailPlanPresentation", () => {
  it("extracts tasks from plan parts and tool calls in stable order", () => {
    const tasks = buildPlanTasks({
      messages: [
        message({
          id: "m1",
          content: [
            {
              type: "plan",
              plan: {
                steps: [
                  { description: "Write tests", completed: true },
                  { description: "Implement helpers", completed: false },
                ],
              },
            },
            {
              type: "tool_call",
              tool_call: {
                id: "tool-1",
                name: "TodoWrite",
                input: {
                  todos: [
                    { id: "todo-1", content: "Wire page", status: "in_progress" },
                    { id: "todo-2", content: "Verify", status: "pending" },
                  ],
                },
              },
            },
          ],
        }),
      ],
    })

    expect(tasks.map((task) => [task.id, task.subject, task.status])).toEqual([
      ["plan-write tests", "Write tests", "completed"],
      ["plan-implement helpers", "Implement helpers", "pending"],
      ["todo-1", "Wire page", "in_progress"],
      ["todo-2", "Verify", "pending"],
    ])
  })

  it("uses live plan content when completed messages do not contain tasks", () => {
    const tasks = buildPlanTasks({
      messages: [],
      liveContent: [
        {
          type: "plan",
          plan: {
            steps: [{ description: "Live step", completed: false }],
          },
        },
      ],
    })

    expect(tasks).toEqual([
      expect.objectContaining({
        id: "plan-live step",
        subject: "Live step",
        status: "pending",
      }),
    ])
  })

  it("normalizes status aliases and labels", () => {
    expect(normalizeTaskStatus("running")).toBe("in_progress")
    expect(normalizeTaskStatus("done")).toBe("completed")
    expect(normalizeTaskStatus("cancelled")).toBe("failed")
    expect(normalizeTaskStatus("unknown")).toBe("pending")
    expect(taskStatusLabel("in_progress")).toBe("进行中")
    expect(taskStatusLabel("completed")).toBe("已完成")
    expect(taskStatusLabel("failed")).toBe("失败")
    expect(taskStatusLabel("pending")).toBe("待处理")
  })

  it("builds filter counts", () => {
    const items = buildPlanFilterItems([
      { id: "1", subject: "a", status: "completed", order: 1 },
      { id: "2", subject: "b", status: "failed", order: 2 },
    ])

    expect(items).toEqual([
      { key: "all", label: "全部", count: 2 },
      { key: "in_progress", label: "进行中", count: 0 },
      { key: "pending", label: "待处理", count: 0 },
      { key: "completed", label: "已完成", count: 1 },
      { key: "failed", label: "失败", count: 1 },
    ])
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
cd mcode-app
pnpm test:unit -- --runTestsByPath tests/pages/conversation-detail/detailPlanPresentation.spec.ts
```

Expected: FAIL because `detailPlanPresentation.ts` does not exist.

- [ ] **Step 3: Add the plan presentation module**

Create `mcode-app/src/pages/conversation-detail/detailPlanPresentation.ts`:

```ts
import type { ContentPart, MessageTurn, ToolCall } from "@/types/acp"
import { firstString, getTurnContentParts, toObject } from "./detailDataNormalization"

export type PlanTaskStatus = "pending" | "in_progress" | "completed" | "failed"

export interface PlanTask {
  id: string
  subject: string
  description?: string
  status: PlanTaskStatus
  order: number
}

export type PlanTaskFilter = "all" | PlanTaskStatus

export function buildPlanTasks(input: {
  messages: MessageTurn[]
  liveContent?: ContentPart[]
}): PlanTask[] {
  const taskMap = new Map<string, PlanTask>()
  let order = 0

  const nextOrder = () => {
    order += 1
    return order
  }

  for (const msg of input.messages || []) {
    getTurnContentParts(msg).forEach((part, partIndex) => {
      if (part.type === "plan" && part.plan) {
        mergeTaskFromPlanPart(taskMap, part.plan, nextOrder, `${msg.id}-${partIndex}`)
        return
      }
      if (part.type === "tool_call" && part.tool_call) {
        mergeTaskFromToolCall(taskMap, part.tool_call, nextOrder)
      }
    })
  }

  if (taskMap.size === 0) {
    ;(input.liveContent || []).forEach((part, partIndex) => {
      if (part.type === "plan" && part.plan) {
        mergeTaskFromPlanPart(taskMap, part.plan, nextOrder, `live-${partIndex}`)
      }
    })
  }

  return Array.from(taskMap.values()).sort((a, b) => a.order - b.order)
}

function mergeTaskFromToolCall(
  taskMap: Map<string, PlanTask>,
  toolCall: ToolCall,
  nextOrder: () => number
) {
  const name = normalizeToolName(toolCall.name)
  if (!name.includes("task") && !name.includes("todo")) return

  const input = (toolCall.input || {}) as Record<string, any>

  if (name === "tasklist" || name === "task_list") {
    const outputObj = toObject(toolCall.output)
    const taskList =
      (outputObj?.tasks as any[]) ||
      (outputObj?.todos as any[]) ||
      (outputObj?.list as any[]) ||
      []

    taskList.forEach((item, index) => {
      if (!item || typeof item !== "object") return
      const id = firstString(item.taskId, item.task_id, item.id) || `tasklist-${index}`
      upsertTask(taskMap, id, nextOrder, {
        subject:
          firstString(item.subject, item.title, item.content, item.description) ||
          `任务 ${index + 1}`,
        description: firstString(item.description, item.activeForm),
        status: normalizeTaskStatus(item.status),
      })
    })
    return
  }

  if (name === "todowrite" && Array.isArray(input.todos)) {
    input.todos.forEach((item: Record<string, any>, index: number) => {
      if (!item || typeof item !== "object") return
      const id = firstString(item.id, item.taskId) || `todo-${index}`
      upsertTask(taskMap, id, nextOrder, {
        subject:
          firstString(item.content, item.subject, item.title, item.description) ||
          `任务 ${index + 1}`,
        description: firstString(item.activeForm),
        status: normalizeTaskStatus(item.status),
      })
    })
    return
  }

  if (name === "taskcreate" || name === "task_create") {
    const outputObj = toObject(toolCall.output)
    const id =
      firstString(input.taskId, input.task_id, outputObj?.taskId, outputObj?.task_id, outputObj?.id) ||
      `task-create-${toolCall.id}`
    upsertTask(taskMap, id, nextOrder, {
      subject:
        firstString(input.subject, input.title, input.content, input.description) ||
        "新任务",
      description: firstString(input.description, input.activeForm),
      status: normalizeTaskStatus(input.status || outputObj?.status),
    })
    return
  }

  if (name === "taskupdate" || name === "task_update") {
    const id =
      firstString(input.taskId, input.task_id, input.id) || `task-update-${toolCall.id}`
    upsertTask(taskMap, id, nextOrder, {
      subject: firstString(input.subject),
      description: firstString(input.description, input.activeForm),
      status: normalizeTaskStatus(input.status),
    })
  }
}

function mergeTaskFromPlanPart(
  taskMap: Map<string, PlanTask>,
  plan: ContentPart["plan"],
  nextOrder: () => number,
  keyPrefix: string
) {
  const steps = Array.isArray(plan?.steps) ? plan.steps : []
  steps.forEach((step, index) => {
    const subject = firstString(step?.description) || `任务 ${index + 1}`
    const normalizedKey = normalizePlanStepKey(subject)
    const id = normalizedKey ? `plan-${normalizedKey}` : `plan-${keyPrefix}-${index}`
    upsertTask(taskMap, id, nextOrder, {
      subject,
      status: step?.completed ? "completed" : "pending",
    })
  })
}

function upsertTask(
  taskMap: Map<string, PlanTask>,
  id: string,
  nextOrder: () => number,
  patch: Partial<Omit<PlanTask, "id" | "order">>
) {
  const existing = taskMap.get(id)
  if (!existing) {
    taskMap.set(id, {
      id,
      subject: patch.subject || "任务",
      description: patch.description,
      status: patch.status || "pending",
      order: nextOrder(),
    })
    return
  }

  if (patch.subject) existing.subject = patch.subject
  if (patch.description) existing.description = patch.description
  if (patch.status) existing.status = patch.status
}

function normalizeToolName(name?: string): string {
  return String(name || "").trim().toLowerCase().replace(/[\s_-]/g, "")
}

function normalizePlanStepKey(value: string): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
}

export function normalizeTaskStatus(value: unknown): PlanTaskStatus {
  const status = String(value || "").trim().toLowerCase()
  if (
    status === "in_progress" ||
    status === "inprogress" ||
    status === "running" ||
    status === "active" ||
    status === "processing"
  ) {
    return "in_progress"
  }
  if (
    status === "completed" ||
    status === "done" ||
    status === "success" ||
    status === "finished"
  ) {
    return "completed"
  }
  if (
    status === "failed" ||
    status === "error" ||
    status === "cancelled" ||
    status === "canceled"
  ) {
    return "failed"
  }
  return "pending"
}

export function taskStatusLabel(status: PlanTaskStatus): string {
  if (status === "in_progress") return "进行中"
  if (status === "completed") return "已完成"
  if (status === "failed") return "失败"
  return "待处理"
}

export function countPlanTasksByStatus(tasks: PlanTask[], status: PlanTaskStatus): number {
  return tasks.filter((task) => task.status === status).length
}

export function buildPlanFilterItems(tasks: PlanTask[]) {
  return [
    { key: "all" as const, label: "全部", count: tasks.length },
    { key: "in_progress" as const, label: "进行中", count: countPlanTasksByStatus(tasks, "in_progress") },
    { key: "pending" as const, label: "待处理", count: countPlanTasksByStatus(tasks, "pending") },
    { key: "completed" as const, label: "已完成", count: countPlanTasksByStatus(tasks, "completed") },
    { key: "failed" as const, label: "失败", count: countPlanTasksByStatus(tasks, "failed") },
  ]
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run:

```bash
cd mcode-app
pnpm test:unit -- --runTestsByPath tests/pages/conversation-detail/detailPlanPresentation.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add mcode-app/src/pages/conversation-detail/detailPlanPresentation.ts mcode-app/tests/pages/conversation-detail/detailPlanPresentation.spec.ts
git commit -m "refactor: extract detail plan presentation"
```

---

### Task 5: Wire Helpers Into Conversation Detail Page

**Files:**
- Modify: `mcode-app/src/pages/conversation-detail/index.vue`

**Interfaces:**
- Consumes all exports from Tasks 1-4.
- Produces the same page runtime behavior with less inline pure logic.

- [ ] **Step 1: Update imports**

In `mcode-app/src/pages/conversation-detail/index.vue`, add these imports after `MessageBubble`:

```ts
import {
  buildRenderMessageItems,
  type RenderMessageItem,
} from "./detailMessagePresentation"
import {
  cloneAttachments,
  cloneDraftQueue,
  firstString,
  normalizeAgentType,
  normalizeAttachments,
  normalizeDraftQueue,
  normalizeList,
  safeParseArray,
  type ConversationDraftSnapshot,
  type QueuedDraft,
  type UploadedAttachment,
} from "./detailDataNormalization"
import {
  buildQuestionAnswer as buildPendingQuestionAnswer,
  createQuestionSelectionState,
  isQuestionRecommended,
  isQuestionSelectionAnswered,
  questionInputValue,
  questionLabelText,
  splitPermissionDescription,
  type QuestionSelectionState,
} from "./detailInteractionPresentation"
import {
  buildPlanFilterItems,
  buildPlanTasks,
  taskStatusLabel,
  type PlanTask,
  type PlanTaskFilter,
} from "./detailPlanPresentation"
```

- [ ] **Step 2: Remove moved local type declarations**

Delete these page-local declarations from `index.vue` because they now come from imports:

- `UploadedAttachment`
- `QueuedDraft`
- `ConversationDraftSnapshot`
- `QuestionSelectionState`
- `RenderMessageItem`
- `PlanTaskStatus`
- `PlanTask`
- `PlanTaskFilter`

Keep `UploadQueueItem`, `SendAttemptResult`, `SlashCommandItem`, `DetailStatusState`, `PickedLocalFile`, `StoredConnectionItem`, `ComposerPanelMode`, `QuickReplyItem`, `HistoryPageCursor`, and `DetailProjectEntry` in the page.

- [ ] **Step 3: Replace the render-message computed**

Replace the current `renderMessageItems` computed block and delete local `cloneRenderContentParts`:

```ts
const renderMessageItems = computed<RenderMessageItem[]>(() =>
  buildRenderMessageItems(messages.value)
)
```

- [ ] **Step 4: Replace plan-task computed helpers**

Replace the current `planTasks`, `completedTaskCount`, `filteredPlanTasks`, and `planFilterItems` blocks with:

```ts
const planTasks = computed<PlanTask[]>(() =>
  buildPlanTasks({
    messages: messages.value,
    liveContent: session.value?.liveMessage?.content || [],
  })
)

const completedTaskCount = computed(
  () => planTasks.value.filter((task) => task.status === "completed").length
)

const filteredPlanTasks = computed(() => {
  if (planStatusFilter.value === "all") return planTasks.value
  return planTasks.value.filter((task) => task.status === planStatusFilter.value)
})

const planFilterItems = computed(() => buildPlanFilterItems(planTasks.value))
```

Keep `planStatusFilter` as:

```ts
const planStatusFilter = ref<PlanTaskFilter>("all")
```

- [ ] **Step 5: Replace draft and attachment normalization call sites**

Update `readConversationDraftSnapshot()`:

```ts
return {
  composerText: typeof parsed.composerText === "string" ? parsed.composerText : "",
  draftQueue: normalizeDraftQueue((parsed as Record<string, unknown>).draftQueue, createLocalId),
  attachments: normalizeAttachments((parsed as Record<string, unknown>).attachments, createLocalId),
  queueExpanded: Boolean(parsed.queueExpanded),
}
```

Update `restoreDraftState(cachedViewState, persistedRuntime)`:

```ts
const restoredDraftQueue = normalizeDraftQueue(sourceDraftQueue, createLocalId)
const restoredAttachments = normalizeAttachments(sourceAttachments, createLocalId)
```

Leave `persistConversationDraftSnapshot()`, `persistDetailRuntimeState()`, and `createLocalId()` in the page because they are stateful or side-effectful.

- [ ] **Step 6: Replace ask-question helper wrappers**

Replace `resetQuestionSelections()` with:

```ts
function resetQuestionSelections() {
  askQuestionSelections.value = createQuestionSelectionState(pendingQuestionCard.value)
}
```

Replace `isQuestionAnswered(questionId: string)` with:

```ts
function isQuestionAnswered(questionId: string) {
  return isQuestionSelectionAnswered(questionSelection(questionId))
}
```

Replace `setQuestionOtherText(questionId: string, event: unknown)` with:

```ts
function setQuestionOtherText(questionId: string, event: unknown) {
  const value = questionInputValue(event)
  const current = questionSelection(questionId)
  askQuestionSelections.value = {
    ...askQuestionSelections.value,
    [questionId]: {
      ...current,
      otherActive: true,
      otherText: value,
    },
  }
}
```

Replace `buildQuestionAnswer(declined: boolean)` with:

```ts
function buildQuestionAnswer(declined: boolean): QuestionAnswer {
  return buildPendingQuestionAnswer(
    pendingQuestionCard.value,
    askQuestionSelections.value,
    declined
  )
}
```

- [ ] **Step 7: Delete moved local functions**

Delete these functions from `index.vue` after imports are wired:

```ts
safeParseArray
normalizeList
normalizeAttachments
normalizeAttachment
normalizeDraftQueue
normalizeDraft
cloneAttachments
cloneDraftQueue
mergeTaskFromToolCall
mergeTaskFromPlanPart
upsertTask
normalizeToolName
normalizePlanStepKey
normalizeTaskStatus
firstString
toObject
taskStatusLabel
splitPermissionDescription
looksLikePermissionCommandLine
looksLikeCommandContinuation
stripPermissionCommandPrefix
countByStatus
normalizeTurns
normalizeTurn
normalizeContentParts
normalizeContentPart
getTurnContentParts
normalizeAgentType
normalizeBlocks
questionLabelText
isQuestionRecommended
```

Do not delete `looksLikeNetworkFailure`; it is still a page-level status helper.

- [ ] **Step 8: Run targeted tests**

Run:

```bash
cd mcode-app
pnpm test:unit -- --runTestsByPath tests/pages/conversation-detail/detailMessagePresentation.spec.ts tests/pages/conversation-detail/detailDataNormalization.spec.ts tests/pages/conversation-detail/detailInteractionPresentation.spec.ts tests/pages/conversation-detail/detailPlanPresentation.spec.ts
```

Expected: PASS.

- [ ] **Step 9: Run type check**

Run:

```bash
cd mcode-app
pnpm exec vue-tsc --noEmit
```

Expected: no new errors from `src/pages/conversation-detail/index.vue` or the new helper modules. If unrelated pre-existing errors appear elsewhere, capture the first five file paths and continue to Task 6.

- [ ] **Step 10: Commit**

```bash
git add mcode-app/src/pages/conversation-detail/index.vue
git commit -m "refactor: wire detail page presentation helpers"
```

---

### Task 6: mcode Architecture Note And Final Verification

**Files:**
- Create: `docs/mcode-architecture-notes/2026-06-20-conversation-detail-logic-cleanup.md`

**Interfaces:**
- Consumes: final diff from Tasks 1-5.
- Produces: mcode architecture note required by `AGENTS.md`.

- [ ] **Step 1: Add the architecture note**

Create `docs/mcode-architecture-notes/2026-06-20-conversation-detail-logic-cleanup.md`:

```md
# Conversation Detail Logic Cleanup

## Architecture

`mcode-app` conversation detail keeps the same Vue page and runtime ownership, but pure presentation and normalization logic now lives in sibling TypeScript modules under `mcode-app/src/pages/conversation-detail/`.

The page remains responsible for lifecycle hooks, route parsing, gateway calls, store mutations, timers, scroll/layout measurement, persistence side effects, and `uni` UI feedback. Helper modules are deterministic and do not call `uni`, repositories, stores, gateways, or realtime transports.

## Protocol And Data Flow

No ACP, realtime, SQLite, opened-tab sync, local runtime, or draft persistence protocol changed.

The existing detail load order is unchanged:

1. route and connection context
2. local summary and persisted turns
3. persisted runtime and draft snapshot
4. optional remote detail metadata or calibration
5. realtime connection and snapshot hydration
6. composer config and slash command hydration

The extracted helpers only transform data already owned by the page.

## UI Behavior

There are no template, copy, style, or theme-variable changes. Message rendering still merges adjacent assistant turns the same way, plan-task badges keep the same counts and labels, permission command extraction keeps the same default text, and ask-question answers keep the same submitted payload shape.

## Compatibility

Existing local cache records, draft snapshots, attachment payloads, turn rows, ACP payloads, and realtime events remain compatible. Malformed backend or local-storage data still falls back to empty arrays or safe defaults rather than throwing.

## Native iOS/Android Guidance

Native clients can mirror these helpers as pure presentation/normalization utilities:

- keep runtime, networking, storage, and UI side effects in the screen/controller layer
- merge adjacent assistant turns before rendering message cells
- parse task lists from plan content and task/todo tool calls into ordered task models
- split permission descriptions into text and command blocks before display
- build ask-question responses from a local selection map
- normalize backend turns, agent aliases, restored drafts, and restored attachments defensively

Do not move ACP connection management, realtime authority, or SQLite calibration into these helpers.
```

- [ ] **Step 2: Run the complete targeted verification set**

Run:

```bash
cd mcode-app
pnpm test:unit -- --runTestsByPath tests/pages/conversation-detail/detailMessagePresentation.spec.ts tests/pages/conversation-detail/detailDataNormalization.spec.ts tests/pages/conversation-detail/detailInteractionPresentation.spec.ts tests/pages/conversation-detail/detailPlanPresentation.spec.ts tests/stores/conversationRuntime.spec.ts tests/services/runtimeViewState.spec.ts
```

Expected: PASS.

- [ ] **Step 3: Inspect final diff for forbidden UI/protocol changes**

Run:

```bash
git diff -- mcode-app/src/pages/conversation-detail/index.vue mcode-app/src/pages/conversation-detail/detailMessagePresentation.ts mcode-app/src/pages/conversation-detail/detailDataNormalization.ts mcode-app/src/pages/conversation-detail/detailInteractionPresentation.ts mcode-app/src/pages/conversation-detail/detailPlanPresentation.ts docs/mcode-architecture-notes/2026-06-20-conversation-detail-logic-cleanup.md
```

Expected:

- no `<template>` changes except none
- no `<style>` changes
- no changes to gateway method names or ACP payload keys
- no changes to runtime store calls other than using imported pure helpers around existing data
- `docs/mcode-architecture-notes/2026-06-20-conversation-detail-logic-cleanup.md` exists

- [ ] **Step 4: Commit**

```bash
git add docs/mcode-architecture-notes/2026-06-20-conversation-detail-logic-cleanup.md
git commit -m "docs: document detail logic cleanup"
```

---

## Self-Review

**Spec coverage:** The plan implements the approved first phase: pure logic extraction only, no template split, no UI change, no protocol change, tests for each extracted area, and a required mcode architecture note.

**Placeholder scan:** The plan contains concrete file paths, commands, module interfaces, code blocks, and expected outcomes.

**Type consistency:** `UploadedAttachment`, `QueuedDraft`, `ConversationDraftSnapshot`, `QuestionSelectionState`, `RenderMessageItem`, `PlanTask`, and `PlanTaskFilter` move from page-local declarations to explicit module exports and are imported by `index.vue`.

**Execution caution:** Use `apply_patch` for manual file edits. Do not rewrite unrelated sections of `conversation-detail/index.vue`; keep the diff scoped to import additions, deleted pure helpers, and call-site replacements listed in Task 5.
