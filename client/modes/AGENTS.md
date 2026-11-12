# client/modes – AGENTS

Mode-specific controllers and UI bindings live here. Each mode must clean up
after itself, respect shared services (`ModeManager`, `CanvasThemeService`,
`StatusService`), and log all user-triggered operations.

## Shared Expectations
- Modes are instantiated lazily via `ModeManager.registerMode(name, factory)`
  inside `linear-algebra.js`. The factory must return an object with `destroy()`
  that removes DOM listeners, cancels animations, and unsubscribes from
  `CanvasThemeService`.
- Always pass the shared `CoordinateSystem` into mode constructors so grid size,
  snapping, and theme colors stay in sync across modes.
- Use `ResultsPanel` (one per mode container) for all textual output.
- Log every button-triggered action through `logAction(message)`; never block UI
  if logging fails.
- Honor config gating: call `SidebarSections.applySections(root, sections)`
  with `appConfig.<mode>.sections` (merged with any mode-specific structural
  rules) at the start of the constructor, before caching elements. Every
  element lookup must tolerate a removed section. Visibility is never
  user-controlled.
- UI components: Use Design System components (`.button`, `.input`, `.box`) from
  `client/design-system/` for interactive elements. Layout structure uses
  Bespoke classes (`.sidebar`, `.card`, etc.). Both systems work together;
  Design System provides modern components while Bespoke provides layout
  scaffolding.

## Vector Mode Stack
Files: `vector-mode.js`, `vector-canvas.js`, `vector-sidebar.js`,
`vector-operations.js`.

1. **VectorMode**
   - Orchestrates the canvas, sidebar bindings, animation state, and theme
     subscriptions.
   - Maintains the canonical `vectors` array (sorted by `id`) plus
     `resultVector` and interaction state (drawing/editing flags, hover
     targets). The vector cap is `min(appConfig.vectorMode.maxVectors,
     VECTOR_LIMIT)` with `VECTOR_LIMIT = 12`.
   - `applySidebarSections()` runs first in the constructor: it removes
     sections hidden by `vectorMode.sections` (`coordinateMode`, `reset`,
     `vectorList`, and each operation group), plus `TWO_VECTOR_SECTIONS`
     when the cap is 1.
   - User vectors are created via `createVector(id)`: new vectors take the
     lowest free id, are labelled `vₙ`, use
     `styleConstants.colors.vectorPalette[id - 1]`, and carry `id`,
     `subscript`, and `name` (plain `vn` for logs). Remove individual vectors
     with `removeVector(id)`.
   - Typed input from the sidebar goes through `addVectorFromInput(x, y)` and
     `setVectorComponents(id, x, y)`. Both cancel running animations and
     clear visualizations, as drag edits do. `logVectorEdit(id)` logs a typed
     edit once, when the user leaves the row. Dragging stays the other way to
     create and edit vectors.
   - Operations resolve operands from sidebar dropdowns via
     `getOperand(key)`; never assume fixed operand slots.
   - `cancelAnimations()` stops both the parallelogram phase and the result
     animation; call it before clearing or removing vectors.
   - Owns a `ViewportController` (`viewKey: 'vector'`): Space/middle/right
     drag pans and the wheel zooms, while plain left drag keeps drawing and
     editing vectors. Destroy it in `destroy()`.
   - Uses `Animator` to run smooth transitions (addition, subtraction, scalar
     multiplication, parallelogram fills). Store the `animationControl` and
     cancel it in `destroy()`.
   - Calls `sidebar.update*` helpers whenever vectors change; keeps coordinate
     display mode (`cartesian` vs `polar`) in sync with the dropdown.
   - When responding to canvas events:
     - Convert coordinates via `VectorCanvas.screenToMath`.
     - Snap endpoints with `VectorCanvas.snapToGrid` (0.5 increments).
     - Update `StatusService` only for long-running ops; default back to
       `"Ready"` after animations complete.
   - Theme handling: `CanvasThemeService.subscribe` triggers `loadColors()` →
     update `CoordinateSystem`/`VectorCanvas`/result vector colors, then rerender.
