# P36 Relay Web Admin Design

P36 adds a Web administration console to `mcode-relay`. This is the gateway
operator UI for official and self-hosted relay deployments; it is not part of
`mcode-app`, and it does not change mobile client behavior.

## Scope

- Serve a small built-in admin console from `mcode-relay` at `/admin`.
- Reuse existing admin APIs and `x-mcode-admin-token` authentication.
- Show gateway health, deployment info, tenants, devices, sessions, audit
  events, and admin credentials.
- Provide first-line operations that already exist as APIs: create tenant,
  move/restore/revoke device, revoke session, create/revoke admin credential.
- Do not introduce a separate frontend build system in P36.

## Architecture

`mcode-relay` serves static HTML/CSS/JS from `src/adminWeb/assets`. The browser
stores the admin token only in `sessionStorage`, sends it as
`x-mcode-admin-token`, and calls the same `/v1/admin/*`, `/health`, and
`/v1/gateway/info` endpoints used by external tooling. The backend adds only
static asset routing and cache/security headers.

## Security

- The admin console is inert without a valid admin token.
- API authorization remains enforced server-side by existing RBAC.
- Static pages must not embed tokens, secrets, pair codes, session tokens, or
  credential token hashes.
- Public `/admin` availability does not imply public admin access; every
  mutation still requires an authorized admin credential.

## Native Client Guidance

Native iOS/Android clients should not replicate P36. They remain AI remote
control clients and should not call relay admin APIs. Enterprise operators use
the relay Web console or external admin tooling.
