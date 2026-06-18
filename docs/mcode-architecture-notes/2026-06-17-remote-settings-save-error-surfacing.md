# Remote Settings Save Error Surfacing

## Architecture

`mcode-app/src/services/gateway/error.ts` is the single normalization layer for remote settings save failures before page-level toast rendering. Connection agent and model provider pages continue to call `CodegGateway`, and the gateway converts transport or backend errors into one user-visible string.

## Protocol And Data Flow

1. Agent/provider save actions call `acp_update_agent_env`, `acp_update_agent_config`, `create_model_provider`, or `update_model_provider`.
2. `DirectGateway` and `RelayGateway` inspect HTTP responses and pass non-2xx bodies into `toResponseErrorMessage(...)`.
3. The error normalizer now unwraps nested payloads from `detail`, `message`, `error`, `errMsg`, `cause`, `data`, `response`, and JSON-stringified error messages before falling back to `HTTP <status>`.
4. Page-level `catch` handlers keep using `uni.showToast({ title: toErrorMessage(error) })`, so backend rate-limit details surface without page-specific branching.

## UI Behavior

When the desktop host rejects a save with HTTP `429`, mcode now shows the backend-provided limit message if present. If the host only returns a status code, the toast at least shows `HTTP 429` instead of a generic silent failure.

## Compatibility

This is a client-only change. No ACP command shape, relay API, storage schema, or theme token changes are required. Existing pages that rely on the gateway error helpers automatically inherit the richer messages.

## Native iOS/Android Replication Guidance

Native clients should keep one shared remote-error normalizer instead of duplicating page-specific save-error handling. Parse nested JSON/string payloads first, prefer backend `detail/message/error`, and fall back to explicit HTTP status text so limit failures such as `429` remain visible to users.
