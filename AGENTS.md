# Agent Instructions

## mcode-app Theme Variables

- Prefer `uview-plus` runtime theme variables with the `--up-*` prefix for dark-mode styling.
- Do not introduce new `--mcode-*` theme aliases for colors, backgrounds, borders, or shadows unless there is a concrete platform limitation and the reason is documented next to the code.
- When binding component props through `upThemeVar(...)`, only pass variables that exist in the uview runtime theme table, such as `--up-page-bg-color`, `--up-card-bg-color`, `--up-main-color`, `--up-content-color`, `--up-tips-color`, `--up-border-color`, and `--up-primary`.

## mcode Change Notes

- Every mcode change must include or update a Markdown note under `docs/mcode-architecture-notes/`.
- The note should describe the architecture, protocol/data-flow changes, UI behavior, compatibility considerations, and native iOS/Android replication guidance.
- Keep notes concise but concrete enough that an AI agent can reimplement the same behavior in native clients without reading the full web/uni-app implementation.

## 对接 xycloud

- 当我说"对接 xycloud"时，指的是对接位于 `../.././xystack/back-end/xycloud` 的 xycloud 后端源码。
- xycloud 模块通常位于 `app/_app/<module>`，接口路由约定为 `/v1/<module>/<controller>/<action>`（例如待办：`/v1/todo/item/lists`）。
- mcode-app 调用 xycloud 接口时复用与账号、圈子相同的域名（`resolveXycloudBaseUrl()`）与账号 token（`useAccountStore().token` 作为 `Authorization` 头）。
