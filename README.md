# CodeSignal Linear Algebra Playground

An interactive educational tool for learning vector operations through visual experimentation. Draw vectors on a 2D Cartesian plane and perform operations like addition, subtraction, scalar multiplication, and dot products with smooth animated visualizations.

![CodeSignal Linear Algebra Playground](https://img.shields.io/badge/CodeSignal-Linear%20Algebra%20Playground-blue) ![Built with Vanilla JS](https://img.shields.io/badge/built%20with-vanilla%20js-yellow)

## Features

### Core Functionality
- **Interactive Vector Creation**: Click and drag on the grid to create vectors (up to 12, each with its own color)
- **Choose Your Operands**: Every operation has dropdowns to pick which vectors it uses
- **Real-time Calculations**: View coordinates, magnitude, and angle for each vector
- **Animated Operations**: Smooth transitions showing vector transformations
- **Formula Display**: Mathematical formulas and calculations shown for each operation
- **Tensor Visualization**: Interactive 3D visualization of tensors (scalars, vectors, matrices, 3D tensors)

### Supported Operations
- ✅ **Vector Addition** (v₁ + v₂)
- ✅ **Vector Subtraction** (v₁ - v₂)
- ✅ **Scalar Multiplication** (with custom scalar values)
- ✅ **Dot Product** (v₁ · v₂)
- ✅ **Magnitude Calculation** (||v||)
- ✅ **Angle Measurement** (in degrees from positive x-axis)

### Modes

The application supports three interaction modes:

1. **Vector Mode**: Draw and manipulate vectors on a 2D Cartesian plane with animated operations
2. **Matrix Mode**: Visualize 2×2 matrix transformations and their effects on basis vectors
3. **Tensor Mode**: Explore tensors of different ranks (0-3) in an interactive 3D space

Modes can be enabled/disabled via the `enabledModes` array in `client/config.json`. The default mode is set via the `defaultMode` property (see [Configuring a Practice](#configuring-a-practice-clientconfigjson)).

### Configuring a Practice (`client/config.json`)

Everything a learner can see or do can be turned on or off in `client/config.json`, and the simulation can open with set starting values. That lets each practice expose only what it needs. Learners can't change any of this from the page: hidden parts are removed, not just styled away.

Every switch defaults to **on** and every starting value to the app's usual default, so a config only has to list what it changes. Switches are `true`/`false` (the `{ "shown": false }` form also works). Unknown keys and bad values are ignored with a `config.json: ...` warning in the browser console, never an error.

#### Modes

| Key | Default | Meaning |
|-----|---------|---------|
| `enabledModes` | `["vector", "matrix", "tensor"]` | Modes in the top switcher |
| `defaultMode` | `"vector"` | Mode the page opens in (always enabled) |

#### App-wide switches: `ui`

| Key | Turns off |
|-----|-----------|
| `helpButton` | The Help button |
| `resultsPanel` | The results panel (operations still draw on the canvas) |
| `zoom` | Wheel / pinch zoom and the + / − buttons (also the scroll zoom in Tensor mode) |
| `pan` | Dragging the view. With `zoom` and `pan` both off, the view is fixed and its controls disappear |

#### Sidebar sections: `<mode>Mode.sections`

| Mode | Section keys |
|------|--------------|
| `vectorMode` | `coordinateMode`, `reset`, `vectorList`, `addition`, `scalarMultiplication`, `dotProduct`, `projectionAngle`, `normalization`, `perpendicular`, `reflection`, `linearCombination` |
| `matrixMode` | `reset`, `addition`, `scalarMultiplication`, `multiplication`, `linearTransformation`, `determinant` |
| `tensorMode` | `reset`, `rank0`, `rank1`, `rank2`, `rank3`, `controlsHint` |

- The "Operations" heading disappears when every operation in it is hidden.
- Matrix mode's `includeVector` still applies: with a vector, the two-matrix operations stay hidden; without one, `linearTransformation` stays hidden.
- In Tensor mode, the rank selector disappears when only one rank is visible.
- The older `operationGroups` booleans (e.g. `"dotProduct": false`) still work; `sections` takes precedence.

#### Vector mode: `vectorMode`

| Key | Default | Meaning |
|-----|---------|---------|
| `maxVectors` | `12` | How many vectors can exist (1–12). With 1, two-vector operations are hidden |
| `vectors` | none | Starting vectors v₁, v₂, …: each `[x, y]`, `{"x": .., "y": ..}` or `{"r": .., "theta": ..}` (degrees). Reset goes back to these |
| `coordinateMode` | `"cartesian"` | `"cartesian"` or `"polar"` for the vector list |
| `interactions.draw` | on | Drawing a new vector by dragging on the grid |
| `interactions.dragTips` | on | Dragging a vector's tip to change it |
| `interactions.typeCoordinates` | on | Typing into a vector's fields (off: values are shown read-only) |
| `interactions.add` | on | The + Add button for typing in a new vector |
| `interactions.remove` | on | The × button on each vector |
| `operations.add`, `operations.subtract` | on | The two buttons in the Addition & Subtraction card |
| `operations.project`, `operations.angle` | on | The two buttons in the Projection & Angle card |
| `reflectionAxes` | all three | Which of `"x-axis"`, `"y-axis"`, `"diagonal"` (y = x) Reflection offers; `[]` hides the card. Unknown names are skipped; a list with no known axis keeps all three |
| `results.polar` | on | The extra `polar: r = …, θ = …` line under vector results |
| `scalar` | `2` | Starting value in the Scalar Multiplication box |
| `coefficients` | `[1, 1]` | Starting Linear Combination coefficients (−9 to 9) |

A card left with one button is titled after it (e.g. "Addition"); a card with no buttons, or Reflection with no axes, is hidden.

#### Matrix mode: `matrixMode`

| Key | Default | Meaning |
|-----|---------|---------|
| `includeVector` | `false` | Show vector v (and Av) instead of matrix B |
| `maxMatrices` | `2` | `1` hides matrix B |
| `matrixA`, `matrixB` | identity | Starting values as rows, `[[a, b], [c, d]]` |
| `vector` | `[1, 1]` | Starting vector v |
| `scalar` | `2` | Starting value in the Scalar Multiplication box |
| `editable.matrixA`, `editable.matrixB`, `editable.vector` | on | Typing into those boxes (off: shown read-only) |

Reset goes back to the starting values.

#### Tensor mode: `tensorMode`

| Key | Default | Meaning |
|-----|---------|---------|
| `values.scalar` | `1` | Rank 0 value |
| `values.vector` | `[2, 1]` | Rank 1 components |
| `values.matrix` | `[[1, 0], [0, 1]]` | Rank 2 rows |
| `values.tensor3d` | `[[[1, 0], [0, 1]], [[0, 1], [1, 0]]]` | Rank 3: front slice, then back slice |
| `defaultRank` | first shown rank | Rank selected on load |
| `editable` | on | Typing into the value boxes |
| `interactions.rotate` | on | Dragging to rotate the 3D view |

#### Example: "add these two vectors" practice

```json
{
  "enabledModes": ["vector"],
  "ui": { "helpButton": false },
  "vectorMode": {
    "maxVectors": 2,
    "vectors": [[3, 1], [1, 2]],
    "interactions": { "draw": false, "dragTips": false, "typeCoordinates": false, "add": false, "remove": false },
    "operations": { "subtract": false },
    "results": { "polar": false },
    "sections": {
      "coordinateMode": { "shown": false },
      "reset": { "shown": false },
      "scalarMultiplication": { "shown": false },
      "dotProduct": { "shown": false },
      "projectionAngle": { "shown": false },
      "normalization": { "shown": false },
      "perpendicular": { "shown": false },
      "reflection": { "shown": false },
      "linearCombination": { "shown": false }
    }
  }
}
```

### User Interface
- **Left Sidebar**: Control panel with mode-specific inputs; each operation is a collapsible card (the first one starts open, or all of them when a config leaves three or fewer)
- **Main Canvas**: Full-screen coordinate plane (2D for vector/matrix modes, 3D for tensor mode). In 2D modes, zoom with the wheel or the +/− buttons at the top right; Reset view appears once the view has moved
- **No Scrolling**: Fully responsive, single-page layout
- **Help System**: Comprehensive help modal with instructions and FAQ

## Quick Start

1. **Start the development server**:
   ```bash
   npm install
   npm start
   ```
   Vite serves the app at `http://localhost:3000`. The logging and WebSocket API runs on port 3001 and is proxied through Vite.

2. **Choose a mode**:
   - Use the mode switcher buttons (if multiple modes are enabled)
   - Default mode is set in `client/config.json` (`defaultMode` property)
   - Available modes: Vector, Matrix, Tensor

3. **Vector Mode**:
   - Click and drag anywhere on the grid to create vectors (v₁ to v₁₂), or press + in the sidebar and type the coordinates
   - Drag a vector's tip, or type into its sidebar fields (x/y in Cartesian, r/θ° in Polar), to change it; press × to remove it
   - Pick operands from each operation's dropdowns, then press its button
   - Watch animated results and read formulas in the Results section

4. **Matrix Mode**:
   - Enter values in the 2×2 matrix input grid
   - See how the matrix transforms basis vectors î and ĵ
   - Toggle determinant visualization to see area scaling

5. **Tensor Mode**:
   - Select a tensor rank (0-3) using the rank buttons
   - Rank 0: Scalar (single value)
   - Rank 1: Vector (x, y components)
   - Rank 2: Matrix (2×2 grid)
   - Rank 3: 3D Tensor (2×2×2 cube)
   - Enter values in the input fields to modify tensor components
   - Drag to rotate the 3D visualization, scroll to zoom
   - See detailed help in `help-content-tensor.html`

## Project Structure

```
learn-bespoke-linear-algebra/
├── client/
│   ├── index.html                    # Main HTML structure
│   ├── bespoke.css                   # Core CSS framework
│   ├── linear-algebra.css            # App-specific styles
│   ├── linear-algebra.js             # Main application logic
│   ├── help-modal.js                 # Help modal component
│   ├── help-content-*.html           # Mode-specific help content
│   ├── app.js                        # WebSocket/status handling
│   ├── config.json                   # Application configuration
│   ├── core/                         # Shared services
│   │   ├── config.js                 # Config service
│   │   ├── mode-manager.js           # Mode switching
│   │   ├── theme-service.js          # Theme management
│   │   ├── coordinate-system.js      # Coordinate system (per-mode pan/zoom view)
│   │   ├── viewport-controller.js    # Pan + zoom input for 2D modes
│   │   └── ...                       # Other core services
│   ├── modes/                        # Mode controllers
│   │   ├── vector-mode.js            # Vector mode controller
│   │   ├── matrix-mode.js            # Matrix mode controller
│   │   ├── tensor-mode.js            # Tensor mode controller
│   │   ├── tensor-canvas-3d.js       # 3D canvas renderer
│   │   └── ...                       # Other mode files
│   └── entities/                     # Data models
│       └── matrix.js                 # Matrix class
├── server.js                         # Development server
├── package.json                      # Dependencies
└── README.md                         # This file
```

## Technical Details

### Technologies Used
- **Frontend**: Vanilla JavaScript (ES6+), HTML5 Canvas, CSS3
- **Backend**: Node.js (development server)
- **No Frameworks**: Pure JavaScript for educational clarity

### Key Classes and Components

#### `LinearAlgebraApp`
Main application class managing:
- Canvas rendering and coordinate system
- Vector creation and manipulation
- Mouse interaction handling
- Animation system
- UI updates

#### `Vector`
Mathematical vector class with:
- Component storage (x, y)
- Operations (add, subtract, scale, dot)
- Calculation methods (magnitude, angle)

#### Canvas System
- Cartesian coordinate system with origin at center
- Grid rendering with axis labels
- Coordinate transformation (screen ↔ mathematical)
- High DPI display support

### Configuration
Edit the `STYLE_CONSTANTS` object in `linear-algebra.js`:
```javascript
const STYLE_CONSTANTS = {
  gridSize: 40,           // pixels per unit
  arrowHeadSize: 12,      // pixels
  vectorLineWidth: 3,
  animationDuration: 800, // milliseconds
  colors: {
    vectorPalette: ['#ef4444', '#3b82f6', /* ...one color per vector, 12 total */],
    vectorPaletteDark: { 12: '#e11d48' }, // dark-theme overrides by vector id
    result: '#10b981',    // green
    // ...
  }
};
```

## Educational Use Cases

- **Linear Algebra Courses**: Visual supplement to theoretical concepts
- **Physics Education**: Understanding force vectors and motion
- **Computer Graphics**: Intuition for vector operations
- **Self-Study**: Interactive exploration of vector mathematics

## Browser Support

Modern browsers with Canvas support:
- Chrome/Edge (latest)
- Firefox (latest)
- Safari (latest)

## Manual Testing Checklist

Use this checklist to verify all modes work correctly after changes:

### Mode Switching
- [ ] Mode switcher buttons appear/disappear based on `enabledModes` config
- [ ] Switching between modes updates the UI correctly
- [ ] Each mode displays its own sidebar content
- [ ] Canvas renders correctly for each mode

### Vector Mode
- [ ] Click and drag creates vectors on the canvas
- [ ] Vector operations (add, subtract, scalar multiply, dot product) work
- [ ] Animations play smoothly
- [ ] Results panel displays calculation formulas
- [ ] Status remains "Ready" after operations

### Matrix Mode
- [ ] Matrix input grid accepts numeric values
- [ ] Basis vectors update when matrix changes
- [ ] Determinant visualization toggles correctly (if enabled)
- [ ] Reset button restores identity matrix
- [ ] Status remains "Ready" after operations

### Tensor Mode
- [ ] Rank buttons (0-3) update UI inputs correctly
- [ ] Rank toggle updates 3D render visualization
- [ ] Scalar input (rank 0) updates single cube visualization
- [ ] Vector inputs (rank 1) update two-cube visualization
- [ ] Matrix inputs (rank 2) update 2×2 grid visualization
- [ ] Tensor3D inputs (rank 3) update 2×2×2 cube visualization
- [ ] Drag interaction rotates 3D view smoothly
- [ ] Scroll/zoom interaction works correctly
- [ ] Reset button restores default tensor values
- [ ] Help button shows tensor help content when tensor mode is active
- [ ] Status remains "Ready" after all interactions

### Theme and Cleanup
- [ ] Theme changes update all mode visualizations correctly
- [ ] Switching away from a mode cleans up properly (no memory leaks)
- [ ] Event listeners are removed when modes are destroyed
- [ ] Canvas interaction handlers are cleaned up (especially tensor mode 3D canvas)

---

## Template Components (Bespoke Framework)

### 1. `client/bespoke.css`
The core CSS framework providing:
- Consistent design tokens (colors, spacing, typography)
- Light and dark theme support
- Reusable component styles (buttons, forms, modals, cards)
- Responsive design utilities

### 2. `client/index.html`
A base HTML template that includes:
- Navigation header with app name and help button
- Main layout structure (sidebar + content area)
- Help modal integration
- Proper CSS and JavaScript loading

### 3. `client/help-modal.js`
A dependency-free JavaScript module for the help modal system:
- Consistent modal behavior across all apps
- Keyboard navigation (ESC to close)
- Focus management
- Custom event system

### 4. `client/help-content-template.html`
A template for creating consistent help content:
- Table of contents navigation
- Standardized section structure
- FAQ with collapsible details
- Image integration guidelines

## Usage Instructions

### Setting Up a New Application

1. **Fork the repository**
2. **Customize the HTML template** by replacing placeholders:
   - `<!-- APP_TITLE -->` - Your application title
   - `<!-- APP_NAME -->` - Your application name (appears in header)
   - `<!-- APP_SPECIFIC_HEADER_CONTENT -->` - Any additional header elements
   - `<!-- APP_SPECIFIC_MAIN_CONTENT -->` - Your main content area
   - `<!-- APP_SPECIFIC_CSS -->` - Links to your app-specific CSS files
   - `<!-- APP_SPECIFIC_SCRIPTS -->` - Links to your app-specific JavaScript files

3. **Implement your application logic**. You can use Cursor or other agents for it. There is a file called `AGENTS.md` that contains context LLM can use.
4. **Customise your help content** using the help content template

### Customizing Help Content

Use the `help-content-template.html` as a starting point:

1. **Replace placeholders** like `<!-- APP_NAME -->` with your actual content
2. **Add sections** as needed for your application
3. **Include images** by placing them in a `help/img/` directory
4. **Use the provided structure** for consistency across applications

### CSS Customization

`bespoke.css` now consumes the CodeSignal Design System tokens directly. Use
those tokens in your overrides instead of the legacy `--bespoke-*` variables:

```css
.sidebar {
  background: var(--Colors-Backgrounds-Main-Medium);
  padding: var(--UI-Spacing-spacing-ms);
  border-radius: var(--UI-Radius-radius-s);
}
```

### Help Modal API

The `HelpModal` class provides several methods:

```javascript
// Initialize
const modal = HelpModal.init({
  triggerSelector: '#btn-help',
  content: helpContent,
  theme: 'auto'
});

// Update content dynamically
modal.updateContent(newHelpContent);

// Destroy the modal
modal.destroy();
```

## Server

Development uses Vite for the app and `server.js` for the API:

- Vite serves the files in `client/` on port 3000 and proxies `/log` and `/message`
- `server.js` accepts those requests and the WebSocket broadcast on port 3001

### Starting the Server

```bash
npm install
npm start
```

The app is at `http://localhost:3000`. `npm run start:prod` serves `client/` from `server.js` without Vite.

### WebSocket Messaging API

The server provides a `POST /message` endpoint that allows you to send real-time messages to connected clients. This can be used to signal changes in the client during events like "Run" or "Submit". When a message is sent, the preview window with the application open will display an alert with the message.

It uses the `ws` package, so if you want to use it, install the packages (but this is optional).

```
npm install
```

#### Endpoint: `POST /message`

**Request Format:**
```json
{
  "message": "Your message here"
}
```

**Example using curl:**
```bash
curl -X POST http://localhost:3000/message \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello from the server!"}'
```
