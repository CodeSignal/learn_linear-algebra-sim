# client – AGENTS

Front-end shell for the CodeSignal Linear Algebra Playground. Read this file
before editing any asset under `client/`, then consult the sub-AGENTS inside
`client/core/` and `client/modes/`.

## Layout + Asset Ordering
1. `index.html` is the only HTML entry point. Keep `<body class="bespoke">`.
2. CSS order (top→bottom) is fixed: Design System foundations
   (`design-system/colors/colors.css`, `design-system/spacing/spacing.css`,
   `design-system/typography/typography.css`), Design System components
   (`design-system/components/*`), then `bespoke.css` (Bespoke base styles
   using Design System tokens directly), `layout.css`, `vector-mode.css`,
   `matrix-mode.css`, `tensor-mode.css`, plus any extra sheets appended after
   the Bespoke base.
3. Script order matches `index.html`: `help-modal.js`, `logger.js`, core block
   (`status.js`, `config.js`, `sidebar-sections.js`, `help.js`,
   `mode-manager.js`, `color-utils.js`, `theme-service.js`, `results-panel.js`,
   `format-utils.js`, `vector.js`, `animator.js`, `coordinate-system.js`,
   `viewport-controller.js`),
   `app.js`, entities (`entities/matrix.js`), mode scripts
   (`client/modes/*`), then `linear-algebra.js` last. New shared utilities go
   in the core block; new modes sit with the mode scripts.
4. Template placeholders (`<!-- APP_TITLE -->`, etc.) in legacy templates must
   be replaced exactly once; do not reintroduce them.

## Key Files
- `index.html` – hosts sidebar + canvas layout, status area, and both `.mode-content`
  containers. Toggle visibility exclusively through `ModeManager.updateUIVisibility`.
- `bespoke.css` - Base Bespoke primitives expressed directly with Design System
  tokens (`--Colors-*`, `--UI-Spacing-*`, `--UI-Radius-*`). No legacy
  `--bespoke-*` variables remain; extend styles by using the Design System
  tokens instead of introducing new compatibility shims. Component semantics
  live in `BESPOKE.md`.
- `layout.css` / `vector-mode.css` / `matrix-mode.css` / `tensor-mode.css` –
  safe locations for app-level overrides. Use Design System tokens for spacing,
  radii, and colors; avoid reintroducing bespoke-prefixed variables. Test both
  light/dark schemes after overrides.
- `linear-algebra.js` – runtime entry point: loads config, initializes
  `CanvasThemeService`, registers vector/matrix/tensor modes, renders mode
  buttons based on `enabledModes`, and flips active mode via
  `ModeManager.setMode`. Treat `STYLE_CONSTANTS` as immutable design tokens.
- `app.js` – bootstraps `HelpService.initializeHelpModal` and manages the
  resilient WebSocket client. On every connection event (open/close/error),
  fall back to `StatusService.setReady()`. New message handlers must guard JSON
  parsing with try/catch and default to ignoring unknown payloads; help content
  updates on mode change via `HelpService.updateHelpContent`.
- `help-modal.js` + `help-content-*.html` – shared help modal infrastructure.
  Content is loaded per mode through `HelpService`; clone the template file
  when adding new help sections.
- `config.json` – student-editable toggles for default mode and operation
  groups. Runtime consumers must go through `ConfigService`.
- `logger.js` – exposes global `logAction(message)` that POSTs to `/log` and
  silently ignores failures. Always use this helper instead of hand-rolled
  fetches.
- `entities/matrix.js` – immutable 2×2 matrix model used by matrix mode
  (no AGENTS required because it is <1000 LOC).
- `modes/tensor-mode.js` + `modes/tensor-canvas-3d.js` – 3D tensor explorer
  with drag-to-rotate and scroll-to-zoom interactions.

## Runtime Contracts
- Call `CanvasThemeService.init(STYLE_CONSTANTS)` once (already done in
  `linear-algebra.js`). Per-mode code should subscribe via
  `CanvasThemeService.subscribe` and push updated palettes into their renderers
  and `CoordinateSystem`.
