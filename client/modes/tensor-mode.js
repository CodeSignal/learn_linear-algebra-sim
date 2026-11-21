/**
 * TensorMode Class
 * Visualization for tensors of different ranks (0-3)
 */

class TensorMode {
  constructor(canvas, appConfig, styleConstants, coordSystem, rootElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.appConfig = appConfig;
    this.styleConstants = styleConstants;
    this.coordSystem = coordSystem;
    this.root = rootElement;

    // Sidebar sections from config.json (tensorMode.sections)
    this.sections = appConfig.tensorMode?.sections || {};
    this.availableRanks = this.resolveAvailableRanks();

    // Starting values, starting rank and switches from config.json
    this.readOptions();

    // State
    this.rank = this.options.defaultRank;
    this.tensorData = this.startingData();

    // Colors
    this.colors = {};
    this.themeUnsubscribe = null;
    this.loadColors();

    // Event listener tracking for cleanup
    this.eventListeners = [];

    // Bound handler methods (stored for proper cleanup)
    this.handleRankClick = null;
    this.handleReset = null;
    this.handleScalarInput = null;
    this.handleVectorInput = null;
    this.handleMatrixInput = null;
    this.handleTensor3DInput = null;

    // Subscribe to theme changes
    if (window.CanvasThemeService) {
      this.themeUnsubscribe = window.CanvasThemeService.subscribe(() => {
        this.loadColors();
        this.render();
      });
    }

    // Initialize 3D Canvas with initial colors and styleConstants
    this.tensorCanvas3D = new TensorCanvas3D(canvas, {
      onRender: () => this.render()
    }, this.colors, styleConstants);
    this.tensorCanvas3D.rotateEnabled = this.options.rotate;
    this.tensorCanvas3D.zoomEnabled = this.options.zoom;
    canvas.style.cursor = this.options.rotate ? '' : 'default';

    // Setup UI
    this.setupUI();
    this.setupEventListeners();

    // Initial render
    this.render();
  }

  loadColors() {
    // CanvasThemeService is guaranteed to be initialized before modes
    const themeColors = window.CanvasThemeService.getColors();
    this.colors = {
      ...themeColors,
      cubeEdge: themeColors.accent || themeColors.axis,
      cubeFace: themeColors.accent || themeColors.axis
    };

    if (this.coordSystem) {
      this.coordSystem.updateColors(this.colors);
    }

    // Update 3D canvas colors when theme changes
    if (this.tensorCanvas3D) {
      this.tensorCanvas3D.setColors(this.colors);
    }
  }

  /**
   * Read tensorMode's options from config.json:
   * values.{scalar, vector, matrix, tensor3d}, defaultRank, editable,
   * interactions.rotate; zooming follows ui.zoom
   */
  readOptions() {
    const read = window.ConfigOptions;
    const config = this.appConfig.tensorMode || {};
    const values = config.values || {};
    const defaults = TensorMode.DEFAULT_DATA;

    const vector = values.vector === undefined ? null : read.readPoint(values.vector, 'tensorMode.values.vector');
    const isCube = value => Array.isArray(value) && value.length === 2 && value.every(slice =>
      Array.isArray(slice) && slice.length === 2 && slice.every(row =>
        Array.isArray(row) && row.length === 2 && row.every(cell => typeof cell === 'number' && Number.isFinite(cell))));
    let tensor3d = defaults.tensor3d;
    if (values.tensor3d !== undefined) {
      if (isCube(values.tensor3d)) {
        tensor3d = values.tensor3d;
      } else {
        console.warn('config.json: tensorMode.values.tensor3d must be two 2×2 slices: [[[a, b], [c, d]], [[e, f], [g, h]]]');
      }
    }

    let defaultRank = this.availableRanks[0];
    if (config.defaultRank !== undefined) {
      if (this.availableRanks.includes(config.defaultRank)) {
        defaultRank = config.defaultRank;
      } else {
        console.warn(`config.json: tensorMode.defaultRank must be one of the shown ranks (${this.availableRanks.join(', ')})`);
      }
    }

    this.options = Object.freeze({
      values: {
        scalar: read.readNumber(values.scalar, defaults.scalar, 'tensorMode.values.scalar'),
        vector: vector || defaults.vector,
        matrix: read.readMatrix2(values.matrix, 'tensorMode.values.matrix') || defaults.matrix,
        tensor3d
      },
      defaultRank,
      editable: read.readFlag(config.editable, true, 'tensorMode.editable'),
      rotate: read.readFlags(config.interactions, ['rotate'], 'tensorMode.interactions').rotate,
      zoom: this.appConfig.ui?.zoom !== false
    });
  }

