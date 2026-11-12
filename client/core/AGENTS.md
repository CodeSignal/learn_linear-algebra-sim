# client/core – AGENTS

Shared services, utilities, and math primitives that power both vector and
matrix modes. These modules must stay framework-free, DOM-light, and reusable
across future Bespoke apps.

## Loading Order + Globals
- Files are loaded (via `<script>` tags) in deterministic order before
  `linear-algebra.js`. Do not introduce circular dependencies.
- Each module attaches itself to `window.*` or defines a global class. Keep
  those names stable; the rest of the app references them directly.

## Modules
- `status.js` (`window.StatusService`)\
  - Sole gateway for status text. Only expose the allowed verbatim strings.
  - Gracefully handle missing `#status` (warn once, no throws).
- `config.js` (`window.ConfigService`)\
  - Fetches `./config.json`, merges with `DEFAULT_CONFIG`, caches the result,
    and emits `StatusService.setLoading()` / `setReady()` / `setLoadFailed()`.
  - Returns *mutable* objects internally but callers must treat them as frozen
    because `linear-algebra.js` wraps them in `Object.freeze`.
  - Expose `clearCache()` for manual reloads/tests.
- `sidebar-sections.js` (`window.SidebarSections`)\
  - `SIDEBAR_SECTIONS` is the source of truth for configurable section keys per
    mode (vector, matrix, tensor).
  - `resolveSections(mode, sections, legacyOperationGroups)` returns a frozen
    `{ key: boolean }` map with every key. Accepts `{ "shown": bool }` or a
    bare boolean; missing keys are shown; unknown keys and malformed values
    `console.warn` and are ignored. `sections` overrides `operationGroups`.
  - `applySections(root, sections)` removes `[data-section]` elements whose
    flag is false, then removes `[data-section-container]` wrappers left
    without sections. Removal is permanent for the page session, so callers
    must run it before caching elements and must tolerate missing elements.
  - `isShown(sections, key)` for logic that depends on a section.
- `mode-manager.js` (`window.ModeManager`)\
  - Owns `.mode-content` visibility and the shared `CoordinateSystem`.
  - `renderModeButtons(enabledModes)` + `hideDisabledModeContainers(enabledModes)`
    drive what the user sees based on `config.json.enabledModes`.
  - `onModeChange(callback)` notifies helpers like the HelpService when the
    active mode flips.
  - `registerMode(name, factory)` stores factories that must return instances
    exposing `destroy()`.
  - `setMode(name)` tears down the current instance (wrapped in try/catch) and
    applies `.active`/`.hidden` classes. Never mutate the DOM for mode toggles
    elsewhere.
- `help.js` (`window.HelpService`)\
  - Lazily fetches `help-content-template.html` once, initializes `HelpModal`,
    and supports `appendHelpContent()`. Always call `initializeHelpModal`
    before appending extra sections.
- `theme-service.js` (`window.CanvasThemeService`)\
  - Initialized exactly once with `STYLE_CONSTANTS`. Provides `getColors()`,
    `subscribe(callback)` (returns unsubscribe fn), and cleans up media-query
    listeners via `destroy()`. Subscribers must unsubscribe inside their
    `destroy()` implementation.
- `color-utils.js` (`window.ColorUtils`)\
  - Reads CSS custom properties under `.bespoke` (which are mapped from Design
    System tokens via `bespoke.css`). Use this to keep colors responsive to
    theme changes instead of hard-coding hex values.
- `animator.js` (`class Animator`)\
  - Pure animation helpers (ease curves, `animate`, `lerp`, `lerpVector`).
    Returns a control object with `cancel()`. Modes must cancel outstanding
    animations inside `destroy()`.
- `coordinate-system.js` (`class CoordinateSystem`)\
  - Handles canvas sizing, grid/axis drawing, coordinate transforms, hover
    hit-testing helpers, and translated vector rendering. Register resize
    callbacks via `setResizeCallback`.
  - Transforms use the active view `{ scale, offsetX, offsetY }` (pixels per
    unit, origin offset from canvas center in pixels). Each 2D mode calls
    `activateView(key)` (done by `ViewportController`) so pan/zoom is kept per
    mode. `centerX`/`centerY` are getters for the origin's screen position.
  - View API: `getScale()`, `panBy(dx, dy)`, `zoomAt(x, y, factor)` (clamped
    to `styleConstants.viewport.minScale/maxScale`), `resetView()`,
    `isDefaultView()`. Never read `styleConstants.gridSize` for drawing; use
    `getScale()`.
  - Grid lines and tick labels cover only the visible area, with spacing from
    `getGridStep()`; tick labels pin to the canvas edge when an axis is
    off-screen.
- `viewport-controller.js` (`class ViewportController`)\
  - Adds pan (middle/right drag, Space + left drag, or plain left drag with
    `panWithPrimaryButton`) and cursor-anchored wheel/pinch zoom to a 2D mode.
    Pan gestures are handled and stopped in the window capture phase so mode
    canvas handlers never see them.
  - Options: `viewKey`, `onChange` (throttled to one call per frame),
    `panWithPrimaryButton`, `resetButton` (shown only when the view differs
    from the default). Logs pans, zooms (debounced), and resets via
    `logAction`. Modes must call `destroy()` in their own `destroy()`.
- `vector.js` (`class Vector`)\
  - Immutable 2D vector with math helpers (`add`, `subtract`, `scale`, `dot`,
    projections, reflections, normalization, perpendicular, angle utilities).
    `Vector.defaultResultColor` should be overridden through `Vector.setDefaultResultColor`
    so that result vectors track the theme.
  - `Vector.polarToCartesian(r, thetaDegrees)` returns `{x, y}` rounded to
    1e-10 (so θ=90° gives x=0); use it for any polar input.
- `results-panel.js` (`class ResultsPanel`)\
  - Lightweight wrapper that writes formula/result markup into a container.
    Use `.show(...lines)` and `.clear()` rather than manipulating DOM manually.
- `format-utils.js` (`window.FormatUtils`)\
  - HTML formatting helpers for matrices (`formatMatrixAsGrid`) and vectors
    (`formatVector`). Use them whenever results need inline math formatting.

## Cross-Cutting Rules
- Keep modules idempotent: calling init/load functions multiple times should be
  safe (e.g., `CanvasThemeService.init` ignores missing constants, `HelpService`
  warns on double init).
- Every async function (`ConfigService.loadConfig`, `HelpService` fetches)
  must `console.error` on failure and fall back to usable defaults (e.g.,
  placeholder help copy).
- Never mutate DOM outside the module’s intended surface (e.g., `ResultsPanel`
  can write into its container, but `Vector` must remain math-only).
- All exports should be documented here whenever new files are added. If you
  add another shared service, update this AGENTS file before landing the code.
