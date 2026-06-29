# 2026-06-29 MCode App Version 0.2.0

## Architecture

`mcode-app` release metadata is advanced from `0.1.0` to `0.2.0`. This is a
packaging/version marker only; it does not change app architecture, connection
storage, agent routing, relay protocol, or native bridge behavior.

## Protocol And Data Flow

No protocol fields change. Existing v2-only connection records, gateway
sessions, relay pair/refresh flows, and target metadata remain unchanged.

## UI Behavior

The visible app version becomes `0.2.0` wherever UniApp or platform packaging
surfaces `manifest.json` version metadata.

## Compatibility

Android/iOS package metadata moves to `versionCode = 2` and
`versionName = 0.2.0`. Native clients should treat this as a normal release
version bump, not as a schema migration signal.

## Native iOS/Android Replication Guidance

Native builds should align their public version string with `0.2.0` and bump
their monotonically increasing build number according to platform rules. Do not
gate protocol behavior on this app version; use explicit protocol/capability
fields instead.