  /** A fresh copy of the starting values (on load and on Reset) */
  startingData() {
    const { values } = this.options;
    return {
      scalar: values.scalar,
      vector: { x: values.vector.x, y: values.vector.y },
      matrix: values.matrix.map(row => [...row]),
      tensor3d: values.tensor3d.map(slice => slice.map(row => [...row]))
    };
  }

  /** Hint under the sidebar, listing only the gestures that are on */
  controlsHintText() {
    const parts = [];
    if (this.options.rotate) parts.push('Drag to rotate');
    if (this.options.zoom) parts.push('Scroll to zoom');
    return parts.join(' · ');
  }

  /**
   * Ranks the config leaves visible (sections rank0..rank3); all ranks when none are
   * @returns {number[]} Sorted ranks
   */
  resolveAvailableRanks() {
    const ranks = [0, 1, 2, 3].filter(rank => this.sections[`rank${rank}`] !== false);
    if (ranks.length === 0) {
      console.warn('config.json: tensorMode.sections hides every rank; showing all ranks instead');
      return [0, 1, 2, 3];
    }
    return ranks;
  }

  setupUI() {
    const rankNames = ['Scalar', 'Vector', 'Matrix', '3D Tensor'];
    const rankButtons = this.availableRanks.map(rank => {
      const active = rank === this.rank ? ' active' : '';
      return `<button type="button" class="button button-tertiary rank-btn${active}" data-rank="${rank}" aria-pressed="${rank === this.rank}">` +
        `<span class="rank-number">${rank}</span><span class="rank-name">${rankNames[rank]}</span></button>`;
    }).join('');

    // A single rank needs no selector
    const rankSelector = this.availableRanks.length > 1 ? `
          <div class="control-group">
            <h2 class="sidebar-title">Rank</h2>
            <div class="rank-selector" style="--rank-count: ${this.availableRanks.length}">${rankButtons}</div>
          </div>` : '';

    // Create sidebar content
    this.root.innerHTML = `
      <div class="sidebar-section">
        <div class="sidebar-toolbar">
          <h2 class="sidebar-title">Tensor</h2>
          <button id="tensor-reset" type="button" class="button button-tertiary button-xsmall toolbar-reset" data-section="reset"
            title="Reset tensor values and view"><span aria-hidden="true">↺</span> Reset</button>
        </div>

        <div class="tensor-controls">${rankSelector}

          <div id="tensor-input-container" class="tensor-input-container">
            <!-- Dynamic content based on rank -->
          </div>
        </div>
      </div>

      ${this.controlsHintText() ? `<div class="sidebar-section" data-section="controlsHint">
        <p class="tensor-hint">${this.controlsHintText()}</p>
      </div>` : ''}
    `;

    if (window.SidebarSections) {
      window.SidebarSections.applySections(this.root, this.sections);
    }

    this.updateInputUI();
  }

