# Repository Guidelines

## Scope

Bottle Harmony is a new iOS and Android water sort puzzle project.
The approved current scope includes the reusable portrait visual demo, general level core, and seeded content tools. The core provides stable color/bottle IDs, shared explicit capacity, unified rules/sessions, bounded incremental solver, and JSON level encoding/decoding. The generator covers ordinary four-layer bottles, two to five colors, one or two empty bottles, full solution replay, basic filters, structural deduplication, and validated content-pool import/export. The visible demo remains two colors and four bottles with tap-to-pour animation, undo/reset, and phone/tablet adaptation. Its appearance and performance have been approved on iPhone and low-end Android; expanded solving/generation still needs mobile performance measurement. Measure TypeScript first and consider a C++ backend only if mobile results justify it. Difficulty rating, additional modes, special mechanisms, chapters, friends, accounts, time credits, audio, and saved progress are not implemented. Confirm the next feature's boundary before expanding game behavior.

Work directly on main. Do not create feature branches or worktrees unless the user requests them. Keep this project independent from sibling projects.

## Development

Use Node.js 24 and npm. Keep package-lock.json current. Use Expo's compatible dependency versions and expo install for native libraries.

- npm start: Metro for the installed development build.
- npm run ios / npm run android: generate, build and launch a native development app.
- npm run typecheck: strict TypeScript checks.
- npm run lint: Expo ESLint checks.
- npx expo install --check / npx expo-doctor: dependency and configuration checks.

Native ios/ and android/ directories are generated from app.json with Expo Prebuild and are ignored by Git. Express native changes through app configuration or config plugins.

## Code and Tests

Use TypeScript, PascalCase for components and types, camelCase for functions, and use prefixes for hooks. Keep game rules and solver code independent from UI, animations and persistence.

Add meaningful tests when game behavior is implemented. Animation completion must not be the source of truth for liquid state. Do not generate or publish levels without solver validation.

## Stage

Pre-release development. Maintain one current internal baseline; do not introduce historical archives or migrations for unshipped experiments. Template icons and the initial application identifier must be reviewed before publishing.
