# mcode-app source JS cleanup

## Architecture

`mcode-app` keeps authored source in `src/**/*.vue` and `src/**/*.ts`. Runtime builds are expected to flow through the existing uni-app and Vite pipeline into build output directories, not into sibling `.js` files inside `src/`.

This change treats `src/**/*.vue.js` and `src/**/*.js` files that shadow a `.vue` or `.ts` source file as local transpile byproducts. They are removed from the working tree and ignored going forward.

## Protocol and data flow

No protocol, API, storage, or runtime data-flow behavior changes. Module resolution continues to start from `src/main.ts` and the authored `.vue` / `.ts` graph.

## UI behavior

No intended UI change. The cleanup only removes duplicate generated source mirrors that were not part of the intended authored source set.

## Compatibility

The ignore rule is scoped to `mcode-app/src` so normal build outputs elsewhere are unaffected. If a future native or toolchain requirement genuinely needs checked-in authored `.js` under `src`, that file must not be a generated shadow of an existing `.ts` or `.vue` source and the exception should be documented next to the file.

## Native iOS and Android replication

Native clients should treat the `.vue` / `.ts` source behavior as canonical. Do not mirror generated JavaScript siblings into native repositories. Replicate only the authored view structure, state flow, gateway logic, and assets that back the actual product behavior.
