# Connection Host Type

## Architecture

Connections now carry an optional visual host identity through `ConnectionRecordV2.hostModelId`. The value is a stable local catalog id only; brand, model, image, logo, kind label, search keywords, filters, and source URL are resolved from `mcode-app/src/services/connectionHostCatalog.ts`.

Host images and logo marks are bundled under `mcode-app/src/static/connection-hosts/`. Physical computers and cloud servers share the same catalog and picker. The default and fallback id is `other-computer`.

## Protocol And Data Flow

The storage schema change is additive and keeps protocol version `2`. Normalization preserves known `hostModelId` values and drops unknown ids. Config-code export/import includes the field when present, so another client can preserve the host presentation without receiving asset paths or display strings.

Connection identity and dedupe do not include `hostModelId`. Changing only the selected host model must not disconnect, reconnect, or change linked/online state because the actual direct or gateway endpoint is unchanged.

## UI Behavior

The add/edit connection sheet shows `电脑/主机型号`. Tapping it opens a unified host picker with search, filter chips, brand/model cards, local imagery, kind tags, and selected state. Chips are filters only; cloud server entries such as Alibaba Cloud ECS and AWS EC2 appear in the same result list as laptops, desktops, and mini PCs.

The host picker filter row is horizontally scrollable on narrow screens. Individual chips must not shrink or wrap, so labels like `云服务器` and `Mini PC` remain single-line even when the chip list overflows the viewport.

Connection list cards are host-forward: the leading visual is the host image, the title line shows logo plus brand/model, and the saved connection name becomes a secondary alias. Existing status pill, subtitle, capability chips, health warning, menu actions, and project navigation behavior stay unchanged.

## Compatibility

Existing connections without `hostModelId` remain valid and render as `Other Computer`. Missing image assets or image load failures fall back to the local `other-computer` asset without mutating saved records.

Older config codes without the field import normally. New config codes with an unknown id still import the connection after dropping the host field. No backend, gateway, ACP, direct-pair, relay-session, project navigation, or connection-detail protocol change is required.

## Native iOS/Android Guidance

Native clients should store only `hostModelId` in their connection record and bundle equivalent local assets keyed by the same ids. The native catalog must keep ids and labels aligned with the app catalog, including cloud server entries in the same picker/list rather than a separate first-level category.

Native connection cards should resolve brand/model/logo/image from the local catalog at render time, treat missing ids as `other-computer`, and keep connection identity based on route mode and endpoint only. Export/import flows should serialize the id but never serialize image paths, remote image URLs, or local-only connection record ids.