- `ModeManager.registerMode(name, factory)` defers heavy instantiation until
  the mode activates. Factories must return an object that implements
  `destroy()`; clean up DOM listeners, `requestAnimationFrame` loops, and theme
  subscriptions there. An optional `getState()` is called before `destroy()`;
  its snapshot is passed back to the factory the next time that mode
  activates, so switching modes keeps user work (vector mode keeps its
  vectors and coordinate mode). Mode buttons and visible containers are
  driven by `enabledModes` from config; disabled modes are hidden.
- Always route status changes through `window.StatusService`. Only the verbatim
  strings listed in the root AGENTS are allowed.
- Config data flows: `ConfigService.loadConfig()` fetches `config.json`, merges
  defaults, and caches. `linear-algebra.js` freezes the resulting object; never
  mutate it downstream. It resolves `<mode>Mode.sections` (plus legacy
  `operationGroups`) for vector, matrix and tensor via
  `SidebarSections.resolveSections(mode, sections, operationGroups)` before any
  mode is created.
- Every configurable sidebar block carries `data-section="<key>"`; wrappers
  that should disappear once empty carry `data-section-container`. New sidebar
  sections must add their key to `SIDEBAR_SECTIONS` and to `config.json`.
- Every learner-facing feature must be switchable from `config.json`, defaulting
  to on (see the README's config reference). App-wide switches live in `ui`
  (resolved in `linear-algebra.js`); per-mode switches and starting values are
  read in each mode's `readOptions()` with `window.ConfigOptions`. New features
  get a switch and a README entry in the same change.
- Log every user-triggered operation (`VectorOperations`, `MatrixMode`
  transforms, config changes) via `logAction`.
- LocalStorage, fetch, and WebSocket code must be wrapped in try/catch with
  clear console errors plus user-friendly statuses. Explicitly detect and surface
  `QuotaExceededError` when writing to storage.

## HTML + UI Expectations
- Header exposes status area (`#status`) and `#btn-help`. Help modal theme must
  stay `'auto'`.
- `.mode-content[data-mode]` containers remain mounted; toggling is done by
  adding `.active` / `.hidden` classes (see `ModeManager`).
- Results panels use `ResultsPanel` (from `client/core`) for consistent markup.
  Instantiate once per sidebar, reuse for all operations.
- Buttons and inputs use Design System components (`.button`, `.input`) from
  `client/design-system/`. Layout structure uses Bespoke classes (`.sidebar`,
  `.card`, `.row`, `.toggle`, etc.). Follow spacing tokens from the Design
  System (`--UI-Spacing-*`); no magic numbers outside `linear-algebra.css`
  derivatives.
- Sidebar UI patterns (styles in `layout.css`): `.sidebar-toolbar` (mode
  settings + a small tertiary Reset), `.sidebar-section-header` with a
  `.sidebar-title` label, and one `<details class="operation-group">` card per
  operation with `.operand-row` / `.operation-actions` inside. Action buttons
  are `button-secondary button-xsmall`; avoid full-width primary buttons.
- App tokens live on `.bespoke` in `layout.css` (`--la-border`,
  `--la-card-bg`, `--la-canvas-*`, …) with dark-mode values. Use them instead
  of `--Colors-Stroke-Default`, which is a light color in dark mode.
- `#view-controls` (zoom +/−, Reset view) sits top-right on the canvas and is
  shown only while a 2D mode's `ViewportController` is alive.

## Logging + Diagnostics
- Server logging is append-only; `logs/user_actions.log` lives outside this
  directory. When testing logging, run the curl commands from the root README
  or root AGENTS instructions.
- Use DevTools overlays built into the app (axis grid, status area) for manual
  verification; no automated tests are expected.

## Documentation Chain
- Changes touching shared services must also update `client/core/AGENTS.md`.
- Changes touching vector or matrix controllers must update
  `client/modes/AGENTS.md`.
- All contributors must read `BESPOKE.md` to stay compliant with Bespoke
  theming and markup constraints.
