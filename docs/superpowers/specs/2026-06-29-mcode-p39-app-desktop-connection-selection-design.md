# P39 App Desktop Connection Selection Design

P39 fixes the main limitation left by P38: the targets page used the first
stored `mcode-desktop/gateway` connection. Users may have multiple Desktop
hosts, multiple relay gateways, or one unpaired and one paired record, so the
app needs an explicit, remembered selection.

## Scope

- Add Desktop connection selection helpers under
  `mcode-app/src/agents/mcode-desktop/`.
- List all stored `targetAgent = mcode-desktop` + `routeMode = gateway`
  connections on the targets page.
- Prefer the last selected connection when still present.
- Fall back to a paired connection before an unpaired connection.
- Persist only the selected connection key, never tokens or pair secrets.
- Do not change connection storage schema, relay, Desktop, tunnel, proxy, or
  official CLI protocols.

## Architecture

`desktopConnectionSelection.ts` owns filtering, option presentation, and
selection resolution. The targets page reads stored connections, builds options,
and passes the selected connection into the existing P38 readiness/service
loading flow. Selection state is stored in `uni` storage as a key derived from
the existing connection identity.

## UI Behavior

- If multiple Desktop gateway connections exist, show selectable cards above
  the readiness panel.
- The selected card is visually highlighted and drives service discovery.
- Unpaired cards remain selectable so their readiness diagnostics can explain
  the missing pairing state.
- The refresh action reloads the currently selected connection.

## Native Client Guidance

Native clients should replicate this as a local preference keyed by the
connection identity. Do not persist gateway tokens in the selection preference.
