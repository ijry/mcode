# P41 Attachment Prompt Send Implementation Plan

Goal: Fix image upload plus prompt send failures in `mcode-app`, including
relay-mode payload limits.

## Tasks

- [x] Trace upload/send path and confirm app block schema mismatch.
- [x] Compare with Codeg ACP prompt block schema.
- [x] Add attachment metadata for local image path and remote uploaded path.
- [x] Hydrate image base64 only in a transient send draft.
- [x] Convert outgoing prompt blocks to ACP `image` and `resource_link` shapes.
- [x] Add app-side prompt image size guard.
- [x] Raise relay proxy JSON body limit through configurable relay config.
- [x] Add/update unit tests for upload metadata, prompt blocks, and relay large payload proxy.
- [x] Update architecture notes.
