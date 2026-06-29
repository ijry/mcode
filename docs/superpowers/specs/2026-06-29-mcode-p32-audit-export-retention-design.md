# MCode P32 Audit Export And Retention Design

## Goal

Make enterprise gateway audit data operationally useful by adding configurable
retention and tenant-scoped export without changing mobile, desktop, pairing,
proxy, event, or tunnel protocols.

## Scope

P32 is limited to `mcode-relay` enterprise admin APIs and storage behavior.

Included:

- Configurable in-process audit event retention limit.
- Tenant-scoped audit export endpoint.
- RBAC enforcement through the P31 `audit.read` policy.
- Secret-safe export serialization.

Excluded:

- External audit sinks.
- Database-backed immutable audit logs.
- Scheduled export jobs.
- App or desktop UI changes.

## Design

Relay adds `AUDIT_EVENT_LIMIT`, defaulting to the existing behavior of `1000`.
`PairingStore` accepts this limit and prunes old audit events after each audit
write. Existing tests and deployments continue to use the default when no value
is configured.

Admin API adds:

```text
GET /v1/admin/audit-events/export
```

Query parameters:

- `tenantId` or `x-mcode-tenant-id`
- `format=json | jsonl`, default `json`
- `limit`, bounded by the configured retention
- `since` and `until` as millisecond timestamps

Exports use the same P31 `audit.read` authorization path as audit listing.
Owner can export all tenants or one tenant. Admin and auditor are scoped to
their configured tenant. Export records are sanitized before serialization so
metadata fields with names containing `token`, `secret`, `authorization`, or
`password` are replaced with `[redacted]`.

## Compatibility

- Existing `/v1/admin/audit-events` behavior is preserved.
- Existing JSON pairing store snapshots remain readable.
- Public `/health` and `/v1/gateway/info` expose only the audit retention limit,
  not file paths, tokens, or exported content.

## Native Replication Guidance

Native admin tools should treat audit export as a server-side operation. They
may choose JSON for in-app display or JSONL for downloading/forwarding to a
compliance system. Clients should surface `403` as an authorization failure and
should not attempt to bypass tenant scoping locally.