  updateInputUI() {
    const container = this.root.querySelector('#tensor-input-container');

    let html = '';

    switch (this.rank) {
      case 0:
        html = `
          <div class="scalar-input-wrapper">
            <span class="tensor-input-label">Value</span>
            <input type="number" id="tensor-scalar-input" class="input matrix-input" value="${this.tensorData.scalar}" step="0.1">
          </div>
        `;
        break;
      case 1:
        html = `
          <div class="vector-input-wrapper">
            <span class="tensor-input-label">Components (x, y)</span>
            <div class="matrix-grid small">
              <div class="matrix-row">
                <input type="number" id="tensor-vector-x" class="input matrix-input" value="${this.tensorData.vector.x}" step="0.1" placeholder="x">
                <input type="number" id="tensor-vector-y" class="input matrix-input" value="${this.tensorData.vector.y}" step="0.1" placeholder="y">
              </div>
            </div>
          </div>
        `;
        break;
      case 2:
        html = `
          <div class="matrix-input-wrapper">
            <span class="tensor-input-label">2 × 2 matrix</span>
            <div class="matrix-grid small">
              <div class="matrix-row">
                <input type="number" id="tensor-m00" class="input matrix-input" value="${this.tensorData.matrix[0][0]}" step="0.1">
                <input type="number" id="tensor-m01" class="input matrix-input" value="${this.tensorData.matrix[0][1]}" step="0.1">
              </div>
              <div class="matrix-row">
                <input type="number" id="tensor-m10" class="input matrix-input" value="${this.tensorData.matrix[1][0]}" step="0.1">
                <input type="number" id="tensor-m11" class="input matrix-input" value="${this.tensorData.matrix[1][1]}" step="0.1">
              </div>
            </div>
          </div>
        `;
        break;
      case 3:
        html = `
          <div class="tensor3d-input-wrapper">
            <span class="tensor-input-label">2 × 2 × 2 tensor</span>
            <div class="tensor-slices">
              <div class="slice">
                <span class="slice-label">Front slice (z = 0)</span>
                <div class="matrix-grid small">
                  <div class="matrix-row">
                    <input type="number" id="tensor-t000" class="input matrix-input" value="${this.tensorData.tensor3d[0][0][0]}" step="0.1">
                    <input type="number" id="tensor-t001" class="input matrix-input" value="${this.tensorData.tensor3d[0][0][1]}" step="0.1">
                  </div>
                  <div class="matrix-row">
                    <input type="number" id="tensor-t010" class="input matrix-input" value="${this.tensorData.tensor3d[0][1][0]}" step="0.1">
                    <input type="number" id="tensor-t011" class="input matrix-input" value="${this.tensorData.tensor3d[0][1][1]}" step="0.1">
                  </div>
                </div>
              </div>
              <div class="slice">
                <span class="slice-label">Back slice (z = 1)</span>
                <div class="matrix-grid small">
                  <div class="matrix-row">
                    <input type="number" id="tensor-t100" class="input matrix-input" value="${this.tensorData.tensor3d[1][0][0]}" step="0.1">
                    <input type="number" id="tensor-t101" class="input matrix-input" value="${this.tensorData.tensor3d[1][0][1]}" step="0.1">
                  </div>
                  <div class="matrix-row">
                    <input type="number" id="tensor-t110" class="input matrix-input" value="${this.tensorData.tensor3d[1][1][0]}" step="0.1">
                    <input type="number" id="tensor-t111" class="input matrix-input" value="${this.tensorData.tensor3d[1][1][1]}" step="0.1">
                  </div>
                </div>
              </div>
            </div>
          </div>
        `;
        break;
    }

    container.innerHTML = html;

    // config.json tensorMode.editable: false shows the values without letting them change
    if (!this.options.editable) {
      container.querySelectorAll('input').forEach(input => {
        input.readOnly = true;
        input.tabIndex = -1;
        input.classList.add('is-readonly');
      });
    }

    // Re-attach listeners for new inputs
    this.attachInputListeners();
  }

  setupEventListeners() {
    // Rank selection - create bound handler
    this.handleRankClick = (e) => {
      const rankBtns = this.root.querySelectorAll('.rank-btn');
      // Update active state
      // The button holds spans, so resolve the button itself
      const button = e.target.closest('.rank-btn');
      if (!button) return;
      rankBtns.forEach(b => {
        b.classList.remove('active', 'button-primary');
        b.classList.add('button-tertiary');
        b.setAttribute('aria-pressed', 'false');
      });
      button.classList.add('active');
      button.setAttribute('aria-pressed', 'true');

      // Update rank
      this.rank = parseInt(button.dataset.rank);

      // Log rank change
      try {
        logAction(`Tensor rank changed to ${this.rank}`);
      } catch (err) {
        console.error('Failed to log rank change:', err);
      }

      this.updateInputUI();
      this.render();
    };

    const rankBtns = this.root.querySelectorAll('.rank-btn');
    rankBtns.forEach(btn => {
      btn.addEventListener('click', this.handleRankClick);
      this.eventListeners.push({ element: btn, event: 'click', handler: this.handleRankClick });
    });

    // Reset button - create bound handler
    this.handleReset = () => {
      this.tensorData = this.startingData();

      // Reset camera to default view
      if (this.tensorCanvas3D) {
        this.tensorCanvas3D.resetCamera();
      }

      // Log reset with the starting values
      try {
        const d = this.tensorData;
        logAction(`Tensor reset: scalar=${d.scalar}, vector=(${d.vector.x}, ${d.vector.y}), matrix=${JSON.stringify(d.matrix)}, tensor3d=${JSON.stringify(d.tensor3d)}`);
      } catch (err) {
        console.error('Failed to log reset:', err);
      }

      this.updateInputUI();
      this.render();
    };

    const resetBtn = this.root.querySelector('#tensor-reset');
    if (resetBtn) {
      resetBtn.addEventListener('click', this.handleReset);
      this.eventListeners.push({ element: resetBtn, event: 'click', handler: this.handleReset });
    }
  }

