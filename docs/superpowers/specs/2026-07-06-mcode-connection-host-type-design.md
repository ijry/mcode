# MCode Connection Host Type Design

## Goal

Connections can record and display the host identity behind the remote agent: computer brand/model or cloud server provider/type. New and edit connection flows add a host-type picker, and the connection list visually highlights the selected brand/model with local logo and host imagery.

## Scope

- Add an optional host model field to the existing `ConnectionRecordV2` storage shape without changing the connection protocol version.
- Add a local host model catalog with bundled assets under `mcode-app/src/static/`.
- Add a host-type picker popup to the existing connections add/edit sheet.
- Redesign connection list cards to emphasize brand, model, logo, and host image while preserving current connection actions.
- Include cloud server options in the same picker as physical computers; do not split into two first-level categories.
- Add or update one Markdown architecture note under `docs/mcode-architecture-notes/` during implementation.

## Data Model

Add `hostModelId?: string` to `ConnectionRecordV2`.

The field stores only a stable catalog id such as `apple-macbook-air`, `lenovo-thinkpad`, or `aws-ec2`. It does not store image paths, logo paths, display labels, or source URLs. Rendering resolves those details from a local catalog so future image replacements do not require migrating saved connections.

Normalization keeps the field only when it matches a catalog id. Unknown values are dropped. Existing connections without `hostModelId` remain valid and render with a generic `Other Computer` fallback. Connection identity keys remain based on target agent, route mode, and base URL; host type does not affect connection dedupe or connected-state lookup.

Config-code export/import includes `hostModelId` when present so Wear OS and other clients can preserve the visual host identity. Older config codes without the field continue to import normally.

## Host Catalog

Create a focused catalog module, for example `mcode-app/src/services/connectionHostCatalog.ts`, exporting:

```ts
export type ConnectionHostKind = "laptop" | "desktop" | "mini-pc" | "cloud-server" | "computer"

export interface ConnectionHostModel {
  id: string
  brand: string
  model: string
  displayName: string
  kind: ConnectionHostKind
  filters: string[]
  image: string
  logo?: string
  sourceUrl: string
}
```

The initial catalog contains:

- `apple-macbook-air`: Apple MacBook Air, laptop
- `apple-mac-mini`: Apple Mac mini, mini-pc
- `apple-imac`: Apple iMac, desktop
- `dell-xps`: Dell XPS, laptop
- `dell-alienware`: Dell Alienware, laptop
- `lenovo-thinkpad`: Lenovo ThinkPad, laptop
- `lenovo-legion`: Lenovo Legion / 拯救者, laptop
- `hp-omen`: HP OMEN / 暗影精灵, laptop
- `beelink-mini-pc`: Beelink / 零刻 Mini PC, mini-pc
- `mechrevo-laptop`: MECHREVO / 机械革命, laptop
- `asus-rog`: ASUS ROG, laptop
- `msi-gaming`: MSI gaming laptop, laptop
- `microsoft-surface`: Microsoft Surface, laptop
- `framework-laptop`: Framework Laptop, laptop
- `alibaba-cloud-ecs`: Alibaba Cloud ECS, cloud-server
- `aws-ec2`: AWS EC2, cloud-server
- `tencent-cloud-cvm`: Tencent Cloud CVM, cloud-server
- `huawei-cloud-ecs`: Huawei Cloud ECS, cloud-server
- `azure-vm`: Azure Virtual Machines, cloud-server
- `google-compute-engine`: Google Compute Engine, cloud-server
- `oracle-cloud-compute`: Oracle Cloud Compute, cloud-server
- `digitalocean-droplet`: DigitalOcean Droplet, cloud-server
- `other-computer`: Other Computer, computer

Assets are bundled locally, for example:

```text
mcode-app/src/static/connection-hosts/apple-macbook-air.png
mcode-app/src/static/connection-hosts/apple-logo.svg
mcode-app/src/static/connection-hosts/aws-ec2.png
```

Physical computers use official product imagery when available. Cloud servers use official logo or official cloud-compute visual assets; do not fabricate a laptop/server photo for a virtual server. If a logo cannot be safely bundled, render a local text mark using the brand name rather than saving an unstable external image URL.

## Picker UI

The existing add/edit connection sheet gains a required-looking but optional field labeled `电脑/主机型号`. Tapping it opens a center or bottom popup picker.

The picker has:

