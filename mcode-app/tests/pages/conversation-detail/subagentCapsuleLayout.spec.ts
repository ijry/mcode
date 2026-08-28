import fs from "fs"
import path from "path"

function read(relativePath: string) {
  return fs.readFileSync(path.resolve(__dirname, "../../../src", relativePath), "utf8")
}

/**
 * 胶囊组件的源码契约。
 *
 * 这个仓库没有 `@vue/test-utils` / jsdom，所以组件层只能验源码 —— 但要清楚这类断言
 * **挡不住行为回归**（`isEmptyThinkingPart` 曾在气泡里被调用却没 import，文本断言全程
 * 是绿的）。因此这里只锁「唯独源码能表达」的三类东西：
 *   1. App-Plus / uni-app 的渲染约束（`<text>` 吞组件、递归组件炸节点）；
 *   2. 接线是否到位（少一处 prop 就是「胶囊永远空着」的静默失败）；
 *   3. 主题变量而非硬编码色值（AGENTS.md 要求）。
 * 展示逻辑本身由 `subagentToolCall.spec.ts` 的 `buildSubagentCapsuleView` 断言覆盖。
 */
describe("subagent capsule layout contract", () => {
  const capsule = read("components/SubagentCapsuleBlock.vue")

  it("keeps the spinner as a sibling view, never inside <text>", () => {
    // App-Plus 下 `<text>` 只渲染文本子节点，塞进去的组件会被整个吞掉 ——
    // 「进行中转圈」是用户明确要的效果，吞掉了就静默没有了。
    const spinnerIndex = capsule.indexOf("up-loading-icon")
    const titleIndex = capsule.indexOf('<text :class="[\'subagent__title\'')
    expect(spinnerIndex).toBeGreaterThan(-1)
    expect(titleIndex).toBeGreaterThan(-1)
    // 转圈在标题之前、且是独立节点。
    expect(spinnerIndex).toBeLessThan(titleIndex)
    expect(capsule).toContain('v-if="view.isRunning"')
  })

  it("never recurses into ToolCallBlock or itself for inner tool calls", () => {
    // 子智能体里可以再起子智能体。递归组件在长会话里会炸出成百上千个节点，
    // 而这个胶囊存在的全部理由就是把长度压回去。内层只渲染扁平文本行。
    const body = capsule.slice(capsule.indexOf('class="subagent__body"'))
    expect(body).not.toContain("<ToolCallBlock")
    expect(body).not.toContain("<SubagentCapsuleBlock")
    expect(body).toContain("subagent__tool-name")
  })

  it("defaults to collapsed and only auto-expands on error", () => {
    // 默认折叠是本组件存在的理由（用户原话：「应该提供默认折叠功能」）。
    expect(capsule).toContain("const expanded = ref(view.value.isError)")
    // 失败自动展开，但用户手动收起过之后不再抢控制权。
    expect(capsule).toContain("if (isError && !userToggled.value) expanded.value = true")
    // 故意**不抄**参考实现的「running → completed 自动收起」：手机端用户可能正
    // 展开读实时输出，一完成就把面板从拇指底下抽走。
    expect(capsule).not.toContain("expanded.value = false")
  })

  it("does not attach a tap affordance when there is no body", () => {
    // 挂一个点不开的箭头比不挂更糟。
    expect(capsule).toContain('view.hasBody && \'subagent__summary--tappable\'')
    expect(capsule).toContain('v-if="view.hasBody"')
    expect(capsule).toContain("if (!view.value.hasBody) return")
  })

  it("surfaces the truncation hint so a clipped list never reads as complete", () => {
    // `clampSubagentStats` 落库前会裁掉多余的内层调用。不提示的话展开看到的是
    // 一份掐了头的列表，用户会以为子智能体只跑了这几个工具。
    expect(capsule).toContain("toolCallsTruncated")
    expect(capsule).toContain("另有 ")
    expect(capsule).toContain("个工具调用未展示")
  })

  it("uses uview theme vars instead of hardcoded colors", () => {
    // AGENTS.md：优先用 `--up-*` 主题变量，否则深色模式下会瞎。
    expect(capsule).toContain("--up-primary")
    expect(capsule).toContain("--up-success")
    expect(capsule).toContain("--up-error")
    // 色值只能作为 `var()` 的 fallback 出现，不能裸写在样式属性上。
    const styleBlock = capsule.slice(capsule.indexOf("<style"))
    const barePropertyColors = styleBlock
      .split("\n")
      .filter((line) => /:\s*#[0-9a-fA-F]{3,8}\s*;/.test(line))
    expect(barePropertyColors).toEqual([])
  })

  it("exposes theme hooks for nested capsule surfaces", () => {
    const bubble = read("components/MessageBubble.vue")
    // matrix 主题额外挂 `bubble-wrap--cyber`，sweet/summer 走 `bubble-wrap--theme-<name>`。
    for (const scope of ["cyber", "theme-sweet", "theme-summer"]) {
      expect(bubble).toContain(`.bubble-wrap--${scope} :deep(.subagent__summary)`)
      expect(bubble).toContain(`.bubble-wrap--${scope} :deep(.subagent__body)`)
      expect(bubble).toContain(`.bubble-wrap--${scope} :deep(.subagent__label)`)
      expect(bubble).toContain(`.bubble-wrap--${scope} :deep(.subagent__error)`)
    }
  })

  it("is wired through every timeline that renders bubbles", () => {
    // 少接一处不会报错 —— 胶囊只是永远空着（实时输出那一段不显示）。
    // 两条时间线：可交互面板与只读时间线。
    for (const relativePath of [
      "pages/conversation-detail/ConversationDetailInteractivePane.vue",
      "pages/conversation-detail/ConversationDetailReadonlyTimeline.vue",
    ]) {
      const source = read(relativePath)
      expect(source).toContain("getSubagentTranscripts")
      expect(source).toContain(":subagent-transcripts=\"subagentTranscripts\"")
    }
  })

  it("threads transcripts down both bubble render paths", () => {
    // 子智能体可以出现在普通气泡里，也可以出现在 goal 生命周期折叠块里。
    // 后者漏接的话，goal 里的子智能体就没有实时输出。
    const bubble = read("components/MessageBubble.vue")
    expect(bubble).toContain("import SubagentCapsuleBlock")
    expect(bubble).toContain("part.type === 'subagent_call'")
    expect(bubble).toContain(':transcript="subagentTranscript(part.tool_call.id)"')
    // 往 goal 块里继续传递。
    expect(bubble).toContain(':subagentTranscripts="subagentTranscripts"')

    const goal = read("components/GoalToolCallBlock.vue")
    expect(goal).toContain("import SubagentCapsuleBlock")
    expect(goal).toContain("item.type === 'subagent_call'")
    expect(goal).toContain(':transcript="subagentTranscript(item.tool_call.id)"')
  })
})
