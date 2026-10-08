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

Export validation passed: configured asset paths exist, app icon is opaque 1024×1024, Play icon is 512×512 RGBA under 1 MB, and both adaptive alpha masks stay within the safe circle. The two export scripts passed ESLint. The preview was visually checked. The approved assets are included in the 0.1.1 (Android mobile versionCode 5) test build; native/simulator evidence and remaining real-device checks are recorded in [device support](../../docs/device-support.md).

Specifications: [Google Play icon design](https://developer.android.com/distribute/google-play/resources/icon-design-specifications), [Android adaptive icon safe zone](https://developer.android.com/codelabs/basic-android-kotlin-compose-training-change-app-icon).

Changing these files requires a new native build to update installed launcher artwork. That build has been made for the current 0.1.1 test release; do not treat the older 0.1.0 AAB as the current upload. Store materials and release status are tracked in [Google Play materials](../../store/google-play/README.md) and [release status](../../docs/release-readiness.md).
