# P37 Relay Admin Operations Design

P37 strengthens the `mcode-relay` Web administration console added in P36 so it
is useful for day-to-day enterprise gateway operations. It remains a relay-side
operator feature, not an `mcode-app` feature.

## Scope

- Add a tenant scope filter to the admin console.
- Apply the selected tenant to tenant, device, session, audit, and audit export
  API requests where the existing APIs already support tenant scoping.
- Add JSON/JSONL audit export actions from the Web console.
- Add CSP and related static security headers to `/admin` and
  `/admin/assets/*`.
- Do not change admin RBAC, relay pairing, tunnel, proxy, event, or mobile
  client protocols.

## Architecture

The browser keeps a `tenantId` filter in `sessionStorage` next to the admin
token. Read calls append `tenantId` to admin endpoints, relying on existing
server RBAC to permit or reject cross-tenant access. Audit export uses the
existing `/v1/admin/audit-events/export` endpoint and downloads a generated
blob without persisting data locally.

## Security

Static admin responses include a restrictive Content-Security-Policy. Since
P36 intentionally avoided a frontend build pipeline, the CSP allows same-origin
module script and style assets but blocks external network, object, frame, and
base URI usage. API authorization remains server-side.

## Native Client Guidance

Native iOS/Android clients should not implement P37. Relay admin filtering and
audit export remain enterprise operator tooling.
