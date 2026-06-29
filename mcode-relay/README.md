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
- `GET /health` and `GET /v1/gateway/info` stay diagnostic-only; they report counts and feature flags but do not expose secrets, tokens, pair codes, or storage paths.

## Not Included Yet

- Multi-node shared state or session migration.
- Full RBAC and policy-engine enforcement beyond the current admin token boundary.
