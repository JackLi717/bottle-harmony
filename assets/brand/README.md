# Approved icon

The owner selected graphic comparison candidate **4** on 2026-10-08: glass pouring scene with an open coral prohibition circle/slash over ivory AD letters at lower-right.

- `icon-master.png`: full-bleed opaque production artwork; source for iOS, legacy Android, web favicon and Google Play.
- `icon-foreground-source.png`: generated transparent color artwork for Android adaptive export.
- `icon-monochrome-source.png`: generated simplified white-on-black artwork; luminance becomes alpha for Android system tinting.
- `icon-prompts.json`: exact built-in ImageGen prompts and generated source paths.
- `icon-exports.json`: output dimensions, sizes and SHA-256 hashes.
- `icon-export-preview.png`: left to right: store artwork, Android square visible area, circular mask, themed monochrome.

With Node.js 24, run `node --experimental-strip-types scripts/render-icons.ts` from the repository root to reproduce icon exports. `npm run brand:render` calls this same exporter before generating the existing feature graphic and policy.

Android layers keep visible artwork within the central 66/108 safe circle with a small antialiasing margin. The background is separate and opaque. Store and iOS artwork has no baked-in rounded corners.

The approved exports are used by the current app configuration and store materials. Validation covers configured paths, an opaque 1024×1024 app icon, a 512×512 Play icon under 1 MB, and adaptive masks inside the safe circle. Native/simulator evidence and remaining device checks are owned by [device support](../../docs/device-support.md).

Specifications: [Google Play icon design](https://developer.android.com/distribute/google-play/resources/icon-design-specifications), [Android adaptive icon safe zone](https://developer.android.com/codelabs/basic-android-kotlin-compose-training-change-app-icon).

Changing these files requires a new native build to update installed launcher artwork. Current versions, exact upload artifacts and store status are tracked in [Google Play materials](../../store/google-play/README.md) and [release status](../../docs/release-readiness.md); this asset document does not maintain a separate release version.