2. **VectorCanvas**
   - Pure renderer; no DOM queries outside the canvas context.
   - Renders grid/axes through the shared `CoordinateSystem`, draws vectors,
     parallelogram edges, angle arcs, negated vectors for subtraction, and
     linear combination scaffolding.
   - Exposes hit-testing helpers (`checkEndpointHit(x, y, vectors)` returns
     the topmost hit vector) and transformation proxies (`screenToMath`,
     `mathToScreen`).
3. **VectorSidebar**
   - Caches all DOM references once in the constructor; no repeated queries.
   - `setupEventListeners` wires handlers provided by `VectorMode`. When new
     controls are added, extend the handler map to keep setup consistent.
   - Owns the `ResultsPanel` instance located at `#vector-results`.
   - Renders the vector list (`#vector-list`). Rows are keyed by vector id in
     `vectorRows` and updated in place; never rebuild the list wholesale,
     and never overwrite fields in a row that holds focus (the user is typing
     there). All row events (input, keydown, focusin/out, remove clicks) are
     delegated from the container.
   - Each row has two text coordinate fields: x/y in Cartesian mode, r/θ°
     in Polar mode. Input is parsed with a comma or a dot as the decimal
     separator, and in polar mode r must be ≥ 0. Invalid fields get
     `.is-invalid` and leave the vector unchanged. Valid input calls
     `onVectorInput(id, x, y)` live, Escape restores the value from when the
     row gained focus, and leaving the row calls `onVectorCommit(id)` (the
     logging point). Untouched fields read back their exact value, not the
     2-decimal display.
   - `#vector-add` (+) opens a draft row labelled with the next free slot
     (`nextVector`, passed by `VectorMode.peekNextVector()`). Enter or ✓
     submits a valid, non-zero vector via `onAddVector(x, y)`; Escape or ×
     cancels. The draft converts its values when the coordinate mode
     changes and closes when the vector limit is reached.
   - Also owns every operand dropdown listed in
     `OPERAND_SELECTS`. `updateVectorOptions(vectors)` rebuilds them only when
     the set of vector ids changes, keeps explicit user picks, and otherwise
     falls back to each select's `defaultSlot`.
   - The Design System `Dropdown` overwrites its container's `className`, so
     layout classes (e.g. `.operand-select`) go on a wrapper element.
   - `updateUI()` (inside `VectorMode`) should drive button enabling/disabling
     through methods on this class; keep logic centralized here.
4. **VectorOperations**
   - Stateless math helper. Returns objects containing:
     - `resultVector` (if applicable).
     - `resultLines` array (strings/HTML for `ResultsPanel`).
     - Optional visualization hints (`parallelogramVectors`, `angleArcState`,
       `clearParallelogram`, `clearAngleArc`, `scaledV1/V2`).
   - Operand-agnostic: formulas and result labels are built from the operand
     vectors' `label`/`subscript`, and logs use their `name`.
   - Sets `Vector.defaultResultColor` from `styleConstants` so result vectors
     stay on-brand.
   - Logging lives here; emit enough context (operation type, operands, result).

## Matrix Mode
File: `matrix-mode.js` (uses `client/entities/matrix.js` and `client/core/vector.js`).

- Maintains matrices A and B (when allowed by config) plus a vector slot when
  `appConfig.matrixMode.includeVector` is true. Basis vectors î and ĵ always
  exist for rendering and determinant shading.
- Subscribes to `CanvasThemeService` for color updates, propagates theme colors
  into `CoordinateSystem`, and caches accent/danger hues for determinant
  shading.
- Config-driven visibility:
  - `maxMatrices` < 2 hides matrix B; `includeVector` hides matrix B, shows the
    vector inputs, and strips B from the determinant dropdown.
  - `sections` governs reset, addition, scalar multiplication,
    multiplication, linear transformation and determinant. In `includeVector`
    mode the two-matrix operations hide regardless of config; when
    `includeVector` is false, linear transformation always hides.
