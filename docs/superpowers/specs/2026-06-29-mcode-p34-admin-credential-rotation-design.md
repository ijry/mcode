# P34 Admin Credential Rotation Design

## Goal

P34 makes enterprise relay administration safer by adding dynamic admin
credentials that can be created, listed, revoked, persisted, and audited without
editing environment variables or restarting `mcode-relay`.

## Scope

- Add dynamic admin credentials to `mcode-relay`.
- Keep existing `ADMIN_TOKEN` and `ADMIN_TOKEN_ROLES` compatibility.
- Keep app, desktop, pairing, proxy, event, HTTP tunnel, and TCP tunnel
  protocols unchanged.
- Do not add OIDC/SSO or an external policy engine in this phase.
- Do not expose raw admin tokens after creation.

## Credential Model

Dynamic credentials are separate from tenant, target, session, and audit state.
Relay stores only token hashes.

Credential record:

- `credentialId`
- `tokenHash`
- `role`: `owner | admin | auditor`
- `tenantId`: required for `admin` and `auditor`, null for `owner`
- `label`
- `createdAt`
- `updatedAt`
- `lastUsedAt`
- `expiresAt`
- `revokedAt`
- `revokeReason`

`POST /v1/admin/credentials` returns the generated token once. Later list
responses include only safe metadata and never include token or token hash.

## Configuration

- `ADMIN_CREDENTIAL_STORE_PATH`: optional JSON persistence path. Empty means
  in-memory dynamic credentials.

Existing env credentials keep working:

- `ADMIN_TOKEN` remains the bootstrap owner token.
- `ADMIN_TOKEN_ROLES` remains an env-defined static token-role map.

Resolution order:

1. Dynamic credential store by token hash.
2. Static `ADMIN_TOKEN_ROLES`.
3. Bootstrap `ADMIN_TOKEN`.

## Admin API

All credential-management routes require an owner principal:

- `GET /v1/admin/credentials`
- `POST /v1/admin/credentials`
- `POST /v1/admin/credentials/:credentialId/revoke`

Non-owner `admin` and `auditor` principals receive `403`.

## Audit And Diagnostics

Credential creation and revocation write audit events and therefore flow through
P33 webhook delivery. Audit metadata must never include raw generated tokens or
token hashes.

`/health` and `/v1/gateway/info` expose only safe diagnostics:

- credential store mode: `memory | json-file`
- dynamic credential count
- active dynamic credential count
- revoked dynamic credential count

## Compatibility

Deployments that do not use dynamic credentials behave as before. Existing
static tokens remain valid. Existing clients do not need protocol changes.

## Native Client Replication Guidance

Native admin tooling should show credentials as safe records and display the
generated token only immediately after creation. It should require the operator
to copy/store that token outside MCode because relay cannot show it again.
Revocation should be treated as immediate and irreversible.