  attachInputListeners() {
    // Remove any existing input listeners before attaching new ones
    // Filter out input listeners (they have 'input' event type)
    const inputListeners = this.eventListeners.filter(
      ({ event }) => event === 'input'
    );
    inputListeners.forEach(({ element, event, handler }) => {
      if (element && typeof element.removeEventListener === 'function') {
        element.removeEventListener(event, handler);
      }
    });
    // Remove input listeners from tracking array
    this.eventListeners = this.eventListeners.filter(
      ({ event }) => event !== 'input'
    );

    // Scalar
    const scalarInput = this.root.querySelector('#tensor-scalar-input');
    if (scalarInput) {
      this.handleScalarInput = (e) => {
        this.tensorData.scalar = parseFloat(e.target.value) || 0;

        // Log scalar input change
        try {
          logAction(`Tensor scalar input changed: ${this.tensorData.scalar.toFixed(1)}`);
        } catch (err) {
          console.error('Failed to log scalar input:', err);
        }

        this.render();
      };
      scalarInput.addEventListener('input', this.handleScalarInput);
      this.eventListeners.push({ element: scalarInput, event: 'input', handler: this.handleScalarInput });
    }

    // Vector
    const vx = this.root.querySelector('#tensor-vector-x');
    const vy = this.root.querySelector('#tensor-vector-y');
    if (vx && vy) {
      this.handleVectorInput = () => {
        this.tensorData.vector.x = parseFloat(vx.value) || 0;
        this.tensorData.vector.y = parseFloat(vy.value) || 0;

        // Log vector input change
        try {
          logAction(`Tensor vector input changed: x=${this.tensorData.vector.x.toFixed(1)}, y=${this.tensorData.vector.y.toFixed(1)}`);
        } catch (err) {
          console.error('Failed to log vector input:', err);
        }

        this.render();
      };
      vx.addEventListener('input', this.handleVectorInput);
      vy.addEventListener('input', this.handleVectorInput);
      this.eventListeners.push({ element: vx, event: 'input', handler: this.handleVectorInput });
      this.eventListeners.push({ element: vy, event: 'input', handler: this.handleVectorInput });
    }

    // Matrix
    if (this.rank === 2) {
      const inputs = this.root.querySelectorAll('.matrix-input-wrapper input');
      this.handleMatrixInput = (input) => {
        // Parse indices from tensor-m00 format: positions 8 and 9 contain row and col
        const r = parseInt(input.id.slice(8, 9));
        const c = parseInt(input.id.slice(9, 10));
        this.tensorData.matrix[r][c] = parseFloat(input.value) || 0;

        // Log matrix input change
        try {
          logAction(`Tensor matrix input changed: [${r},${c}]=${this.tensorData.matrix[r][c].toFixed(1)}`);
        } catch (err) {
          console.error('Failed to log matrix input:', err);
        }

        this.render();
      };
      inputs.forEach(input => {
        const handler = () => this.handleMatrixInput(input);
        input.addEventListener('input', handler);
        this.eventListeners.push({ element: input, event: 'input', handler });
      });
    }

    // Tensor 3D
    if (this.rank === 3) {
      const inputs = this.root.querySelectorAll('.tensor3d-input-wrapper input');
      this.handleTensor3DInput = (input) => {
        // Parse indices from tensor-t000 format: positions 8, 9, and 10 contain slice, row, and col
        const s = parseInt(input.id.slice(8, 9));
        const r = parseInt(input.id.slice(9, 10));
        const c = parseInt(input.id.slice(10, 11));
        this.tensorData.tensor3d[s][r][c] = parseFloat(input.value) || 0;

        // Log tensor 3D input change
        try {
          logAction(`Tensor 3D input changed: [${s},${r},${c}]=${this.tensorData.tensor3d[s][r][c].toFixed(1)}`);
        } catch (err) {
          console.error('Failed to log tensor 3D input:', err);
        }

        this.render();
      };
      inputs.forEach(input => {
        const handler = () => this.handleTensor3DInput(input);
        input.addEventListener('input', handler);
        this.eventListeners.push({ element: input, event: 'input', handler });
      });
    }
  }

