# P41 Attachment Prompt Send Design

## Problem

`mcode-app` could upload an image, keep it in the composer, then fail when the
user typed text and sent the prompt. The failure had two root causes:

- The app built image prompt blocks as `{ type: "image", source: { url } }`,
  while Codeg ACP expects `{ type: "image", data, mime_type, uri? }`.
- Relay used Fastify's implicit JSON body limit, so relay-mode image prompt
  payloads could be rejected before they reached the target.

## Design

- Store uploaded image attachments with a local preview path and optional remote
  path, but do not persist base64 image data in composer snapshots.
- Before sending, create a transient draft copy and hydrate image attachments by
  reading the local image file as base64.
- Reject oversized prompt images before upload/send using per-send image size
  limits that leave room for JSON/base64 expansion.
- Send files as ACP `resource_link` blocks and images as ACP `image` blocks.
- Increase relay proxy JSON body limit via `PROXY_BODY_LIMIT_BYTES`, defaulting
  to 8 MiB and capped at 64 MiB.

## Compatibility

Text-only prompts are unchanged. Existing file attachments become
`resource_link` prompt blocks, matching the Codeg ACP schema. Old restored image
attachments without readable local cache fail with a clear "reselect image"
message instead of producing an invalid prompt payload.

## Native Guidance

iOS/Android native clients should keep only lightweight attachment metadata in
draft persistence. Read image bytes immediately before prompt send, validate the
decoded byte limit, and send the same ACP image block shape:

```json
{ "type": "image", "data": "<base64>", "mime_type": "image/png", "uri": "file://..." }
```