- search input for brand/model keywords
- single-row filter chips: `全部`, `Apple`, `联想`, `戴尔`, `惠普`, `游戏本`, `Mini PC`, `云服务器`, `其他`
- a responsive grid/list of host cards
- each card shows local image, brand/logo mark, model name, and kind tag
- selected card has a clear border/check state using `--up-primary`
- `Other Computer` is always available as the last fallback

These filter chips are only filters. They are not first-level navigation and do not create separate picker sections. Cloud server options appear in the same result list as physical computers.

## Add/Edit Flow

Default new connections select `other-computer` unless the user chooses a model. Editing a connection preselects the saved `hostModelId`; if the id no longer exists, the UI falls back to `other-computer` and saves that only if the user submits.

Submitting a direct or gateway connection persists `hostModelId` alongside the existing route credentials after connection validation succeeds. Changing only the host type must not force a new connection key or disconnect state because the network endpoint is unchanged.

Scan import and config-code import resolve `hostModelId` through the catalog. Unknown ids are ignored.

## Connection List Redesign

Connection cards become host-forward device cards:

- Host product image becomes the leading visual element.
- Brand logo/text mark and model name are shown near the card title.
- The user-defined connection name becomes a secondary alias, for example `办公室 Mac`.
- Existing status pill remains: online, reconnecting, error, unconnected.
- Existing route/target metadata remains visible through `getConnectionSubtitle`.
- Existing capability chips and health detail remain unchanged.
- Existing overflow actions remain unchanged.
- The primary footer action still connects and opens projects.

For cloud servers, the card should show the cloud provider/logo and a cloud-compute visual, with the same status/action behavior as physical computers.

## Styling

Use the existing connections page visual language and uview-plus runtime theme variables. Do not introduce new `--mcode-*` theme aliases. Component props bound through `upThemeVar(...)` may only use existing uview runtime variables such as `--up-page-bg-color`, `--up-card-bg-color`, `--up-main-color`, `--up-content-color`, `--up-tips-color`, `--up-border-color`, and `--up-primary`.

The picker should feel like a hardware catalog, but it must remain compact enough for mobile:

- image aspect ratio stays stable to avoid layout shift
- text truncates rather than wrapping into oversized cards
- selection and hover/press states use color, border, and opacity rather than layout-changing scale
- no emoji icons

## Error Handling

- Missing catalog id: render `Other Computer`.
- Missing local image asset: render a neutral local fallback card and keep the brand/model text.
- Image load failure: use the same fallback without changing saved data.
- Config-code import with unknown `hostModelId`: import the connection and drop the host field.
- Asset source changes: update catalog assets and `sourceUrl`; saved connections continue to resolve by id.

## Compatibility

The storage change is additive. Existing `ConnectionRecordV2` records remain valid. Existing routing, connection keys, online watchers, direct/gateway pairing, target-agent validation, and project navigation are not changed.

Native iOS and Android clients should implement the same stable `hostModelId` catalog contract. They can use native asset names instead of web paths, but ids and labels should match the App catalog. Cloud server options must be shown in the same picker/list as computers unless a platform-specific UX requirement proves otherwise.

## Asset Source Policy

Implementation should prefer official product or provider pages for product images and logos. Candidate source pages include Apple MacBook Air, iMac, Mac mini; Lenovo ThinkPad and Legion; Dell XPS and Alienware; AWS EC2; Alibaba Cloud ECS; Azure Virtual Machines; and Google Compute Engine. Each catalog entry keeps the source URL in code for future refresh and native replication guidance.

When an official page prevents reliable asset extraction, use a stable locally created fallback visual based on the brand text and product class rather than hotlinking or relying on remote runtime URLs.

## Tests

Add focused tests for:

- schema normalization preserves valid `hostModelId` and drops unknown ids
- config-code export/import round-trips `hostModelId`
- host catalog lookup returns `Other Computer` fallback for unknown ids
- connection subtitle remains independent of host type
- connection presentation exposes brand/model labels for list rendering

Targeted verification should run the relevant app tests for schema, config code, connection context, and connection presentation. Full app unit tests should be run if the existing worktree baseline permits; unrelated pre-existing failures must be called out separately.

## Native Replication Notes

Native clients store only `hostModelId` in the connection record. They bundle equivalent image/logo assets locally and resolve display metadata through the same ids. The add/edit picker is a single unified host selector with chips as filters, not a two-level category browser. Cloud server entries use official provider visuals and the `cloud-server` kind tag, but they share the same list card behavior as physical computers.