- UI bindings:
  - Input events update stored matrices/vector, log via `logAction`, and
    rerender preview/determinant overlays.
  - `#show-determinant` toggles the determinant area overlay; wrap async work in
    `StatusService.setLoading()` / `setReady()`.
  - `#matrix-reset` restores the identity matrix (and vector defaults) and
    clears results.
- Rendering responsibilities:
  - Draw transformed basis vectors, parallelogram area, and orientation cues on
    the shared canvas.
  - When determinant visualization is enabled, output explanation lines to the
    `ResultsPanel` (det value + orientation).
- Owns a `ViewportController` (`viewKey: 'matrix'`,
  `panWithPrimaryButton: true`) and registers a resize callback that
  re-renders.
- Destroy path must remove event listeners from all inputs/buttons,
  unsubscribe from `CanvasThemeService`, destroy the viewport controller, and
  clear the resize callback.

## Tensor Mode
File: `tensor-mode.js` (uses `tensor-canvas-3d.js`).

- Visualizes tensors of different ranks (0-3) in an interactive 3D space. The
  constructor receives `canvas`, `appConfig`, `styleConstants`, `coordSystem`,
  and `rootElement`.
- State management: maintains `rank` (0-3) and `tensorData` object containing
  `scalar`, `vector`, `matrix`, and `tensor3d` properties. The starting rank is
  the lowest rank left visible by `tensorMode.sections` (`rank0`..`rank3`).
- Theme subscription: subscribes to `CanvasThemeService` via
  `CanvasThemeService.subscribe()`, stores unsubscribe callback in
  `this.themeUnsubscribe`. On theme change, calls `loadColors()` which propagates
  colors to `TensorCanvas3D.setColors()` and `CoordinateSystem.updateColors()`.
- UI bindings:
  - Rank selector buttons (`.rank-btn[data-rank="0-3"]`) switch between tensor
    ranks and update the input UI dynamically.
  - Input fields are generated per rank: scalar input (rank 0), vector x/y
    inputs (rank 1), matrix grid inputs (rank 2), tensor3d slice inputs (rank 3).
  - `#tensor-reset` button restores default tensor values.
  - All input changes and rank switches log via `logAction()` with descriptive
    messages; never block UI if logging fails.
- Rendering: delegates 3D visualization to `TensorCanvas3D` instance. Renders
  different layouts per rank:
  - Rank 0: single cube at origin
  - Rank 1: two cubes horizontally (x/y components)
  - Rank 2: 2×2 grid of cubes (matrix elements)
  - Rank 3: 2×2×2 cube of cubes (tensor slices)
- Input handling: `attachInputListeners()` binds handlers to dynamically
  generated inputs. Handlers update `tensorData`, log changes, and call `render()`.
  Input listeners are tracked in `this.eventListeners` array for cleanup.
- 3D interaction: `TensorCanvas3D` handles mouse drag (rotation) and wheel
  (zoom) events. Canvas interaction state is managed internally by
  `TensorCanvas3D`.
- Config gating: respects `enabledModes` array in `config.json`. Tensor mode
  only appears in mode switcher if `"tensor"` is included in `enabledModes`.
  `setupUI()` renders rank buttons only for visible ranks (falling back to all
  ranks with a warning if none are), omits the rank selector when a single
  rank remains, and then applies `tensorMode.sections` (`reset`,
  `controlsHint`) via `SidebarSections.applySections`.
- Container location: `.mode-content[data-mode="tensor"]` in `index.html`.
- Destroy path: removes all event listeners from `this.eventListeners` array,
  unsubscribes from `CanvasThemeService` via stored `this.themeUnsubscribe`
  callback, calls `tensorCanvas3D.destroy()` to clean up canvas interaction
  listeners, clears `root.innerHTML`, and nullifies handler references.

## Extending Modes
- Follow the existing decomposition (controller + renderer + sidebar + math) to
  keep logic testable.
- New modes must define `.mode-content[data-mode="new-mode"]` in `index.html`
  and register via `ModeManager.registerMode('new-mode', factory)`.
- Update `linear-algebra.js` to set the default mode via config and to register
  the new factory. Document the additions in this AGENTS file immediately.
