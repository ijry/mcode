# External Link Guard And Markdown Link Styling

## Architecture

mcode now routes Markdown link taps and explicit outbound-link actions through a
shared `externalLinkGuard` service. The service derives the trusted site host
from `resolveXycloudBaseUrl()`, classifies absolute `http` and `https` links,
and decides whether to open directly or require user confirmation.

Markdown rendering is wrapped by a reusable `GuardedMarkdown` component. It
uses `up-markdown` with `copy-link=false` so the app, not `uview-plus`, owns
external-link behavior.

## Protocol And Data Flow

No backend API changed.

The guard flow is:

1. `up-markdown` emits `linktap` with `href`.
2. `GuardedMarkdown` forwards the URL to `openGuardedExternalUrl()`.
3. The service normalizes the URL and compares its hostname with the current
   xycloud site hostname.
4. Same-host absolute links open immediately.
5. Non-site absolute links show a confirmation modal before opening.
6. Non-HTTP(S) links are ignored by the guard and are not auto-opened.

The same service is reused by the connections deployment-guide link, so the
confirmation policy stays consistent outside Markdown too.

## UI Behavior

Markdown links in circle feed cards, circle detail, and conversation bubbles now
have a stronger visual affordance: primary-color link text plus underline by
default, and white underlined links inside user chat bubbles.

Only non-site-domain links trigger the modal. The dialog shows the destination
hostname and asks the user to confirm before leaving the site. Trusted
same-host links open directly with no extra prompt.

Cancelling the confirmation dialog is treated as a user choice, not as a link
open failure, so the UI does not show a false error toast.

## Compatibility

Trusted-domain matching is hostname-based, not registrable-domain-based. For
example, if the configured site base URL host is `getmcode.lingyun.net`, then
`https://getmcode.lingyun.net/...` is trusted, while
`https://docs.lingyun.net/...` still requires confirmation.

This change does not add dependencies and keeps runtime theming on existing
`--up-*` variables.

## Native iOS And Android Replication

Native clients should centralize outbound-link handling in one helper instead
of letting each Markdown or button surface open URLs directly. Reuse the same
rule set:

- Accept only absolute `http` and `https` URLs.
- Trust only the configured xycloud site hostname.
- Show a confirmation dialog for other hosts.
- Open trusted or confirmed URLs with the platform browser/webview launcher.

For Markdown rendering, intercept anchor taps before the renderer's default
external-open behavior runs, so the native guard remains authoritative.