  render() {
    // Use 3D Canvas for everything in this mode
    this.tensorCanvas3D.clear();
    // Draw axes offset to the bottom-left-back corner to avoid overlapping with tensor cubes
    this.tensorCanvas3D.drawAxis(5, { x: -3, y: -3, z: -3 });

    switch (this.rank) {
      case 0:
        this.renderScalar();
        break;
      case 1:
        this.renderVector();
        break;
      case 2:
        this.renderMatrix();
        break;
      case 3:
        this.renderTensor3D();
        break;
    }
  }

  renderScalar() {
    // Visualize scalar as a single cube at origin
    const value = this.tensorData.scalar;
    const cubeSize = 0.8;

    this.tensorCanvas3D.drawCubeWithLabel(
      { x: 0, y: 0, z: 0 },
      cubeSize,
      value,
      this.colors.cubeEdge,
      this.colors.cubeFace,
      this.colors.text,
      0.3
    );
  }

  renderVector() {
    // Visualize vector as two cubes in a horizontal row
    const v = this.tensorData.vector;
    const cubeSize = 0.8;
    const spacing = 1.2; // Center-to-center spacing

    // Position cubes horizontally (x-axis)
    const x1 = -spacing / 2;
    const x2 = spacing / 2;

    // Draw first cube (x component)
    this.tensorCanvas3D.drawCubeWithLabel(
      { x: x1, y: 0, z: 0 },
      cubeSize,
      v.x,
      this.colors.cubeEdge,
      this.colors.cubeFace,
      this.colors.text,
      0.3
    );

    // Draw second cube (y component)
    this.tensorCanvas3D.drawCubeWithLabel(
      { x: x2, y: 0, z: 0 },
      cubeSize,
      v.y,
      this.colors.cubeEdge,
      this.colors.cubeFace,
      this.colors.text,
      0.3
    );
  }

  renderMatrix() {
    // Visualize matrix as a 2x2 grid of cubes
    const m = this.tensorData.matrix;
    const cubeSize = 0.8;
    const spacing = 1.2; // Center-to-center spacing

    // Matrix layout: [m00, m01]
    //                 [m10, m11]
    // Position cubes in a 2x2 grid, centered at origin
    const offset = spacing / 2;

    // Top row
    this.tensorCanvas3D.drawCubeWithLabel(
      { x: -offset, y: offset, z: 0 },
      cubeSize,
      m[0][0],
      this.colors.cubeEdge,
      this.colors.cubeFace,
      this.colors.text,
      0.3
    );
    this.tensorCanvas3D.drawCubeWithLabel(
      { x: offset, y: offset, z: 0 },
      cubeSize,
      m[0][1],
      this.colors.cubeEdge,
      this.colors.cubeFace,
      this.colors.text,
      0.3
    );

    // Bottom row
    this.tensorCanvas3D.drawCubeWithLabel(
      { x: -offset, y: -offset, z: 0 },
      cubeSize,
      m[1][0],
      this.colors.cubeEdge,
      this.colors.cubeFace,
      this.colors.text,
      0.3
    );
    this.tensorCanvas3D.drawCubeWithLabel(
      { x: offset, y: -offset, z: 0 },
      cubeSize,
      m[1][1],
      this.colors.cubeEdge,
      this.colors.cubeFace,
      this.colors.text,
      0.3
    );
  }

