# Repository Guidelines

## Scope

Bottle Harmony is a new iOS and Android water sort puzzle project.
Bottle Harmony is a pre-release iOS and Android water sort game. The active app now uses a fixed, solver-validated 1,000-level sequential mainline, free undo/reset/one-step hints, completed-level replay, local restoration, eleven logical colors and at most twelve bottles in two rows. Keep the approved glass visuals and tap-to-pour behavior. All 4–12 bottle boards use the same large bottle size for a given screen, distributed across the full screen width with at most six per row. The user explicitly allows pouring bottles to cross a horizontal screen edge and be clipped; do not shrink bottles or reserve side space to keep moving artwork entirely visible. Logical state commits before animation and is independent of UI and storage. The reusable core has stable bottle/color IDs, explicit equal four-layer capacity, shared rules/sessions, incremental bounded BFS/A* and strict level encoding. Generation supports balanced-shuffle-v1 and layered-shuffle-v1, two to eleven colors, one or two spares, color conservation, source reconstruction, full route replay and exact structural deduplication. Colors plus spares must not exceed twelve.

Read docs/production-plan.md, docs/generation.md and docs/play-flow.md before changing content, progression or persistence. The thousand-waves-v3 recipe has exact D1/D2/D3/D4 quotas 300/300/305/95 and internal ranks 1–8 quotas 300/300/105/200/20/20/25/30. Every tenth closing node is rank 4 or higher; all 100 closing scores are nondecreasing and have no stage color preference. Ordinary levels prefer overlapping bands 6–9 (1–50), 7–10 (51–250), 8–10 (251–450), 8–11 (451–700), 9–11 (701–1000), with only three two/three-color teaching levels. Preferences are soft and sizes may rise, fall or repeat. D3/D4 initially filled bottles each contain at least three colors and at most two layers of any color, including nonadjacent layers. This is a source/import filter; merging during play is unrestricted.

The eight-grade offline planning-depth-v1 / planning-load-v1 model and its fixed ordering score require complete lower-policy checks. Read docs/difficulty-calibration.md before changing evaluation. Limited search is unknown, never high difficulty or impossibility. Target screening can reject a candidate after a complete failure of its requested policy but must emit no substitute grade. The actual thousand records have been independently recomputed, source reconstructed, fully replayed and globally deduplicated. assets/levels/mainline-catalog.json contains full provenance/evidence; mainline-play.json is an exactly checked compact playable projection used at startup. The phone never computes full strategy ratings. The full report is loaded lazily in the internal debugger. Eight C samples and the original demo remain internal comparisons; earlier 80-entry data supports regression tools and is not the active app pool.

Mainline and replay sessions are saved separately under one current mainline schema using AsyncStorage. Uncompleted levels unlock in order, no mainline skip; replay and internal previews never credit or replace the pending mainline board. Completion ends at 1000. Optional color-linked symbols are saved locally. app.json extra.internalTools=true retains calibration, production previews and debug reports in the user's internal build; set false for formal UI. Internal preview is not persisted and does not unlock levels. Do not add migrations or archives for unshipped experiments.

The user approved the original iPhone 12 Pro Max and low-end Android visuals/interactions, and later authorized direct thousand-level production and phone installation. Desktop production measurements are documented in docs/production-benchmark.md and are not mobile performance evidence. Quantitative rendering/solver/storage performance, sustained play and formal release checks remain device work. Measure TypeScript/Hermes first and use C++ only if mobile results justify it. The user authorized a completion celebration with two/three/four/five physically rising and falling fireworks for D1/D2/D3/D4, plus locally remembered, switchable firework sound effects. Celebration is presentation only and never grants progression; it overlays the completed board without a separate card and reveals continue after the visual ends. Back, undo, reset and backgrounding cancel the presentation. Other audio, daily modes, mechanisms, chapters, friends, accounts, lives, timers, payments and advertising remain out of scope. Confirm an additional game behavior boundary before expanding it. Store submission awaits reviewed publishing identity, original icon/materials and release verification.

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
