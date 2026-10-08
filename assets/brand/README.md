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

Export validation passed: configured asset paths exist, app icon is opaque 1024×1024, Play icon is 512×512 RGBA under 1 MB, and both adaptive alpha masks stay within the safe circle. The two export scripts passed ESLint. The preview was visually checked; native launcher/device acceptance awaits the next build.

Specifications: [Google Play icon design](https://developer.android.com/distribute/google-play/resources/icon-design-specifications), [Android adaptive icon safe zone](https://developer.android.com/codelabs/basic-android-kotlin-compose-training-change-app-icon).

These files update source assets only. Existing installed apps and the previously uploaded AAB retain the old icon until a new native build is made. Console upload status is tracked separately in `store/google-play/README.md`.
