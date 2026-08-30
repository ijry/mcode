import fs from "node:fs";
import path from "node:path";

import { buildBubbleDisplayParts } from "@/services/conversation/bubbleDisplayParts";

describe("ConversationDetailBody", () => {
  it("keeps a stable root class for the detail swiper layout", () => {
    const source = fs.readFileSync(
      path.resolve(
        __dirname,
        "../../../src/pages/conversation-detail/ConversationDetailBody.vue",
      ),
      "utf8",
    );

    expect(source).toContain('class="detail-body"');
    expect(source).toContain('class="message-list"');
    expect(source).toContain("<scroll-view");
    expect(source).toContain(
      'class="message-list__content" :style="messageListContentStyle"',
    );
    expect(source).toContain('class="composer-stack"');
    expect(source).toContain('class="composer-safe-area"');
    expect(source).toContain("'input-status-wrap'");
    expect(source).toContain("'input-wrap'");
  });

  it("owns layout styles that cannot cross the parent scoped boundary", () => {
    const source = fs.readFileSync(
      path.resolve(
        __dirname,
        "../../../src/pages/conversation-detail/ConversationDetailBody.vue",
      ),
      "utf8",
    );

    expect(source).toContain(".message-list");
    expect(source).toContain(".message-list__content");
    expect(source).toContain("messageListContentStyle?: StyleValue");
    expect(source).toContain(".composer-stack");
    expect(source).toContain(".composer-safe-area");
    expect(source).toContain(".input-status-wrap");
    expect(source).toContain(".input-wrap");
    expect(source).toContain(".detail-body");
    expect(source).toContain("position: relative");
    expect(source).toContain("position: absolute");
  });

  it("measures the detail body with the setup component instance", () => {
    const source = fs.readFileSync(
      path.resolve(
        __dirname,
        "../../../src/pages/conversation-detail/index.vue",
      ),
      "utf8",
    );

    expect(source).toContain("const currentInstance = getCurrentInstance()");
    expect(source).toContain("const instance = currentInstance?.proxy");
    expect(source).not.toContain(
      "const instance = getCurrentInstance()?.proxy",
    );
  });

  it("renders compact runtime controls from the active bottom composer", () => {
    const paneSource = fs.readFileSync(
      path.resolve(
        __dirname,
        "../../../src/pages/conversation-detail/ConversationDetailInteractivePane.vue",
      ),
      "utf8",
    );
    const shellSource = fs.readFileSync(
      path.resolve(
        __dirname,
        "../../../src/pages/conversation-detail/index.vue",
      ),
      "utf8",
    );

    expect(paneSource).not.toContain('class="detail-toolbar"');
    expect(paneSource).toContain("<template #status>");
    expect(paneSource).toContain('class="input-status-row"');
    expect(paneSource).toContain(
      'class="input-status-row__text">{{ inputStatusText }}</text>',
    );
    expect(paneSource).toContain("'tool-toggle-btn'");
    expect(paneSource).toContain('v-if="showInputToolMenu"');
    expect(paneSource).toContain('class="input-tool-menu"');
    expect(paneSource).toContain('class="input-tool-menu__item input-tool-menu__item--danger"');
    expect(shellSource).toContain("const DEFAULT_DETAIL_TOOLBAR_HEIGHT = 0");
  });

  it("shows the plus input tools as a left-aligned menu above the composer", () => {
    const source = fs.readFileSync(
      path.resolve(
        __dirname,
        "../../../src/pages/conversation-detail/index.scss",
      ),
      "utf8",
    );

    const toolMenuBlock =
      source.match(/\.input-tool-menu\s*\{[^}]*\}/)?.[0] || "";
    expect(toolMenuBlock).toContain("width: min(520rpx, 72vw);");
    expect(toolMenuBlock).toContain("margin-bottom: 12rpx;");
    expect(toolMenuBlock).toContain("align-self: flex-start;");
    expect(source).toContain(".input-tool-menu__item");
    expect(source).not.toContain(".input-tool-row");
  });

  it("anchors plan drawer theme styles on the teleported drawer root", () => {
    const shellSource = fs.readFileSync(
      path.resolve(__dirname, "../../../src/pages/conversation-detail/index.vue"),
      "utf8",
    );
    const paneSource = fs.readFileSync(
      path.resolve(
        __dirname,
        "../../../src/pages/conversation-detail/ConversationDetailInteractivePane.vue",
      ),
      "utf8",
    );
    const styles = fs.readFileSync(
      path.resolve(__dirname, "../../../src/pages/conversation-detail/index.scss"),
      "utf8",
    );

    expect(shellSource).toContain("plan-drawer--theme-${detailTheme}");
    expect(paneSource).toContain("plan-drawer--theme-${detailTheme}");
    for (const theme of ["matrix", "sweet", "summer"]) {
      expect(styles).toContain(`.plan-drawer--theme-${theme}`);
      expect(styles).toContain(`.plan-drawer--theme-${theme} .plan-filter`);
      expect(styles).toContain(`.plan-drawer--theme-${theme} .plan-task`);
    }
  });

  it("keeps config and stop controls side by side in the interactive composer", () => {
    const source = fs.readFileSync(
      path.resolve(
        __dirname,
        "../../../src/pages/conversation-detail/ConversationDetailInteractivePane.vue",
      ),
      "utf8",
    );

    expect(source).toContain("@click=\"openConfigPanelFromMenu\"");
    expect(source).toContain("composerPanelMode === 'config'");
    expect(source).toMatch(/<up-icon\s+name="setting"/);
    expect(source).toContain('class="input-tool-menu__item input-tool-menu__item--danger"');
    expect(source).toContain("function loadDetailAgentConfig()");
  });

  it("separates quick continue from other plus menu actions", () => {
    const source = fs.readFileSync(
      path.resolve(
        __dirname,
        "../../../src/pages/conversation-detail/ConversationDetailInteractivePane.vue",
      ),
      "utf8",
    );

    const menuIndex = source.indexOf('v-if="showInputToolMenu"');
    const inputMainRowIndex = source.indexOf('class="input-main-row"');
    expect(menuIndex).toBeGreaterThan(-1);
    expect(menuIndex).toBeLessThan(inputMainRowIndex);
    expect(source).toContain('class="input-tool-menu__item input-tool-menu__item--primary"');
    expect(source).toContain('@click="sendQuickContinue"');
    expect(source).toContain("<up-divider");
    expect(source).toContain("@click=\"openAttachmentPicker\"");
    expect(source).toContain("@click=\"openQuickReplyPanelFromMenu\"");
    expect(source).toContain("@click=\"handleRealtimeFeedbackMenu\"");
    expect(source).toContain("'input-tool-menu__item--disabled': realtimeFeedbackMenuDisabled");
    expect(source).toContain("showRealtimeFeedbackMenuItem");
    expect(source).toContain("realtimeFeedbackMenuDisabled");
    expect(source).toContain("isClaudeAgentType");
    expect(source).toContain("feedbackToolAvailable");
    expect(source).toContain("loadRealtimeFeedbackState");
    expect(source).toContain("getRemoteFeedbackSettings");
    expect(source).toContain("openComposerPanelFromMenu(\"feedback\")");
    expect(source).toContain("composerPanelMode === 'feedback'");
    expect(source).toContain("submitRealtimeFeedback");
    expect(source).toContain("<up-textarea");
    expect(source).toContain("realtimeFeedbackChannel");
    expect(source).toContain("nativeSteeringAvailable");
    expect(source).toContain("@click=\"openConfigPanelFromMenu\"");
    expect(source).not.toContain("@click=\"handleSlashCommandMenu\"");
    expect(source).not.toContain("斜杠命令");
  });

  it("opens composer action panels above the input with a two-column config layout", () => {
    const source = fs.readFileSync(
      path.resolve(
        __dirname,
        "../../../src/pages/conversation-detail/ConversationDetailInteractivePane.vue",
      ),
      "utf8",
    );
    const styles = fs.readFileSync(
      path.resolve(__dirname, "../../../src/pages/conversation-detail/index.scss"),
      "utf8",
    );

    const composerPanelIndex = source.indexOf('v-if="showComposerPanel"');
    const inputMainRowIndex = source.indexOf('class="input-main-row"');
    const inputToolRowIndex = source.indexOf('v-if="showInputToolMenu"');
    expect(composerPanelIndex).toBeGreaterThan(-1);
    expect(inputMainRowIndex).toBeGreaterThan(-1);
    expect(inputToolRowIndex).toBeGreaterThan(-1);
    expect(composerPanelIndex).toBeLessThan(inputMainRowIndex);
    expect(composerPanelIndex).toBeLessThan(inputToolRowIndex);

    expect(source).toContain("composerConfigNavItems");
    expect(source).toContain("activeComposerConfigItem");
    expect(source).toContain('class="composer-panel__config-layout"');
    expect(source).toContain('class="composer-panel__config-nav"');
    expect(source).toContain('class="composer-panel__config-detail"');
    expect(source).toContain("@click=\"activateComposerConfigItem(item.key)\"");
    expect(source).toContain('v-if="composerPanelMode === \'quick_reply\'"');

    expect(styles).toMatch(/\.composer-panel__config-layout\s*\{[\s\S]*display:\s*grid;/);
    expect(styles).toMatch(
      /\.composer-panel__config-layout\s*\{[\s\S]*grid-template-columns:\s*220rpx minmax\(0, 1fr\);/,
    );
    expect(styles).toContain(".composer-panel__config-nav");
    expect(styles).toContain(".composer-panel__config-detail");
  });

  it("defers inactive pane project and config loading", () => {
    const source = fs.readFileSync(
      path.resolve(
        __dirname,
        "../../../src/pages/conversation-detail/ConversationDetailInteractivePane.vue",
      ),
      "utf8",
    );

    expect(source).toMatch(
      /\[\s*firstString\(props\.instanceKey\),\s*Number\(props\.folderId \|\| 0\),\s*Boolean\(props\.active\),?\s*\]/,
    );
    expect(source).toContain("if (!active) return");
    expect(source).toContain("Boolean(props.active),");
    expect(source).toContain(
      "if (!conversationId || !agentType || !active) return",
    );
  });

  it("wires composer mentions into the actual interactive composer", () => {
    const source = fs.readFileSync(
      path.resolve(
        __dirname,
        "../../../src/pages/conversation-detail/ConversationDetailInteractivePane.vue",
      ),
      "utf8",
    );

    expect(source).toContain('@input="handleComposerInput"');
    expect(source).toContain('v-if="showMentionPanel"');
    expect(source).toContain('@click="insertMentionReference(item)"');
    expect(source).toContain("@/services/composerReferences");
    expect(source).toContain("function ensureMentionSourcesLoaded()");
    expect(source).toContain("getRemoteProjectFileTree");
    expect(source).toContain("loadRemoteProjectConversations");
    expect(source).toContain("getRemoteGitLog");
  });

  it("lets users dismiss the slash command panel for the current trigger", () => {
    const source = fs.readFileSync(
      path.resolve(
        __dirname,
        "../../../src/pages/conversation-detail/ConversationDetailInteractivePane.vue",
      ),
      "utf8",
    );

    expect(source).toContain('v-if="showSlashPanel"');
    expect(source).toContain('@click.stop="dismissSlashPanel"');
    expect(source).toContain('const dismissedSlashTriggerKey = ref("")');
    expect(source).toContain(
      "dismissedSlashTriggerKey.value !== slashTriggerKey.value",
    );
  });

  it("renders each mounted swiper item with an interactive per-conversation pane", () => {
    const source = fs.readFileSync(
      path.resolve(
        __dirname,
        "../../../src/pages/conversation-detail/index.vue",
      ),
      "utf8",
    );

    expect(source).toContain("<ConversationDetailInteractivePane");
    expect(source).toContain('v-if="shouldRenderDetailTabPage(index)"');
    expect(source).not.toContain('v-else-if="shouldRenderDetailTabPage(index)"');
    expect(source).toContain(':conversation-id="tab.conversationId"');
    expect(source).toContain(':folder-id="tab.folderId"');
    expect(source).toContain(':active="isActiveDetailTabPage(index)"');
    expect(source).toContain("function mountDetailTabWindow(index: number)");
    expect(source).toContain(':key="resolveDetailShellTabKey(tab)"');
    expect(source).toContain("resolveDetailActiveTabIndex({");
    expect(source).not.toContain(
      ':key="tab.tabId || tab.conversationId || index"',
    );
    expect(source).not.toContain("<ConversationDetailReadonlyTimeline");
  });

  it("keeps active tab focus local instead of syncing it back to opened tabs", () => {
    const source = fs.readFileSync(
      path.resolve(
        __dirname,
        "../../../src/pages/conversation-detail/index.vue",
      ),
      "utf8",
    );

    expect(source).toContain('activation: "preserve"');
    expect(source).not.toContain('activation: "allow"');
    expect(source).not.toContain(
      "const remoteActiveIndex = detailShellTabs.value.findIndex((tab) => tab.active)",
    );
  });

  it("updates tab selection before deferring heavy conversation loading", () => {
    const source = fs.readFileSync(
      path.resolve(
        __dirname,
        "../../../src/pages/conversation-detail/index.vue",
      ),
      "utf8",
    );

    expect(source).toMatch(
      /captureActiveDetailLocalState\(\)[\s\S]*syncDetailTabSelection\(safeIndex\)[\s\S]*if \(shouldDeferDetailTabSwitch/,
    );
  });

  it("keeps custom detail backgrounds shared across opened tabs", () => {
    const source = fs.readFileSync(
      path.resolve(
        __dirname,
        "../../../src/pages/conversation-detail/index.vue",
      ),
      "utf8",
    );

    expect(source).toContain(
      "return `${DETAIL_BACKGROUND_STORAGE_PREFIX}:${instanceKey}:shared`",
    );
    expect(source).toContain("function buildLegacyDetailBackgroundStorageKey");
    expect(source).toContain(
      "persistDetailBackgroundSnapshot(legacySnapshot.url)",
    );
    expect(source).toContain("removeLegacyDetailBackgroundSnapshots()");
    expect(source).not.toContain(
      "function buildDetailBackgroundStorageKey(targetConversationId",
    );
  });

  it("exposes current-tab conversation actions from the detail more menu", () => {
    const source = fs.readFileSync(
      path.resolve(
        __dirname,
        "../../../src/pages/conversation-detail/index.vue",
      ),
      "utf8",
    );

    expect(source).toContain('{ name: "重命名", color: "#2979ff" }');
    expect(source).toContain('{ name: "更改状态", color: "#2979ff" }');
    expect(source).toContain('{ name: "删除", color: "#fa3534" }');
    expect(source).toContain('title: "重命名会话"');
    expect(source).toContain('gateway.call("update_conversation_title"');
    expect(source).toContain('gateway.call("update_conversation_status"');
    expect(source).toContain('title: "确认删除"');
    expect(source).toContain('confirmText: "删除"');
    expect(source).toContain('gateway.call("delete_conversation"');
    expect(source).toContain("closeConversationTab({");
  });

  it("restores and forwards the detail theme from the detail more menu", () => {
    const source = fs.readFileSync(
      path.resolve(
        __dirname,
        "../../../src/pages/conversation-detail/index.vue",
      ),
      "utf8",
    );

    expect(source).toContain("DETAIL_THEME_STORAGE_KEY");
    expect(source).toContain("DETAIL_CYBER_MODE_STORAGE_KEY");
    expect(source).toContain("buildDetailThemeMenuActions(detailTheme.value)");
    expect(source).toContain('else if (action === "详情页主题")');
    expect(source).toContain(
      'title: `${target.name.replace(" · 当前", "")}已启用`',
    );
    expect(source).toContain("restoreCyberModePreference()");
    expect(source).toContain("shouldShowDetailBackgroundImage");
    expect(source).toContain("showDetailBackgroundImage");
    expect(source).toContain("page--cyber");
    expect(source).toContain("page--sweet");
  });

  it("uses lighter translucent content surfaces over custom backgrounds", () => {
    const detailStyles = fs.readFileSync(
      path.resolve(
        __dirname,
        "../../../src/pages/conversation-detail/index.scss",
      ),
      "utf8",
    );
    const bodySource = fs.readFileSync(
      path.resolve(
        __dirname,
        "../../../src/pages/conversation-detail/ConversationDetailBody.vue",
      ),
      "utf8",
    );
    const bubbleSource = fs.readFileSync(
      path.resolve(__dirname, "../../../src/components/MessageBubble.vue"),
      "utf8",
    );

    expect(bodySource).toContain(
      "var(--up-card-bg-color, #ffffff) 38%, transparent 62%",
    );
    expect(bodySource).toContain("backdrop-filter: blur(12rpx)");
    expect(bubbleSource).toContain(
      "var(--up-primary, #2979ff) 54%, transparent 46%",
    );
    expect(bubbleSource).toContain("backdrop-filter: blur(0.1rem)");
    expect(bubbleSource).toContain(
      "var(--up-card-bg-color, #ffffff) 30%, transparent 70%",
    );
    expect(detailStyles).toContain("backdrop-filter: blur(10rpx)");
    expect(detailStyles).toContain(
      "var(--up-card-bg-color, #ffffff) 32%, transparent 68%",
    );
    expect(detailStyles).toContain(
      "var(--up-card-bg-color, #ffffff) 22%, transparent 78%",
    );
    expect(detailStyles).toContain("send-btn--translucent");
    expect(detailStyles).toContain(
      "var(--up-primary, #2979ff) 48%, transparent 52%",
    );
    expect(detailStyles).not.toContain("backdrop-filter: blur(22rpx)");
    expect(bubbleSource).not.toContain("backdrop-filter: blur(0.1625rem)");
  });

  // 以前这条是对 `MessageBubble.vue` 的源码文本断言（`toContain("buildGoalDisplayParts(...)")`
  // 加两个 `indexOf` 比大小）。分组循环抽进 `buildBubbleDisplayParts` 之后，那些字面量
  // 不在气泡里了；更重要的是文本断言本来就挡不住行为回归 —— 气泡曾调用一个没 import
  // 的函数（`isEmptyThinkingPart`），非流式轮次每次重算都 ReferenceError，而这类断言全绿。
  // 改成对分组函数的行为断言。
  it("folds goal lifecycles and subagents out before generic tool grouping", () => {
    const goalOutput = (status: string) =>
      JSON.stringify({ goal: { objective: "Ship mobile goal card", status } });
    const parts = [
      {
        type: "tool_call",
        tool_call: {
          id: "task-1",
          name: "Task",
          input: { subagent_type: "Explore" },
          status: "completed",
        },
      },
      { type: "tool_call", tool_call: { id: "read-1", name: "Read", status: "completed" } },
      { type: "tool_call", tool_call: { id: "grep-1", name: "Grep", status: "completed" } },
      {
        type: "tool_call",
        tool_call: {
          id: "codex-goal-1",
          name: "create_goal",
          input: { objective: "Ship mobile goal card" },
          output: goalOutput("active"),
          status: "completed",
        },
      },
      { type: "text", text: "Working" },
      {
        type: "tool_call",
        tool_call: {
          id: "codex-goal-2",
          name: "update_goal",
          input: { status: "complete", objective: "Ship mobile goal card" },
          output: goalOutput("complete"),
          status: "completed",
        },
      },
    ] as any[];

    const rendered = buildBubbleDisplayParts({ parts });

    // 三类块各自独立，且顺序与来源一致。
    expect(rendered.map((part) => part.type)).toEqual([
      "subagent_call",
      "tool_call_group",
      "goal_run",
    ]);
    // goal 标记工具**不能**落进通用工具组 —— 否则 goal 卡不出现，用户只看到
    // 「调用 2 个工具」，其中一个叫 create_goal。
    const group = rendered.find((part) => part.type === "tool_call_group") as any;
    expect(group.tool_calls.map((call: any) => call.id)).toEqual(["read-1", "grep-1"]);
    // 子智能体同理不能被并进工具组：它自带一整段会话，并进去就退化成一行摘要，
    // 而它的正文会把父气泡撑到极长（本次改动的起因）。
    const subagent = rendered.find((part) => part.type === "subagent_call") as any;
    expect(subagent.tool_call.id).toBe("task-1");
  });

  it("keeps the goal_run branch ahead of tool_call_group in the bubble template", () => {
    const bubbleSource = fs.readFileSync(
      path.resolve(__dirname, "../../../src/components/MessageBubble.vue"),
      "utf8",
    );

    expect(bubbleSource).toContain(
      'import GoalToolCallBlock from "./GoalToolCallBlock.vue"',
    );
    expect(bubbleSource).toContain(
      'import SubagentCapsuleBlock from "./SubagentCapsuleBlock.vue"',
    );
    // 三个分支都要在模板里真的存在 —— 分组函数产出了某个 type 而模板没有对应分支时，
    // 那一块会静默消失（v-if 链全部落空，什么都不渲染）。
    expect(bubbleSource.indexOf("part.type === 'goal_run'")).toBeGreaterThan(-1);
    expect(bubbleSource.indexOf("part.type === 'subagent_call'")).toBeGreaterThan(-1);
    expect(bubbleSource.indexOf("part.type === 'goal_run'")).toBeLessThan(
      bubbleSource.indexOf("part.type === 'tool_call_group'"),
    );
  });

  // agent 配置面板（模型 / 推理强度 / 权限）整套已随 composer 迁到
  // `ConversationDetailInteractivePane.vue`，所以这条不变量的检查对象也要跟着换文件 ——
  // 继续读 index.vue 只会锁住一段已经删掉的死代码。
  //
  // 不变量本身没变：连接 attach 时必须**重新拉取**远端配置，不能把本地缓存的选择
  // 回放进一个活会话（那会把用户在别处改过的模型/权限悄悄改回来）。
  it("does not replay cached config into a live session when the connection attaches", () => {
    const paneSource = fs.readFileSync(
      path.resolve(
        __dirname,
        "../../../src/pages/conversation-detail/ConversationDetailInteractivePane.vue",
      ),
      "utf8",
    );

    expect(paneSource).toContain("void loadDetailAgentConfig()");
    expect(paneSource).not.toContain("void applyPendingComposerConfig()");

    // index.vue 只保留仍归它所有的 `/` 命令表，不再持有 agent 配置。
    const pageSource = fs.readFileSync(
      path.resolve(
        __dirname,
        "../../../src/pages/conversation-detail/index.vue",
      ),
      "utf8",
    );
    expect(pageSource).toContain("conversationId.value || null");
    expect(pageSource).not.toContain("loadDetailAgentConfig");
  });

  it("does not append the route conversation while hydrating detail tabs", () => {
    const source = fs.readFileSync(
      path.resolve(
        __dirname,
        "../../../src/pages/conversation-detail/index.vue",
      ),
      "utf8",
    );

    expect(source).toContain('gateway.call<unknown>("list_opened_tabs")');
    expect(source).not.toContain(`folderId: folderId.value,
      conversationId: conversationId.value,
      agentType: currentAgentType.value,
      activation: "preserve",
      origin: "mcode-mobile",`);
  });

  it("measures composer chrome from the active swiper page only", () => {
    const source = fs.readFileSync(
      path.resolve(
        __dirname,
        "../../../src/pages/conversation-detail/index.vue",
      ),
      "utf8",
    );

    expect(source).toContain("detail-shell__page--active");
    expect(source).toContain(
      '.select(".detail-shell__page--active .input-status-row")',
    );
    expect(source).toContain(
      '.select(".detail-shell__page--active .composer-stack")',
    );
    expect(source).toContain(
      '.select(".detail-shell__page--active .input-main-row")',
    );
    expect(source).toContain(
      '.select(".detail-shell__page--active .input-tool-menu")',
    );
    expect(source).toContain(
      '.select(".detail-shell__page--active .message-list__content")',
    );
  });

  it("subtracts the navbar placeholder from the swiper shell height", () => {
    const source = fs.readFileSync(
      path.resolve(
        __dirname,
        "../../../src/pages/conversation-detail/index.vue",
      ),
      "utf8",
    );

    expect(source).toContain("resolveDetailShellViewportHeight");
    expect(source).toContain("hasNavbarPlaceholder: true");
    expect(source).not.toContain(
      "const height = Math.max(0, viewportHeight.value || getDetailViewportHeight())",
    );
  });

  it("extends the detail navbar background into the phone status bar", () => {
    const source = fs.readFileSync(
      path.resolve(
        __dirname,
        "../../../src/pages/conversation-detail/index.vue",
      ),
      "utf8",
    );
    const html = fs.readFileSync(
      path.resolve(__dirname, "../../../index.html"),
      "utf8",
    );

    expect(source).toContain(':statusBarBgColor="navbarStatusBarBgColor"');
    expect(source).toContain('detailTheme.value === "matrix"');
    expect(source).toContain('detailTheme.value === "sweet"');
    expect(source).toContain(
      "const navbarBgColor = computed(() => navbarStatusBarBgColor.value)",
    );
    expect(source).toContain(
      'height = statusBarHeight > 0 ? `${statusBarHeight}px` : "env(safe-area-inset-top)"',
    );
    expect(source).toContain("syncIosStandaloneStatusBar({");
    expect(html).toContain(
      '<meta name="apple-mobile-web-app-status-bar-style" content="black" />',
    );
    expect(html).toContain('<meta name="theme-color" content="#f3f4f6" />');
  });

  it("does not add safe-area padding to the bottom scroll anchor", () => {
    const source = fs.readFileSync(
      path.resolve(
        __dirname,
        "../../../src/pages/conversation-detail/index.scss",
      ),
      "utf8",
    );

    expect(source).toMatch(/\.list-bottom\s*\{\s*height:\s*34rpx;\s*\}/);
  });

  it("keeps the composer card above the bottom safe area", () => {
    const source = fs.readFileSync(
      path.resolve(
        __dirname,
        "../../../src/pages/conversation-detail/ConversationDetailBody.vue",
      ),
      "utf8",
    );

    expect(source).toMatch(
      /\.composer-stack\s*\{[\s\S]*bottom:\s*calc\(env\(safe-area-inset-bottom\) \+ 10rpx\);/,
    );
    expect(source).toMatch(
      /\.composer-safe-area\s*\{[\s\S]*height:\s*calc\(env\(safe-area-inset-bottom\) \+ 12rpx\);[\s\S]*background:\s*transparent;/,
    );
    expect(source).not.toContain(
      "padding-bottom: calc(16rpx + env(safe-area-inset-bottom))",
    );
  });

  it("locks the outer detail page so only the message scroll-view scrolls", () => {
    const source = fs.readFileSync(
      path.resolve(
        __dirname,
        "../../../src/pages/conversation-detail/index.scss",
      ),
      "utf8",
    );

    expect(source).toMatch(
      /\.page\s*\{[\s\S]*height:\s*100%;[\s\S]*overflow:\s*hidden;[\s\S]*overscroll-behavior:\s*none;/,
    );
    expect(source).toMatch(
      /\.detail-container\s*\{[\s\S]*position:\s*fixed;[\s\S]*inset:\s*0;[\s\S]*overflow:\s*hidden;[\s\S]*overscroll-behavior:\s*none;/,
    );
  });

  it("keeps per-tab scrolling inside the detail body scroll-view", () => {
    const source = fs.readFileSync(
      path.resolve(
        __dirname,
        "../../../src/pages/conversation-detail/index.vue",
      ),
      "utf8",
    );

    expect(source).not.toContain("onPageScroll");
    expect(source).not.toContain("uni.pageScrollTo");
    expect(source).not.toContain("visualViewport");
    expect(source).toContain(
      "messageScrollTop.value = Number.MAX_SAFE_INTEGER",
    );
    expect(source).toContain(
      "messageScrollIntoView.value = getBottomAnchorId()",
    );
  });

  it("keeps the interactive pane capable of sending attachments", () => {
    const source = fs.readFileSync(
      path.resolve(
        __dirname,
        "../../../src/pages/conversation-detail/ConversationDetailInteractivePane.vue",
      ),
      "utf8",
    );

    expect(source).toContain("'attachments-preview'");
    expect(source).toContain("handleChooseImages");
    expect(source).toContain("handleChooseFiles");
    expect(source).toContain("uploadPickedFiles");
    expect(source).toContain("prepareDraftForSend");
  });

  it("resyncs layout when interactive composer chrome changes height", () => {
    const source = fs.readFileSync(
      path.resolve(
        __dirname,
        "../../../src/pages/conversation-detail/ConversationDetailInteractivePane.vue",
      ),
      "utf8",
    );

    expect(source).toMatch(
      /function toggleInputToolRow\(\)[\s\S]*scheduleViewportSync\(\)/,
    );
    expect(source).toMatch(
      /function toggleComposerPanel\([\s\S]*scheduleViewportSync\(\)/,
    );
  });

  it("loads the parent detail through a server tail history window", () => {
    const source = fs.readFileSync(
      path.resolve(
        __dirname,
        "../../../src/pages/conversation-detail/index.vue",
      ),
      "utf8",
    );

    expect(source).toContain("buildTailHistoryRequest");
    expect(source).toContain("requireConversationHistoryWindow");
    expect(source).toContain("applyRemoteHistoryWindowDetail");
    expect(source).toContain("runtime.setConversationHistoryWindow");
  });

  it("loads older history through the server page window protocol", () => {
    const source = fs.readFileSync(
      path.resolve(
        __dirname,
        "../../../src/pages/conversation-detail/ConversationDetailInteractivePane.vue",
      ),
      "utf8",
    );

    expect(source).toContain("buildOlderHistoryRequest");
    expect(source).toContain("requireConversationTurnsPage");
    expect(source).toContain("hasOlderConversationHistory");
    expect(source).toContain("canApplyOlderHistoryPage");
    expect(source).toContain("prependHistoryPageTurns");
    expect(source).toContain("advanceConversationHistoryWindow");
    expect(source).toContain("get_folder_conversation_turns");
    expect(source).toContain("runtime.setConversationHistoryWindow");
    expect(source).not.toContain("getOlderTurns");
    expect(source).not.toContain("countConversationTurns");
    expect(source).not.toContain("getOldestCursorFromPersistedTurns");
    expect(source).not.toContain("const oldestLoadedCursor");
    expect(source).not.toContain("HISTORY_LOADING_MIN_MS");
  });

  it("triggers the older page when the user keeps swiping up, not down", () => {
    const source = fs.readFileSync(
      path.resolve(
        __dirname,
        "../../../src/pages/conversation-detail/ConversationDetailInteractivePane.vue",
      ),
      "utf8",
    );

    // uni 的 scroll-view 里 `deltaY = lastScrollTop - scrollTop`，**向上滑是正值**
    // （uni 自己的 scrolltoupper 判定用的就是 `lastScrollTop - scrollTop > 0`）。
    // 写成 `deltaY < 0` 语义恰好反了：只在「已经贴顶还继续往下滑」时才触发，
    // 连续上滑加载从此从未生效，只剩 @scrolltoupper 的**边沿**触发在干活 ——
    // 而边沿触发在阈值内静止后不会复发，用户会觉得列表卡住了。
    expect(source).toMatch(/if \(deltaY > 0 && scrollTopValue <= 120\)\s*\{?\s*void loadOlderTurns\(\)/);
    // 不断言 `not.toContain("deltaY < 0")` —— 上面那段解释旧 bug 的注释里就引用了
    // 这个错写法，断言会打到注释上。方向由上面那条正向匹配钉住即可。
    // 边沿触发仍要保留：贴顶那一下靠它，靠 deltaY 分支的 <=120 兜不住惯性滚动。
    expect(source).toContain('@message-scroll-upper="handleMessageListScrollUpper"');
  });

  it("refreshes the latest detail on entry so history paging starts with a real window", () => {
    const pageSource = fs.readFileSync(
      path.resolve(
        __dirname,
        "../../../src/pages/conversation-detail/index.vue",
      ),
      "utf8",
    );

    const probeSource = pageSource.slice(
      pageSource.indexOf("async function ensureConversationHistoryWindow(input: {"),
      pageSource.indexOf("async function hydrateRemoteConversationMetadata(input: {"),
    );
    expect(probeSource).not.toBe("");

    // 保留 watcher 的并发保护：它只负责异常重试/流式结束后的自愈，正常入口不再依赖它
    // 建立窗口。
    expect(probeSource).toContain("if (input.runtimeSession.historyWindow) return");
    // 流式中/有 in-flight 用户轮次时建不出窗口：窗口的语义是「localTurns[0] 的全局
    // 下标」，而此刻我们不知道 localTurns[0] 落在哪，硬记一个尾窗坐标会造成不可
    // 恢复的错位（见 resolvePreservedTurnsWindow）。
    expect(probeSource).toContain(
      "if (hasVolatileRuntimeState(input.runtimeSession)) return",
    );
    // 并发去重：watcher 与 loadConversation 会同时走到这里。
    expect(probeSource).toContain(
      "if (historyWindowProbeConversationIds.has(input.conversationId)) return",
    );
    expect(probeSource).toMatch(
      /historyWindowProbeConversationIds\.add\([\s\S]*finally \{[\s\S]*historyWindowProbeConversationIds\.delete\(/,
    );
    // 期间可能切走或被别的路径建好窗口，不能覆盖后者。
    expect(probeSource).toContain(
      "if (session !== input.runtimeSession || session.historyWindow) return",
    );

    // 自愈 watcher 仍保留，用于入口请求失败或流式期间无法安全更新窗口时重试。
    expect(pageSource).toMatch(
      /hasVolatileRuntimeState\(runtimeSession\),[\s\S]*Number\(runtimeSession\?\.localTurns\?\.length \|\| 0\) > 0,/,
    );
    expect(pageSource).toMatch(
      /if \(!targetConversationId \|\| hasWindow \|\| volatile \|\| !hasTurns\) return/,
    );
    expect(pageSource).toMatch(
      /void ensureConversationHistoryWindow\(\{[\s\S]*?conversationId: targetConversationId,/,
    );

    // 热运行时和 SQLite 水合都必须直接发起最新详情请求；不能只有热运行时的强制
    // 对账才请求，也不能在本地水合遇到 volatile 状态时静默跳过。
    expect(pageSource).toMatch(
      /if \(hasHotRuntime\) \{[\s\S]*?void reconcileRemoteTurnsAfterResume\(/,
    );
    expect(pageSource).toMatch(
      /\} else if \(localTurns\.length > 0\) \{[\s\S]*?void reconcileRemoteTurnsAfterLocalHydrate\(/,
    );
    const localReconcileSource = pageSource.slice(
      pageSource.indexOf("async function reconcileRemoteTurnsAfterLocalHydrate(input: {"),
      pageSource.indexOf("function summarizeDetailTurns(detail: any)"),
    );
    expect(localReconcileSource).not.toMatch(
      /if \(hasVolatileRuntimeState\(input\.runtimeSession\)\) return/,
    );
    const applyWindowSource = pageSource.slice(
      pageSource.indexOf("async function applyRemoteHistoryWindowDetail(input: {"),
      pageSource.indexOf("async function ensureConversationHistoryWindow(input: {"),
    );
    expect(applyWindowSource).toMatch(
      /const shouldKeepExistingTurns =[\s\S]*Boolean\(input\.runtimeSession\.historyWindow\) &&/,
    );
    expect(applyWindowSource).toContain("persistTurns: !shouldKeepExistingTurns");

    // 最新详情请求本身就是窗口建立请求，不应再串行刷新 relay auth。
    const fetchDetailSource = pageSource.slice(
      pageSource.indexOf("async function fetchRemoteConversationDetail("),
      pageSource.indexOf("async function applyRemoteHistoryWindowDetail(input: {"),
    );
    expect(fetchDetailSource).toContain("const gateway = await getDetailGateway()");
    expect(fetchDetailSource).not.toContain("refreshAuth: true");
  });

  it("keeps older server pages remote-only and removes the retired SQLite cursor protocol", () => {
    const paneSource = fs.readFileSync(
      path.resolve(
        __dirname,
        "../../../src/pages/conversation-detail/ConversationDetailInteractivePane.vue",
      ),
      "utf8",
    );
    const pageSource = fs.readFileSync(
      path.resolve(
        __dirname,
        "../../../src/pages/conversation-detail/index.vue",
      ),
      "utf8",
    );
    const scrollStateSource = fs.readFileSync(
      path.resolve(
        __dirname,
        "../../../src/pages/conversation-detail/detailScrollState.ts",
      ),
      "utf8",
    );
    const tabStateSource = fs.readFileSync(
      path.resolve(
        __dirname,
        "../../../src/pages/conversation-detail/detailTabState.ts",
      ),
      "utf8",
    );

    expect(paneSource).not.toContain("persistConversationTurns");
    expect(pageSource).not.toContain("getOlderTurns");
    expect(pageSource).not.toContain("countConversationTurns");
    expect(pageSource).not.toContain("oldestLoadedCursor");
    expect(pageSource).not.toContain("hasMoreHistory");
    expect(pageSource).not.toContain("HISTORY_LOADING_MIN_MS");
    expect(scrollStateSource).not.toContain("HistoryPageCursor");
    expect(scrollStateSource).not.toContain("getOldestCursorFromPersistedTurns");
    expect(scrollStateSource).not.toContain("restoreHistoryCursorFromCache");
    expect(tabStateSource).not.toContain("oldestLoadedCursor");
    expect(tabStateSource).not.toContain("hasMoreHistory");
  });

  it("waits for the user-message event instead of inserting a local optimistic turn", () => {
    const paneSource = fs.readFileSync(
      path.resolve(
        __dirname,
        "../../../src/pages/conversation-detail/ConversationDetailInteractivePane.vue",
      ),
      "utf8",
    );
    const pageSource = fs.readFileSync(
      path.resolve(__dirname, "../../../src/pages/conversation-detail/index.vue"),
      "utf8",
    );
    const runtimeSource = fs.readFileSync(
      path.resolve(__dirname, "../../../src/stores/conversationRuntime.ts"),
      "utf8",
    );
    const timelineSource = fs.readFileSync(
      path.resolve(__dirname, "../../../src/stores/conversationTimeline.ts"),
      "utf8",
    );
    const promptSendSource = fs.readFileSync(
      path.resolve(
        __dirname,
        "../../../src/pages/conversation-detail/detailPromptSend.ts",
      ),
      "utf8",
    );

    expect(paneSource).not.toContain("addOptimisticUserMessage");
    expect(paneSource).not.toContain("removeOptimisticUserMessage");
    expect(paneSource).not.toContain("findLatestOptimisticTurnId");
    expect(pageSource).not.toContain("addOptimisticUserMessage");
    expect(pageSource).not.toContain("removeOptimisticUserMessage");
    expect(pageSource).not.toContain("findLatestOptimisticTurnId");
    expect(pageSource).not.toContain("optimisticJson");
    expect(runtimeSource).not.toContain("addOptimisticUserMessage");
    expect(runtimeSource).not.toContain("removeOptimisticUserMessage");
    expect(runtimeSource).not.toContain("optimisticTurns");
    expect(timelineSource).not.toContain("optimisticTurns");
    expect(timelineSource).not.toContain('"optimistic"');
    expect(promptSendSource).not.toContain("optimisticText");
    expect(promptSendSource).not.toContain("findLatestOptimisticTurnId");
  });

  it("keeps initial history loading feedback per interactive pane", () => {
    const source = fs.readFileSync(
      path.resolve(
        __dirname,
        "../../../src/pages/conversation-detail/ConversationDetailInteractivePane.vue",
      ),
      "utf8",
    );

    expect(source).toContain("const initialHistoryLoading = ref(false)");
    // 文案分支本身在 detailHistoryIndicatorPresentation.ts 里，有独立的单元测试。
    // 这里只钉住「面板确实把四个来源都喂进了状态机」——少喂一个就会退化成某个
    // 状态永远显示不出来（例如漏 initialLoading 会先闪一下「没有更多历史了」）。
    expect(source).toContain("resolveDetailHistoryIndicatorPresentation({");
    expect(source).toMatch(/hasMessages: messages\.value\.length > 0/);
    expect(source).toMatch(/hasMore: hasMoreHistory\.value/);
    expect(source).toMatch(/loadingOlder: loadingOlder\.value/);
    expect(source).toMatch(/initialLoading: initialHistoryLoading\.value/);
    // 窗口坐标未知必须单独传，不能让 hasMore: false 兼任两种语义 —— 那会在刚进
    // 详情页时显示「没有更多历史了」，等探测回来才变可翻页（用户报的现象）。
    expect(source).toMatch(/windowKnown: historyWindowKnown\.value/);
    // 流式期间必须**允许**翻页：唯一的前置条件是窗口说得出还有更早历史。
    // 曾经这里还有 `|| hasVolatileHistoryRuntimeState(runtimeSession)`，导致回复
    // 生成中完全无法往上看历史；连带那个把 liveMessage.content 塞进指纹的
    // historyRuntimeFingerprint 一起删除（前插不依赖尾部状态）。
    expect(source).toMatch(
      /if \(!hasOlderConversationHistory\(historyWindow\)\) return;/,
    );
    // 只断言**代码**里没有了 —— 注释里保留着「为什么删」，那段说明有价值，
    // 所以不能裸搜函数名（注释里带反引号的提及会误报）。这里盯的是三个真实语法位置：
    // 函数声明、`||` 早退里的调用、以及传参。
    expect(source).not.toMatch(/function hasVolatileHistoryRuntimeState\b/);
    expect(source).not.toMatch(/function historyRuntimeFingerprint\b/);
    expect(source).not.toMatch(/\|\|\s*hasVolatileHistoryRuntimeState\(/);
    expect(source).not.toContain("runtimeFingerprint:");
    expect(source).toMatch(
      /const historyWindowKnown = computed\(\(\) => session\.value\.historyWindow != null\)/,
    );
    expect(source).toMatch(/errorMessage: historyLoadErrorMessage\.value/);
    expect(source).toMatch(/pullDistance: historyPullDistance\.value/);
    expect(source).toMatch(/pullThreshold: HISTORY_REFRESHER_THRESHOLD/);
    expect(source).toContain('v-if="historyIndicator.visible"');
    expect(source).toContain('v-if="historyIndicator.busy"');
    expect(source).toContain(
      "function beginInitialHistoryLoading(conversationId: number, token: number)",
    );
    expect(source).toContain(
      "function finishInitialHistoryLoading(conversationId: number, token: number)",
    );
    expect(source).toContain("Boolean(props.initialLoading)");
    expect(source).toMatch(
      /const token = \+\+historySyncToken[\s\S]*beginInitialHistoryLoading\(conversationId, token\)/,
    );
    expect(source).not.toContain("ensureHistoryCursorFromLoadedMessages");
  });

  it("drives the history indicator through the scroll-view refresher, in document flow", () => {
    const bodySource = fs.readFileSync(
      path.resolve(
        __dirname,
        "../../../src/pages/conversation-detail/ConversationDetailBody.vue",
      ),
      "utf8",
    );
    const paneSource = fs.readFileSync(
      path.resolve(
        __dirname,
        "../../../src/pages/conversation-detail/ConversationDetailInteractivePane.vue",
      ),
      "utf8",
    );
    const styleSource = fs.readFileSync(
      path.resolve(__dirname, "../../../src/pages/conversation-detail/index.scss"),
      "utf8",
    );

    // 指示行必须在 `.message-list__content` **里面**且排在 `#content` 前面。它曾经是
    // scroll-view 的兄弟节点 + `position: fixed`，于是浮在第一条消息上面挡住内容。
    const contentOpen = bodySource.indexOf('<view class="message-list__content"');
    const historySlot = bodySource.indexOf('<slot name="history">');
    const contentSlot = bodySource.indexOf('<slot name="content">');
    expect(contentOpen).toBeGreaterThan(-1);
    expect(historySlot).toBeGreaterThan(contentOpen);
    expect(historySlot).toBeLessThan(contentSlot);

    // 详情页禁了页面级下拉（pages.json enablePullDownRefresh:false，且 .page 锁了
    // overflow），手势只能来自 scroll-view 自己的 refresher。
    expect(bodySource).toContain(':refresher-enabled="refresherEnabled"');
    expect(bodySource).toContain(':refresher-triggered="refresherTriggered"');
    expect(bodySource).toContain(':refresher-threshold="refresherThreshold"');
    // "none" 才会渲染 refresher 插槽；任何其它值都换成 uni 自带的绿色转圈。
    expect(bodySource).toContain('refresher-default-style="none"');
    expect(bodySource).toContain('@refresherrefresh="emit(\'refresher-refresh\')"');
    expect(bodySource).toContain(
      "@refresherpulling=\"emit('refresher-pulling', $event)\"",
    );

    // refresher-triggered 是**受控** prop：uni 只在它变 false 时收回 refreshing 态。
    // 少了这句 finally，转圈会一直转下去。
    expect(paneSource).toMatch(
      /historyRefresherTriggered\.value = true;[\s\S]*await loadOlderTurns\(\);[\s\S]*finally \{[\s\S]*historyRefresherTriggered\.value = false;/,
    );
    // uni 的 _setRefreshState 在 refresherEnabled 为 false 时**直接 return**，会把
    // restore 吞掉、刷新态永久卡死。翻到底那一次 canPull 恰好变 false，所以整个下拉
    // 生命周期内必须由 historyRefresherActive 强行按住 enabled，且它要在 restore
    // 落地（await nextTick）之后才放开。
    expect(paneSource).toContain(
      "Boolean(active && (historyIndicator.canPull || historyRefresherActive))",
    );
    expect(paneSource).toMatch(
      /historyRefresherTriggered\.value = false;[\s\S]{0,200}?await nextTick\(\);[\s\S]{0,200}?historyRefresherActive\.value = false;/,
    );
    // 没有更早历史时关掉手势，否则能拽出一片空白却什么都不发生。
    expect(paneSource).toContain("historyIndicator.canPull");
    // 只有 error 态可点；其余状态点击必须无副作用。
    expect(paneSource).toMatch(
      /function handleHistoryIndicatorTap\(\) \{\s*if \(!historyIndicator\.value\.retryable\) return;/,
    );

    // 行高钉死：前插更早历史后要按锚点还原滚动位置，还原量依赖「插入了多高的内容」，
    // 指示行随文案变高就会让这个差值带上抖动，锚点漂。
    const historyRule = styleSource.slice(
      styleSource.indexOf("\n.history-status {"),
      styleSource.indexOf("\n.history-status--retryable"),
    );
    expect(historyRule).toContain("min-height: 64rpx");
    expect(historyRule).not.toContain("position: fixed");
  });

  it("shows explicit loading, failure, and empty states for conversation content", () => {
    const detailSource = fs.readFileSync(
      path.resolve(
        __dirname,
        "../../../src/pages/conversation-detail/index.vue",
      ),
      "utf8",
    );
    const paneSource = fs.readFileSync(
      path.resolve(
        __dirname,
        "../../../src/pages/conversation-detail/ConversationDetailInteractivePane.vue",
      ),
      "utf8",
    );

    expect(detailSource).toContain("buildDetailFallbackTab");
    expect(detailSource).toContain("if (!conversationId.value) return");
    const initializeShellSource = detailSource.slice(
      detailSource.indexOf("async function initializeDetailTabsShell()"),
      detailSource.indexOf("function handleDetailTabChange"),
    );
    expect(
      initializeShellSource.indexOf("if (!detailTabsEnabled.value)"),
    ).toBeLessThan(
      initializeShellSource.indexOf(
        "const instanceKey = resolveDetailInstanceKey()",
      ),
    );
    expect(detailSource).toContain(
      ':initial-loading="isActiveDetailTabPage(index) && detailContentInitialLoading"',
    );
    expect(detailSource).toContain('@reload="reloadDetailContent"');
    expect(detailSource).toContain("暂时无法显示会话内容");
    expect(detailSource).toContain(
      "!snapshot.currentConversationInShell || !snapshot.currentConversationMounted",
    );
    expect(paneSource).toContain("resolveDetailContentFallbackPresentation");
    expect(paneSource).toContain("initialLoading?: boolean");
    expect(paneSource).toContain("loadErrorMessage?: string");
    expect(paneSource).toContain('(event: "reload"): void');
    expect(paneSource).toContain("正在加载会话内容...");
    expect(paneSource).toContain("加载会话失败");
    expect(paneSource).toContain("这是一个新会话，暂时还没有消息");
  });

  it("opens the plan drawer from the interactive pane status pill", () => {
    const source = fs.readFileSync(
      path.resolve(
        __dirname,
        "../../../src/pages/conversation-detail/ConversationDetailInteractivePane.vue",
      ),
      "utf8",
    );

    expect(source).toContain('class="input-status-row__plan"');
    expect(source).toContain('@click.stop="showPlanDrawer = true"');
    expect(source).toContain(
      '<up-popup v-model:show="showPlanDrawer" mode="bottom" :round="20">',
    );
    expect(source).toContain("buildPlanFilterItems");
    expect(source).toContain("taskStatusLabel(task.status)");
  });
});

describe("detail tab multitask mode contract", () => {
  it("routes detail tabs by off, mobile-local, and pc-sync modes", () => {
    const source = fs.readFileSync(
      path.resolve(
        __dirname,
        "../../../src/pages/conversation-detail/index.vue",
      ),
      "utf8",
    );

    expect(source).toContain("readDetailTabMultitaskMode");
    expect(source).toContain('detailTabMultitaskMode.value !== "off"');
    expect(source).toContain("initializeSingleDetailTabShell");
    expect(source).toContain("initializeMobileDetailTabsShell");
    expect(source).toContain("ensureMobileDetailTab");
    expect(source).toContain("activateMobileDetailTab");
    expect(source).toContain("closeMobileDetailTab");
    expect(source).toContain("if (!detailTabsUsePcSync.value) return");
    expect(source.indexOf("if (detailTabsUseMobileLocal.value)")).toBeLessThan(
      source.indexOf('gateway.call<unknown>("list_opened_tabs")'),
    );
  });
});
