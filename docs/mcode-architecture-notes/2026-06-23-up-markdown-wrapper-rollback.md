# 2026-06-23 up-markdown wrapper rollback

## Architecture

圈子正文和消息文本已回退为直接使用 `up-markdown`，不再经过额外的 `GuardedMarkdown` 包装组件。

## Data Flow

- 页面/消息组件直接把字符串 `content` 传给 `up-markdown`
- `up-markdown` 负责 Markdown 转 HTML
- `up-parse` 负责 HTML 节点解析与渲染

本次回退的目的，是排除包装层对渲染回归的干扰，把问题收敛到 `up-markdown` 及其底层依赖。

## UI Behavior

- 圈子详情、圈子列表、消息气泡继续使用 `up-markdown`
- 链接颜色区分仍通过页面样式覆写 `.up-markdown ._a`
- 不再通过包装组件拦截外链点击

## Compatibility

- 不涉及接口协议、帖子结构、评论结构或分页逻辑
- 仅恢复为更接近历史可用状态的直接组件调用方式
- 若后续重新接入外链确认，必须以不改变 `up-markdown` 输入输出为前提

## Native Replication

iOS / Android 原生端若存在 Markdown 包装层，调试渲染异常时应优先移除包装层，只保留底层 Markdown 组件，先确认渲染主链正常，再逐步恢复外链拦截、样式扩展等附加能力。
