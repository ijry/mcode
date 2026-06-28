# MCode Relay P6 Enterprise Gateway Design

## Goal

P6 第一版让企业客户自部署的 `mcode-relay` 实例具备可验证、可观测、可配置说明清晰的最小闭环。MCode app 与 MCode Desktop 继续通过 `gatewayProvider = custom` + 企业域名连接同一套协议；企业实例和官方实例只在部署位置、域名、TLS 与运维策略上不同。

## Scope

Included:

- Relay 暴露结构化网关信息接口，供部署检查、版本检查和客户端诊断读取。
- Relay `/health` 从简单存活检查升级为包含版本、协议、配置安全状态、target/session/desktop 统计的健康快照。
- Relay 配置增加企业部署元数据与安全提示：网关名称、公开 base URL、部署环境、日志策略、审计策略、是否允许默认开发密钥。
- 文档说明企业部署环境变量、TLS 终止、日志/审计边界、健康检查和版本检查。
- 架构 note 说明原生 iOS/Android 复制规则：自定义网关必须使用同一协议，不应增加客户端私有分支。

Excluded from P6 first slice:

- 租户模型、用户/设备管理、连接吊销、网关访问策略后台。
- 多节点共享存储、持久化数据库、横向扩容会话迁移。
- app/desktop 保存自定义网关前主动探测网关信息。
- 官方 CLI adapter 的进一步会话/权限/流式能力。

## Architecture

Relay 增加一个小的 gateway metadata 层，集中从配置和运行时 store/hub 生成对外状态。它不改变 pair、proxy、events、tunnel 协议，只给企业部署提供“这个网关是谁、运行什么版本、协议版本是多少、当前安全配置是否适合生产”的自描述能力。

Recommended public endpoints:

- `GET /health`：给负载均衡器和运维系统使用，返回 `status`、`version`、`protocolVersion`、`environment`、`security`、`stats`。
- `GET /v1/gateway/info`：给客户端或人工诊断使用，返回 `name`、`baseUrl`、`provider = "custom" | "official"`、`version`、`protocolVersion`、`features`、`deployment`、`security`。

Both endpoints are unauthenticated by design because they must be usable before pairing. They must not expose secrets, tokens, target names, pair codes, session ids, or client IPs.

## Configuration

Relay config should keep current defaults for local development, but surface production safety clearly:

- `GATEWAY_NAME`: display name for diagnostics, default `MCode Gateway`.
- `PUBLIC_BASE_URL`: externally reachable HTTPS origin, optional but recommended for enterprise deployments.
- `GATEWAY_PROVIDER`: `official | custom`, default `custom` for self-hosted relay.
- `DEPLOYMENT_ENV`: `development | staging | production`, default `development`.
- `LOG_POLICY`: short operational label such as `standard`, `minimal`, or `enterprise-managed`, default `standard`.
- `AUDIT_POLICY`: short operational label such as `disabled`, `metadata-only`, or `external`, default `disabled`.
- `ALLOW_DEV_SECRETS`: `true | false`, default `true` only for development.

Security status is derived:

- `jwtSecretConfigured`: true when `JWT_SECRET` is not empty and not `dev-secret`.
- `publicBaseUrlConfigured`: true when `PUBLIC_BASE_URL` is set.
- `devSecretsAllowed`: value of `ALLOW_DEV_SECRETS`.
- `productionReady`: true only when production does not allow dev secrets, JWT secret is non-default, and public base URL is configured.
- `warnings`: human-readable warning codes/messages for unsafe deployment state.

## Data Flow

Enterprise deployment flow:

1. Operator deploys `mcode-relay` behind HTTPS with enterprise domain.
2. Operator sets `PUBLIC_BASE_URL`, `JWT_SECRET`, `DEPLOYMENT_ENV = production`, and policy labels.
3. Load balancer checks `GET /health`.
4. MCode app/Desktop uses existing custom gateway UI and enters the enterprise domain.
5. Pair, refresh, proxy, events, and tunnel flows continue unchanged.
6. Operators can inspect `GET /v1/gateway/info` to confirm version, protocol and production readiness.

## UI Behavior

No new app or desktop UI is required in P6 first slice. Existing UI remains:

- App new connection: gateway provider dropdown `MCode 官方网关` / `自定义`; custom reveals domain input.
- Desktop connection page: official/custom gateway config and pair code flow.

Client-side behavior should not fork based on enterprise deployment. If a client later reads `/v1/gateway/info`, it should use it for diagnostics and compatibility warnings only.

## Error Handling

- Invalid enum-like env values should fail fast at startup with zod validation errors.
- Missing production safety settings should not crash relay, but should set `productionReady = false` and include warnings in health/info.
- Health/info endpoints should never throw due to poisoned runtime state; unavailable counters should degrade to `0` or `unknown`.
- Authenticated protocol endpoints keep existing errors and status codes.

## Testing

Relay tests should cover:

- `/health` returns version, protocol version, deployment environment, security fields, and stats.
- `/v1/gateway/info` returns gateway metadata and no secrets.
- Production config with `JWT_SECRET = dev-secret` and no `PUBLIC_BASE_URL` reports `productionReady = false` with warnings.
- Production config with non-default secret, public base URL, and `ALLOW_DEV_SECRETS = false` reports `productionReady = true`.
- Existing pair/proxy/tunnel tests continue to pass unchanged.

Verification commands:

```bash
cd mcode-relay && npm test
cd mcode-relay && npm run typecheck
cd mcode-desktop && npm test
cd mcode-desktop && npm run build
cargo test --manifest-path mcode-desktop/src-tauri/Cargo.toml
```

## Compatibility

- Protocol fields continue using `targetAgent`, not `targetType`.
- User-visible copy continues to use `网关`, not new `中继` wording.
- Enterprise self-hosted relay uses the same API shape as the official gateway.
- Older clients that only call `/health` and authenticated proxy endpoints continue to work.
- Native iOS/Android clients should only add optional diagnostics for gateway info; connection creation remains driven by `targetAgent + routeMode + gatewayProvider`.

## Native Replication Guidance

Native clients do not need enterprise-specific protocol branches. They should:

- Keep saving custom gateway domains as `gatewayProvider = custom` and `gatewayBaseUrl = <enterprise origin>`.
- Treat `/v1/gateway/info` as optional diagnostics.
- Warn but not block if gateway info is unreachable before pairing, because older gateways may not expose it.
- Never expect gateway info to contain target credentials, official CLI credentials, pair secrets, or session tokens.
