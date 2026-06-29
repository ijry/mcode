# MCode P31 Admin RBAC Policy Design

## Goal

Add a relay-side permission layer for enterprise administration so tenant-aware
management operations are no longer controlled by a single flat admin token
alone.

## Problem Statement

P30 introduced tenant-aware storage and tenant-scoped admin filtering, but the
admin surface still treats every valid admin token as equivalent. That is not
enough for commercial deployments that need distinct operator roles, limited
auditor access, and clear ownership boundaries for tenant creation, target
reassignment, revocation, and audit access.

## Scope

This phase only covers `mcode-relay` admin APIs.

Included:

- Role-aware admin authentication for `/v1/admin/*`
- Policy checks for tenant creation, target reassignment, revocation, and audit
  reads
- A default role/policy model that keeps existing deployments working with the
  current `ADMIN_TOKEN`
- Public diagnostics that expose policy mode without revealing secrets

Excluded:

- Pairing, proxy, events, tunnel, or desktop wire protocol changes
- Full SSO / OIDC integration
- Multi-node policy sync
- UI changes in `mcode-app` or `mcode-desktop`

## Proposed Model

### Identity

Keep `ADMIN_TOKEN` as the bootstrap credential, but interpret it as a role
grant, not just a binary gate.

Supported roles for the first slice:

- `owner`
- `admin`
- `auditor`

Role assignment comes from a config-driven token policy for the first slice.
Use `ADMIN_TOKEN_ROLES` as a JSON string mapping tokens to role/scope objects.
The policy layer should accept a request context with:

- `actor`
- `role`
- `tenantId`
- `scopes`

Example:

```json
{
  "owner-secret": { "role": "owner" },
  "audit-secret": { "role": "auditor", "tenantId": "tenant-a" },
  "ops-secret": { "role": "admin", "tenantId": "tenant-b" }
}
```

### Authorization Rules

The default policy should be explicit and conservative:

- `owner` can manage all tenants and all admin operations.
- `admin` can manage tenants and devices within one assigned tenant.
- `auditor` can read tenants, sessions, devices, and audit events for one
  assigned tenant, but cannot mutate state.

Tenant-scoped operations must enforce both role and tenant match. Global tenant
creation should be reserved for `owner` unless the policy file explicitly grants
`admin` that scope.

### Policy Surface

Expose policy mode in public diagnostics only as:

- `policyMode = "token-role"` for the first slice
- `policyWarnings[]` for unsafe defaults

Do not expose raw role assignments, token values, or policy file paths.

## Data Flow

1. Admin request arrives with `x-mcode-admin-token` or bearer token.
2. Relay resolves the token into an admin principal and tenant scope.
3. Policy engine evaluates route + action + tenant scope.
4. Authorized requests proceed to store mutation or read.
5. Denied requests return 403 with a stable error code and a short reason.

## Compatibility

- Existing deployments with one `ADMIN_TOKEN` keep working.
- If no explicit role mapping is configured, the bootstrap token should behave
  as `owner`.
- Old clients continue to use the same HTTP routes.
- Public health/info endpoints remain diagnostic-only.

## Native Replication Guidance

- Native admin tools should model authorization as explicit roles and scopes,
  not as a single global “is admin” boolean.
- Role-aware tooling should still treat `mcode-relay` as the enforcement point;
  do not duplicate policy decisions in mobile clients.
- Native clients should surface 403 as a permission problem, not as a network
  failure.

## Open Decisions

- Whether tenant admins should be able to create sub-tenants in P31 or only in
  a later phase.
- Whether policy state should live in JSON files first or wait for a database
  layer.
