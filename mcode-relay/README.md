# mcode-relay

Standalone relay service for MCode remote control.

## Scripts

- `pnpm dev`
- `pnpm build`
- `pnpm test`
- `pnpm typecheck`

## Environment

- `PORT` default `8787`
- `HOST` default `0.0.0.0`
- `JWT_SECRET` default `dev-secret`
- `PAIRING_CODE_TTL_SECONDS` default `300`
- `ACCESS_TOKEN_TTL_SECONDS` default `900`
- `REFRESH_TOKEN_TTL_SECONDS` default `1209600`
- `GATEWAY_NAME` default `MCode Gateway`
- `PUBLIC_BASE_URL` default empty
- `GATEWAY_PROVIDER` default `custom`
- `DEPLOYMENT_ENV` default `development`
- `LOG_POLICY` default `standard`
- `AUDIT_POLICY` default `disabled`
- `AUDIT_EVENT_LIMIT` default `1000`
- `AUDIT_WEBHOOK_URL` default empty
- `AUDIT_WEBHOOK_SECRET` default empty
- `AUDIT_WEBHOOK_TIMEOUT_MS` default `3000`
- `ACCESS_POLICY` default `allow-all`
- `ADMIN_TOKEN` default empty
- `ADMIN_TOKEN_ROLES` default empty JSON policy
- `ADMIN_CREDENTIAL_STORE_PATH` default empty
- `ALLOW_DEV_SECRETS` default `true`

## Pair Response Contract

`POST /v1/pair` and `POST /v1/session/refresh` return target metadata when the paired target is known:

- `target.targetId`
- `target.targetAgent`
- `target.displayName`
- `target.capabilities`
- `target.protocolVersion`

Legacy clients can keep using `target.targetName`, `target.relayUrl`, `target.preferredMode`, and `target.online`. Missing target metadata defaults to `codeg` and protocol version `1` at the store boundary.

`target.tenantId` is also present for tenant-aware enterprise tooling. Clients
that do not implement tenant administration can ignore it.

## Events And Tunnel

- `/v1/events` emits replayable frames shaped as `{ eventId, channel, payload, controllerId? }`.
- Mobile clients may reconnect with `lastEventId` or `last_event_id` to replay buffered frames.
- `/v1/tunnel/:targetId/:port/*` validates the access token target before forwarding a `tunnel_request` to the desktop upstream.
- Desktop upstreams respond with `tunnel_response` containing `requestId`, `ok`, `status`, `headers`, `body`, and optional `error`.

## Gateway Health And Info

- `GET /health` returns relay version, protocol version, deployment environment, gateway name, public base URL, security warnings, and live stats.
- `GET /v1/gateway/info` returns gateway metadata for diagnostics before pairing.
- Both endpoints are public and must not expose secrets, tokens, pair codes, session ids, or target names.

## Enterprise Deployment

- Use `GATEWAY_PROVIDER=custom` for self-hosted instances.
- Set `PUBLIC_BASE_URL` to the externally reachable HTTPS origin.
- Set `JWT_SECRET` to a non-default value before production traffic.
- Set `DEPLOYMENT_ENV=production`, `ALLOW_DEV_SECRETS=false`, and a policy label for logging and auditing.
- Keep TLS termination at the edge and point MCode app / MCode Desktop custom gateway entries at the enterprise domain.

## Tenant Operations

- `GET /v1/admin/tenants` lists tenant summaries for admin tooling.
- `POST /v1/admin/tenants` creates or updates a tenant record.
- `POST /v1/admin/devices/:targetId/tenant` moves a paired target into another tenant.
- `GET /v1/admin/devices`, `GET /v1/admin/sessions`, and `GET /v1/admin/audit-events` accept `tenantId` or `x-mcode-tenant-id` for tenant-scoped administration.
- `GET /v1/admin/audit-events/export` exports tenant-scoped audit events as JSON or JSONL.
- `GET /health` and `GET /v1/gateway/info` stay diagnostic-only; they report counts and feature flags but do not expose secrets, tokens, pair codes, or storage paths.

## Admin RBAC

`ADMIN_TOKEN` remains the bootstrap owner token. For role-scoped administration,
set `ADMIN_TOKEN_ROLES` to a JSON object mapping token values to role entries:

```json
{
  "owner-secret": { "role": "owner" },
  "audit-secret": { "role": "auditor", "tenantId": "tenant-a" },
  "ops-secret": { "role": "admin", "tenantId": "tenant-b" }
}
```

- `owner` can read and mutate all admin resources.
- `admin` can read and mutate resources within its assigned tenant.
- `auditor` can read resources within its assigned tenant and receives `403` on mutations.
- Missing or invalid admin credentials return `401`; valid credentials without permission return `403`.
- `/v1/gateway/info` exposes `deployment.policyMode` and `deployment.policyWarnings`, but never exposes token values or the role mapping.

## Admin Credential Rotation

Dynamic admin credentials let owners create and revoke admin API tokens without
editing env vars or restarting relay. Set `ADMIN_CREDENTIAL_STORE_PATH` to a
JSON file path to persist dynamic credentials; otherwise they are in-memory.

- `GET /v1/admin/credentials` lists safe credential metadata.
- `POST /v1/admin/credentials` creates a credential and returns the generated token once.
- `POST /v1/admin/credentials/:credentialId/revoke` revokes a dynamic credential immediately.
- Only `owner` principals can manage credentials.
- `admin` and `auditor` credentials require `tenantId`; `owner` credentials are global.
- Relay stores only token hashes and never returns token hashes in API responses.
- Credential creation and revocation are audit events and flow through the audit webhook sink when configured.

Dynamic credentials are resolved before static `ADMIN_TOKEN_ROLES` and
`ADMIN_TOKEN`. Static env tokens remain compatible and can be used as bootstrap
owner credentials.

## Audit Export

`AUDIT_EVENT_LIMIT` controls the in-process retained audit event count. The
default is `1000`; larger deployments should configure it explicitly or replace
the storage boundary with an external audit sink.

`GET /v1/admin/audit-events/export` accepts:

- `tenantId` or `x-mcode-tenant-id`
- `format=json` or `format=jsonl`
- `limit`
- `since` and `until` as millisecond timestamps

The endpoint reuses the `audit.read` RBAC policy. Exported metadata recursively
redacts keys containing `token`, `secret`, `authorization`, or `password`.

## Audit Webhook Sink

Set `AUDIT_WEBHOOK_URL` to forward new audit events to an external collector.
Relay posts `{ event }` JSON after the local audit event is written. Delivery is
best-effort and asynchronous: webhook failures, non-2xx responses, and timeouts
increment sink diagnostics but do not fail pairing, refresh, or admin mutation
requests.

`AUDIT_WEBHOOK_SECRET` is optional. When set, relay sends it as
`x-mcode-audit-secret` so the receiver can authenticate relay deliveries.
`AUDIT_WEBHOOK_TIMEOUT_MS` bounds each delivery attempt. `/health` and
`/v1/gateway/info` report only safe status fields such as enabled state,
delivery counts, and last error; they never expose the webhook URL or secret.

Webhook payloads use the same metadata redaction as audit export.

## Not Included Yet

- Multi-node shared state or session migration.
- SSO/OIDC integration and external policy engines.
- Immutable audit storage implementation inside relay.