  renderTensor3D() {
    // Visualize rank-3 tensor as a 2x2x2 cube of cubes
    const t = this.tensorData.tensor3d;
    const cubeSize = 0.8;
    const spacing = 1.2; // Center-to-center spacing

    // Tensor layout: 2 slices (z=0 and z=spacing), each with a 2x2 matrix
    // Slice 0 (front): t[0][row][col]
    // Slice 1 (back):  t[1][row][col]
    const offset = spacing / 2;

    // Front slice (z = -offset)
    const zFront = -offset;
    // Top-left
    this.tensorCanvas3D.drawCubeWithLabel(
      { x: -offset, y: offset, z: zFront },
      cubeSize,
      t[0][0][0],
      this.colors.cubeEdge,
      this.colors.cubeFace,
      this.colors.text,
      0.3
    );
    // Top-right
    this.tensorCanvas3D.drawCubeWithLabel(
      { x: offset, y: offset, z: zFront },
      cubeSize,
      t[0][0][1],
      this.colors.cubeEdge,
      this.colors.cubeFace,
      this.colors.text,
      0.3
    );
    // Bottom-left
    this.tensorCanvas3D.drawCubeWithLabel(
      { x: -offset, y: -offset, z: zFront },
      cubeSize,
      t[0][1][0],
      this.colors.cubeEdge,
      this.colors.cubeFace,
      this.colors.text,
      0.3
    );
    // Bottom-right
    this.tensorCanvas3D.drawCubeWithLabel(
      { x: offset, y: -offset, z: zFront },
      cubeSize,
      t[0][1][1],
      this.colors.cubeEdge,
      this.colors.cubeFace,
      this.colors.text,
      0.3
    );

    // Back slice (z = offset)
    const zBack = offset;
    // Top-left
    this.tensorCanvas3D.drawCubeWithLabel(
      { x: -offset, y: offset, z: zBack },
      cubeSize,
      t[1][0][0],
      this.colors.cubeEdge,
      this.colors.cubeFace,
      this.colors.text,
      0.3
    );
    // Top-right
    this.tensorCanvas3D.drawCubeWithLabel(
      { x: offset, y: offset, z: zBack },
      cubeSize,
      t[1][0][1],
      this.colors.cubeEdge,
      this.colors.cubeFace,
      this.colors.text,
      0.3
    );
    // Bottom-left
    this.tensorCanvas3D.drawCubeWithLabel(
      { x: -offset, y: -offset, z: zBack },
      cubeSize,
      t[1][1][0],
      this.colors.cubeEdge,
      this.colors.cubeFace,
      this.colors.text,
      0.3
    );
    // Bottom-right
    this.tensorCanvas3D.drawCubeWithLabel(
      { x: offset, y: -offset, z: zBack },
      cubeSize,
      t[1][1][1],
      this.colors.cubeEdge,
      this.colors.cubeFace,
      this.colors.text,
      0.3
    );
  }

  destroy() {
    this.canvas.style.cursor = '';

    // Remove all event listeners
    if (this.eventListeners) {
      this.eventListeners.forEach(({ element, event, handler }) => {
        if (element && typeof element.removeEventListener === 'function') {
          element.removeEventListener(event, handler);
        }
      });
      this.eventListeners = [];
    }

    // Unsubscribe from theme service
    if (this.themeUnsubscribe) {
      this.themeUnsubscribe();
      this.themeUnsubscribe = null;
    }

    // Cleanup 3D canvas
    if (this.tensorCanvas3D) {
      this.tensorCanvas3D.destroy();
    }

    // Clear root innerHTML to ensure clean state
    if (this.root) {
      this.root.innerHTML = '';
    }

    // Clear handler references
    this.handleRankClick = null;
    this.handleReset = null;
    this.handleScalarInput = null;
    this.handleVectorInput = null;
    this.handleMatrixInput = null;
    this.handleTensor3DInput = null;
  }
}

// App defaults, used for any tensorMode.values entry config.json leaves out
TensorMode.DEFAULT_DATA = Object.freeze({
  scalar: 1.0,
  vector: Object.freeze({ x: 2, y: 1 }),
  matrix: [[1, 0], [0, 1]],
  tensor3d: [
    [[1, 0], [0, 1]],
    [[0, 1], [1, 0]]
  ]
});
