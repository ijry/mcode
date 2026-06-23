# External Link Guard And Markdown Link Styling

## Architecture

mcode routes Markdown link taps and explicit outbound-link actions through a
shared `externalLinkGuard` service. The service derives the trusted site host
from `resolveXycloudBaseUrl()`, classifies absolute `http` and `https` links,
and decides whether to open directly or require user confirmation.

Markdown content continues to render through `up-markdown -> up-parse`. The
link guard is injected at the `u-parse/node.vue` anchor-tap branch, so the app
owns external-link behavior without adding a separate wrapper component around
`up-markdown`.

## Protocol And Data Flow

No backend API changed.

The guard flow is:

1. `up-markdown` renders HTML through `up-parse`.
2. `u-parse/node.vue` intercepts anchor taps for absolute external links.
3. The component forwards the URL to `openGuardedExternalUrl()`.
4. The service normalizes the URL and compares its hostname with the current
   xycloud site hostname.
5. Same-host absolute links open immediately.
6. Non-site absolute links show a confirmation modal before opening.
7. Non-HTTP(S) links are ignored by the guard and are not auto-opened.

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
