# P33 Audit Webhook Sink Design

## Goal

P33 adds a first external audit sink for enterprise relay deployments. Relay
keeps the P32 in-process audit retention and export behavior, then forwards
new audit events to an operator-provided webhook for long-term or immutable
storage.

## Scope

- Add optional webhook delivery in `mcode-relay`.
- Keep app, desktop, pairing, proxy, event, HTTP tunnel, and TCP tunnel wire
  protocols unchanged.
- Keep relay usable without a webhook.
- Do not implement database-backed immutable audit storage inside relay.

## Configuration

Relay enables the sink when `AUDIT_WEBHOOK_URL` is non-empty.

- `AUDIT_WEBHOOK_URL`: destination URL, default empty.
- `AUDIT_WEBHOOK_SECRET`: optional shared secret sent as
  `x-mcode-audit-secret`, default empty.
- `AUDIT_WEBHOOK_TIMEOUT_MS`: request timeout, default `3000`.

Gateway diagnostics expose only safe sink status. They never expose the
webhook URL or shared secret because URLs can contain credentials or internal
hostnames.

## Data Flow

1. Existing relay code creates an audit event through a single helper.
2. The helper writes the raw event into `PairingStore`, preserving P32 behavior.
3. The helper sanitizes the stored event with the same redaction logic used by
   audit export.
4. Relay schedules webhook delivery asynchronously and does not wait for it
   before returning the API response.
5. The sink records delivered and failed counts plus last success/error
   timestamps for diagnostics.

Webhook payload:

```json
{
  "event": {
    "eventId": "uuid",
    "type": "session.created",
    "tenantId": "tenant-a",
    "targetId": "desktop-1",
    "sessionId": "session-id",
    "actor": "pair",
    "message": null,
    "createdAt": 1782720000000,
    "metadata": {
      "mode": "relay"
    }
  }
}
```

Sensitive metadata keys containing `token`, `secret`, `authorization`, or
`password` are recursively replaced with `[redacted]` before export and webhook
delivery.

## Failure Behavior

Webhook delivery is best-effort. Network errors, non-2xx responses, invalid
URLs, and timeouts increment sink failure diagnostics but do not fail pairing,
refresh, or admin mutation requests.

## Compatibility

- Existing `GET /v1/admin/audit-events` is unchanged and still returns stored
  audit events.
- Existing `GET /v1/admin/audit-events/export` keeps returning redacted JSON or
  JSONL.
- `/health` and `/v1/gateway/info` expose safe webhook status only.
- Existing deployments without `AUDIT_WEBHOOK_URL` behave as before.

## Native Client Replication Guidance

Native iOS and Android clients do not need to implement webhook delivery. Treat
the new gateway diagnostics as operational metadata only. If shown in an admin
screen, display whether audit forwarding is enabled and the last delivery
status; never display webhook URL or secret values.
