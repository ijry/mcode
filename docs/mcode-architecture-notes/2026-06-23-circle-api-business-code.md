# 2026-06-23 circle api business code

## Architecture

圈子前端调用 xycloud 接口时，必须以响应体里的业务 `code` 作为成功失败判断的第一依据，HTTP `statusCode` 只能作为缺省回退值。

## Protocol And Data Flow

xycloud 的评论与圈子接口存在这种返回形态：

- HTTP 状态码：`200`
- 业务状态码：`code = 0`
- 业务消息：错误原因，例如“评论内容必须在5-300个字符”

如果前端用 `body.code || statusCode` 计算最终状态码，那么 `code = 0` 会被错误吞掉并回退成 `200`，导致业务失败被当成成功。

正确规则：

1. 若响应体显式包含 `code` 字段，则使用该字段
2. 仅当响应体没有 `code` 字段时，才回退到 HTTP `statusCode`

## UI Behavior

- 评论提交失败时，不再错误显示“评论已发布”
- 后端返回的业务错误消息会正确透传到前端提示
- 圈子上传、评论、帖子等接口的成功与失败判断保持一致

## Compatibility

- 不改变接口协议，只修正前端对既有协议的解释
- 兼容 `code = 200` 成功返回
- 兼容 `code = 0` 或其他非 `200` 的业务失败返回

## Native Replication

iOS / Android 原生端若接同一 xycloud 接口，应使用相同规则：

- 优先读取业务 `code`
- 只有业务 `code` 缺失时才回退 HTTP 状态码
- 错误提示优先展示响应体中的 `msg` / `message`
