# P38 App Desktop Readiness Design

P38 improves `mcode-app` for users who connect to MCode Desktop through a
gateway. The app should explain whether Desktop is paired, which capabilities
are available, and why official CLI or tunnel entries are hidden or disabled.

## Scope

- Add an app-side Desktop readiness summary for `targetAgent = mcode-desktop`.
- Keep the logic in `mcode-app/src/agents/mcode-desktop/` so Desktop-specific
  behavior does not leak into shared gateway code.
- Upgrade the target page from a plain service list to a readiness panel with
  diagnostics, capability chips, service counts, and clear actions.
- Provide a copyable diagnostic summary for support/debugging.
- Do not change relay, Desktop, pairing, tunnel, proxy, or official CLI
  protocols.

## Architecture

A new `readiness.ts` helper consumes a normalized connection and discovered
services. It reuses existing `diagnoseDesktopGatewayConnection()`,
`getDesktopCapabilityLabels()`, and `buildDesktopServiceEntries()` output to
produce a UI-ready summary. The targets page handles loading and actions; the
helper remains pure and unit-tested.

## UI Behavior

- If no paired Desktop gateway connection exists, show an actionable empty
  state with a button to open the connections page.
- If a connection exists, show gateway URL, target id, status level, capability
  chips, diagnostics, and service counts.
- Continue showing HTTP/TCP local services. HTTP entries can open/copy the
  relay tunnel URL; TCP entries remain informational.
- Add a “复制诊断” action that includes only non-secret metadata.

## Native Client Guidance

Native iOS/Android clients should replicate the same presentation model:
diagnose connection readiness locally, display Desktop capabilities from pair
metadata, and never include access tokens or pair secrets in copied diagnostics.
