# DSH shared bus v2 protocol artifacts

## Architecture and data flow

The DSH desktop repository owns the canonical bus-v2 envelope schema, declarative-UI-v1 schema, and valid/invalid golden control frames. MCode keeps a byte-identical local mirror under `mcode-app/src/agents/dsh/protocol-artifacts`; runtime code never imports across repositories.

The control channel uses JSON envelope version `2`, a 256 KiB complete-frame limit, a 512 KiB complete visible-catalog limit, and application-level catalog chunks. Each catalog chunk remains an ordinary bounded control frame. Clients assemble contiguous chunks for one revision and replace the previous catalog only after complete validation.

## Protocol behavior

- Closed frame kinds: hello, catalog, subscribe, unsubscribe, event, request, response, cancel, overflow, error.
- `hello` carries a per-process `serverInstanceId` and catalog revision.
- Source IDs and request IDs are bounded; plugin events may not use reserved `$` names except the bus-owned `$snapshot`.
- Stable error codes are represented in the mirrored schema and negative golden corpus.
- MCode tests its mirror locally; coordinated release checks compare both artifact directories byte-for-byte.

## UI behavior

This change adds no user-visible page. Later declarative renderer work consumes the UI-v1 schema. Unsupported schema or bus versions must be rejected explicitly instead of guessed or downgraded.

## Compatibility

This is the new bus-v2 contract and does not preserve `/dsh-mobile-bridge` v1. Desktop and MCode releases must carry matching artifacts. Catalog assembly resets on disconnect or a changed server instance.

## Native iOS/Android replication guidance

Native clients should generate/consume the same JSON frames and validate complete UTF-8 byte counts before parsing. Catalog chunks must be decoded from base64url, assembled in index order, bounded to 512 KiB, and atomically installed. Disconnect clears partial assembly. Native implementations should use the shared golden corpus as conformance fixtures rather than recreate expectations manually.
