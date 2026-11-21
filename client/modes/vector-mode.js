/**
 * VectorMode Class
 * Orchestrates vector visualization, operations, and interactions
 * Uses modular components: VectorSidebar, VectorCanvas, VectorOperations
 */

// Hard cap on user vectors regardless of config, to keep the canvas and sidebar usable
const VECTOR_LIMIT = 12;

const SUBSCRIPT_DIGITS = ['₀', '₁', '₂', '₃', '₄', '₅', '₆', '₇', '₈', '₉'];

// Sidebar sections that need two vectors to be meaningful
const TWO_VECTOR_SECTIONS = ['addition', 'dotProduct', 'projectionAngle', 'linearCombination'];

class VectorMode {
  constructor(canvas, appConfig, styleConstants, coordSystem, rootElement, savedState = null) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.appConfig = appConfig; // Runtime configuration from config.json
    this.styleConstants = styleConstants; // Styling constants
    this.coordSystem = coordSystem; // Accept shared CoordinateSystem
    this.root = rootElement; // Root element for sidebar (like MatrixMode)

    const configuredMax = Number(appConfig.vectorMode?.maxVectors) || VECTOR_LIMIT;
    this.maxVectors = Math.min(VECTOR_LIMIT, Math.max(1, configuredMax));

    // Must run before VectorSidebar caches its elements
    this.applySidebarSections();

    // Initialize modules
    this.sidebar = new VectorSidebar(this.root, this); // Pass parent mode for ResultsPanel integration
    this.canvasRenderer = new VectorCanvas(canvas, coordSystem, styleConstants, {});
    this.operations = new VectorOperations(appConfig, styleConstants);

    // Pan (Space/right/middle drag) and zoom (wheel); left drag stays for drawing
    this.viewport = new ViewportController(canvas, coordSystem, {
      viewKey: 'vector',
      resetButton: document.getElementById('reset-view'),
      controls: document.getElementById('view-controls'),
      zoomInButton: document.getElementById('zoom-in'),
      zoomOutButton: document.getElementById('zoom-out'),
      onChange: () => this.render()
    });

    // Vectors (sorted by id; id n is labelled vₙ)
    this.vectors = [];
    this.resultVector = null;

    // Coordinate display mode
    this.coordinateMode = 'cartesian'; // 'cartesian' or 'polar'

    // Interaction state
    this.isDrawing = false;
    this.isEditing = false;
    this.editTarget = null; // Vector whose endpoint is being dragged
    this.drawingVector = null;
    this.startPos = { x: 0, y: 0 };

    // Hover state
    this.hoveredVector = null; // Vector under the cursor or null

    // Animation state
    this.isAnimating = false;
    this.animationFrom = null;
    this.animationTo = null;
    this.animationControl = null; // Animator control object for cancellation
    this.parallelogramFrame = null; // requestAnimationFrame id for parallelogram phase

    // Parallelogram animation state
    this.parallelogramState = null; // { startTime, v1Progress, v2Progress, edgeOpacity }

    // Angle arc visualization state
    this.angleArcState = null; // { vector1, vector2, angleRadians, angleDegrees }

    // Projection drop-line state
    this.projectionState = null; // { source } — vector whose projection is the result

    // Color cache for theme-responsive rendering
    this.colors = {};

    // Event listener references for cleanup (canvas events)
    this.canvasEventListeners = [];
    this.themeUnsubscribe = null;

    // Load colors from CanvasThemeService
    this.loadColors();

    if (this.coordSystem) {
      // Set up resize callback to trigger render
      this.coordSystem.setResizeCallback(() => {
        this.render();
      });
    }

    // Subscribe to theme changes
    if (window.CanvasThemeService) {
      this.themeUnsubscribe = window.CanvasThemeService.subscribe(() => {
        this.loadColors();
        this.vectors.forEach(v => { v.color = this.vectorColor(v.id); });
        this.updateUI();
        this.render();
      });
    }

    // Initialize
    this.setupCanvasEventListeners();
    this.setupSidebarEventListeners();
    if (savedState) this.restoreState(savedState);
    this.updateUI(); // Initial UI update
    this.render();
  }

  /**
   * Remove sidebar sections hidden by config.json (vectorMode.sections), plus
   * two-vector operations when only one vector is allowed
   */
  applySidebarSections() {
    if (!window.SidebarSections) return;

    const sections = { ...(this.appConfig.vectorMode?.sections || {}) };
    if (this.maxVectors < 2) {
      TWO_VECTOR_SECTIONS.forEach(key => { sections[key] = false; });
    }
    window.SidebarSections.applySections(this.root, sections);
    window.SidebarSections.openInitialGroups(this.root);
  }

  /**
   * Update dimensions from CoordinateSystem (called after CoordinateSystem setup)
   */
  updateDimensions() {
    this.canvasRenderer.updateDimensions();
  }

  setupCanvasEventListeners() {
    // Store event listener references for cleanup
    const handlers = {
      // Canvas mouse events
      mousedown: (e) => this.handleMouseDown(e),
      mousemove: (e) => this.handleMouseMove(e),
      mouseup: (e) => this.handleMouseUp(e),
      mouseleave: (e) => this.handleMouseLeave(e)
    };

    // Add canvas listeners
    Object.entries(handlers).forEach(([event, handler]) => {
      this.canvas.addEventListener(event, handler);
      this.canvasEventListeners.push({ element: this.canvas, event, handler });
    });
  }

  setupSidebarEventListeners() {
    // Set up sidebar event listeners with handlers
    this.sidebar.setupEventListeners({
      onClearAll: () => this.clearAll(),
      onCoordModeChange: (e) => {
        this.coordinateMode = e.target.value;
        this.updateUI();
      },
      onRemoveVector: (id) => this.removeVector(id),
      onAddVector: (x, y) => this.addVectorFromInput(x, y),
      onVectorInput: (id, x, y) => this.setVectorComponents(id, x, y),
      onVectorCommit: (id) => this.logVectorEdit(id),
      onAdd: () => this.performAdd(),
      onSubtract: () => this.performSubtract(),
      onScale: () => this.performScale(),
      onDot: () => this.performDot(),
      onProject: () => this.performProject(),
      onAngle: () => this.performAngleBetween(),
      onNormalize: () => this.performNormalize(),
      onPerpendicular: () => this.performPerpendicular(),
      onReflect: () => this.performReflect(),
      onLinearCombo: () => this.performLinearCombination()
    });
  }

  loadColors() {
    // Load theme-responsive colors from CanvasThemeService (guaranteed to be initialized before modes)
    const themeColors = window.CanvasThemeService.getColors();

    this.colors = {
      ...themeColors,
      result: this.styleConstants.colors.result
    };

    // Update CoordinateSystem colors if it exists
    if (this.coordSystem) {
      const coordColors = {
        grid: this.colors.grid,
        axis: this.colors.axis,
        text: this.colors.text,
        hover: this.colors.hover,
        hoverHighlight: this.colors.hoverHighlight
      };
      this.coordSystem.updateColors(coordColors);
    }

    // Update canvas renderer colors
    if (this.canvasRenderer) {
      this.canvasRenderer.updateColors(this.colors);
    }
  }

  // ============================================================================
  // VECTOR COLLECTION
  // ============================================================================

  getVectorById(id) {
    return this.vectors.find(v => v.id === id) || null;
  }

  /**
   * Lowest unused vector id, so labels stay short and freed slots are reused
   * @returns {number|null} Next id or null if the limit is reached
   */
  nextVectorId() {
    if (this.vectors.length >= this.maxVectors) return null;
    for (let id = 1; id <= this.maxVectors; id++) {
      if (!this.getVectorById(id)) return id;
    }
    return null;
  }

  /**
   * Palette color for vector slot `id` in the current theme
   * @param {number} id - Vector id (1-based)
   * @returns {string} Hex color
   */
  vectorColor(id) {
    const { vectorPalette, vectorPaletteDark } = this.styleConstants.colors;
    const isDark = window.CanvasThemeService && window.CanvasThemeService.isDark();
    if (isDark && vectorPaletteDark && vectorPaletteDark[id]) return vectorPaletteDark[id];
    return vectorPalette[(id - 1) % vectorPalette.length];
  }

  /**
   * Create a zero-length vector for slot `id` with its palette color and label
   * @param {number} id - Vector id (1-based)
   * @returns {Vector} New vector
   */
  createVector(id) {
    const subscript = String(id).split('').map(d => SUBSCRIPT_DIGITS[Number(d)]).join('');
    const vector = new Vector(0, 0, this.vectorColor(id), `v${subscript}`);
    vector.id = id;
    vector.subscript = subscript;
    vector.name = `v${id}`;
    return vector;
  }

  /**
   * Vector the next creation would produce (for the sidebar's draft row)
   * @returns {Vector|null} Preview vector, or null at the limit
   */
  peekNextVector() {
    const id = this.nextVectorId();
    return id === null ? null : this.createVector(id);
  }

  /**
   * Create a vector from coordinates typed in the sidebar
   * @param {number} x
   * @param {number} y
   */
  addVectorFromInput(x, y) {
    const id = this.nextVectorId();
    if (id === null || (x === 0 && y === 0)) return;

    this.cancelAnimations();
    const vector = this.createVector(id);
    vector.x = x;
    vector.y = y;
    this.vectors = [...this.vectors, vector].sort((a, b) => a.id - b.id);

    this.invalidateResults();
    this.updateUI();
    this.render();
    logAction(`Vector created from input: ${vector.name} at (${x.toFixed(2)}, ${y.toFixed(2)}), magnitude: ${vector.magnitude().toFixed(2)}, angle: ${vector.angleDegrees().toFixed(2)}°`);
  }

  /**
   * Live update while the user types a vector's coordinates in the sidebar
   * @param {number} id - Vector id
   * @param {number} x
   * @param {number} y
   */
  setVectorComponents(id, x, y) {
    const vector = this.getVectorById(id);
    if (!vector || (vector.x === x && vector.y === y)) return;

    this.cancelAnimations();
    vector.x = x;
    vector.y = y;

    // Results no longer match the edited vector
    this.invalidateResults();
    this.updateUI();
    this.render();
  }

  logVectorEdit(id) {
    const vector = this.getVectorById(id);
    if (!vector) return;
    logAction(`Vector edited from input: ${vector.name} to (${vector.x.toFixed(2)}, ${vector.y.toFixed(2)}), magnitude: ${vector.magnitude().toFixed(2)}, angle: ${vector.angleDegrees().toFixed(2)}°`);
  }

  removeVector(id) {
    const vector = this.getVectorById(id);
    if (!vector) return;

    this.cancelAnimations();
    this.vectors = this.vectors.filter(v => v !== vector);
    if (this.hoveredVector === vector) this.hoveredVector = null;
    this.invalidateResults();
    this.updateUI();
    this.render();
    logAction(`Vector removed: ${vector.name}`);
  }

  clearVisualizations() {
    this.resultVector = null;
    this.parallelogramState = null;
    this.angleArcState = null;
    this.projectionState = null;
  }

  /** Drop the drawn result and its text, e.g. after the vectors change */
  invalidateResults() {
    this.clearVisualizations();
    this.sidebar.clearResults();
  }

  // ============================================================================
  // COORDINATE TRANSFORMATIONS (delegated to canvas renderer)
  // ============================================================================

  screenToMath(screenX, screenY) {
    return this.canvasRenderer.screenToMath(screenX, screenY);
  }

  mathToScreen(mathX, mathY) {
    return this.canvasRenderer.mathToScreen(mathX, mathY);
  }

  snapToGrid(value) {
    return this.canvasRenderer.snapToGrid(value);
  }

  // Check if mouse is near vector endpoint (for editing)
  checkEndpointHit(mouseScreenX, mouseScreenY) {
    return this.canvasRenderer.checkEndpointHit(mouseScreenX, mouseScreenY, this.vectors);
  }

  // ============================================================================
  // RENDERING (delegated to canvas renderer)
  // ============================================================================

  render() {
    // Render canvas only - no UI updates during render
    this.canvasRenderer.render({
      vectors: this.vectors,
      resultVector: this.resultVector,
      drawingVector: this.drawingVector,
      isDrawing: this.isDrawing,
      hoveredVector: this.hoveredVector,
      angleArcState: this.angleArcState,
      parallelogramState: this.parallelogramState,
      projectionState: this.projectionState
    });
  }

  // ============================================================================
  // UI UPDATES (event-driven, not called during render)
  // ============================================================================

  /**
   * Update UI elements (called only when state changes, not during render)
   */
  updateUI() {
    this.sidebar.renderVectorList(this.vectors, this.coordinateMode, this.maxVectors, this.peekNextVector());
    this.sidebar.updateVectorOptions(this.vectors);
    this.sidebar.updateButtonStates(this.vectors.length);
  }

  // ============================================================================
  // MOUSE INTERACTION
  // ============================================================================

  getMousePos(e) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  }

  handleMouseDown(e) {
    if (this.isAnimating) return;

    const pos = this.getMousePos(e);
    const mathPos = this.screenToMath(pos.x, pos.y);

    // Check if clicking on an existing vector endpoint for editing
    const hitVector = this.checkEndpointHit(pos.x, pos.y);

    if (hitVector) {
      // Start editing existing vector
      this.isEditing = true;
      this.editTarget = hitVector;
      this.canvas.classList.add('dragging');
      return;
    }

    const id = this.nextVectorId();
    if (id === null) return;

    // Start drawing a new vector
    this.startPos = {
      x: this.snapToGrid(mathPos.x),
      y: this.snapToGrid(mathPos.y)
    };
    this.isDrawing = true;
    this.drawingVector = this.createVector(id);
    this.canvas.classList.add('dragging');
  }

  handleMouseMove(e) {
    const pos = this.getMousePos(e);

    // Handle editing mode
    if (this.isEditing) {
      const mathPos = this.screenToMath(pos.x, pos.y);
      this.editTarget.x = this.snapToGrid(mathPos.x);
      this.editTarget.y = this.snapToGrid(mathPos.y);

      // Results no longer match the edited vector
      this.invalidateResults();
      this.updateUI(); // Update UI when vector changes
      this.render();
      return;
    }

    // Handle drawing mode
    if (this.isDrawing) {
      const mathPos = this.screenToMath(pos.x, pos.y);
      const snappedX = this.snapToGrid(mathPos.x);
      const snappedY = this.snapToGrid(mathPos.y);

      this.drawingVector.x = snappedX - this.startPos.x;
      this.drawingVector.y = snappedY - this.startPos.y;

      this.render();
      return;
    }

    // Handle hover detection (when not drawing or editing)
    const hitVector = this.checkEndpointHit(pos.x, pos.y);
    if (hitVector !== this.hoveredVector) {
      this.hoveredVector = hitVector;
      this.canvas.style.cursor = hitVector ? 'pointer' : 'crosshair';
      this.render();
    }
  }

  handleMouseUp(e) {
    // Handle editing mode
    if (this.isEditing) {
      const vector = this.editTarget;
      const mag = vector.magnitude().toFixed(2);
      const angle = vector.angleDegrees().toFixed(2);
      logAction(`Vector edited: ${vector.name} to (${vector.x.toFixed(1)}, ${vector.y.toFixed(1)}), magnitude: ${mag}, angle: ${angle}°`);

      this.isEditing = false;
      this.editTarget = null;
      this.canvas.classList.remove('dragging');

      // Check hover state after editing
      const pos = this.getMousePos(e);
      const hitVector = this.checkEndpointHit(pos.x, pos.y);
      this.hoveredVector = hitVector;
      this.canvas.style.cursor = hitVector ? 'pointer' : 'crosshair';

      this.updateUI(); // Update UI after editing
      this.render();
      return;
    }

    // Handle drawing mode
    if (!this.isDrawing) return;

    this.isDrawing = false;
    this.canvas.classList.remove('dragging');

    // Only create vector if it has non-zero magnitude
    const vector = this.drawingVector;
    if (vector && (vector.x !== 0 || vector.y !== 0)) {
      this.vectors = [...this.vectors, vector].sort((a, b) => a.id - b.id);

      const mag = vector.magnitude().toFixed(2);
      const angle = vector.angleDegrees().toFixed(2);
      logAction(`Vector created: ${vector.name} at (${vector.x.toFixed(1)}, ${vector.y.toFixed(1)}), magnitude: ${mag}, angle: ${angle}°`);

      this.invalidateResults();
      this.updateUI(); // Update UI when vector is created
    }

    this.drawingVector = null;
    this.render();
  }

  handleMouseLeave(e) {
    if (this.isDrawing || this.isEditing) {
      this.handleMouseUp(e);
    }

    // Clear hover state when leaving canvas
    this.hoveredVector = null;
    this.canvas.style.cursor = 'crosshair';
  }

  // ============================================================================
  // VECTOR OPERATIONS (delegated to operations module)
  // ============================================================================

  /**
   * Resolve the vector selected in an operand dropdown
   * @param {string} key - Operand key (see OPERAND_SELECTS in vector-sidebar.js)
   * @returns {Vector|null} Selected vector
   */
  getOperand(key) {
    const value = this.sidebar.getOperandValue(key);
    if (this.sidebar.isAxisValue(value)) return this.createAxisVector(value);
    const id = this.sidebar.getOperandId(key);
    return id === null ? null : this.getVectorById(id);
  }

  /**
   * Unit vector along an axis, used as an operand (e.g. projection onto the x-axis)
   * @param {string} axis - 'x-axis' or 'y-axis'
   * @returns {Vector} î or ĵ, with axisName set to 'x' or 'y'
   */
  createAxisVector(axis) {
    const isX = axis === 'x-axis';
    const vector = new Vector(isX ? 1 : 0, isX ? 0 : 1, this.colors.axis, isX ? 'î' : 'ĵ');
    vector.subscript = '';
    vector.name = axis;
    vector.axisName = isX ? 'x' : 'y';
    return vector;
  }

  clearAll() {
    this.cancelAnimations();
    this.vectors = [];
    this.hoveredVector = null;
    this.clearVisualizations();
    this.sidebar.clearResults(); // Clear results panel
    this.updateUI(); // Update UI after clearing
    this.render();
    // Log canvas clear
    logAction('Canvas cleared');
  }

  /**
   * Show an operation's result lines; a result vector also gets its polar form,
   * so it can be typed into a vector row in either coordinate system
   * @param {Object} opResult - Result from VectorOperations
   */
  displayResultLines(opResult) {
    const lines = [...opResult.resultLines];
    if (opResult.resultVector) lines.push(this.operations.formatPolar(opResult.resultVector));
    this.sidebar.displayResult(...lines);
  }

  /**
   * Show a single-vector or scalar operation result
   * @param {Object|null} opResult - Result from VectorOperations
   */
  showResult(opResult) {
    if (!opResult) return;

    if (opResult.clearParallelogram) this.parallelogramState = null;
    if (opResult.clearAngleArc) this.angleArcState = null;
    if (opResult.angleArcState) this.angleArcState = opResult.angleArcState;
    this.projectionState = null;

    if (opResult.resultVector) {
      this.animateToResult(opResult.resultVector, () => {
        // Drop line appears once the projection has settled
        if (opResult.projectionState) {
          this.projectionState = opResult.projectionState;
          this.render();
        }
        this.displayResultLines(opResult);
      });
      return;
    }

    this.cancelAnimations();
    this.resultVector = null;
    this.render();
    this.sidebar.displayResult(...opResult.resultLines);
  }

  /**
   * Show a two-vector result with the parallelogram construction
   * @param {Object|null} opResult - Result from VectorOperations with parallelogramVectors
   */
  showParallelogramResult(opResult) {
    if (!opResult) return;

    const { v1, v2, negatedV2, isLinearCombination } = opResult.parallelogramVectors;
    this.angleArcState = null;
    this.projectionState = null;
    this.animateParallelogram(
      opResult.resultVector,
      v1,
      v2,
      negatedV2,
      () => {
        this.displayResultLines(opResult);
      },
      isLinearCombination ? opResult.parallelogramVectors : null
    );
  }

  performAdd() {
    this.showParallelogramResult(this.operations.add(this.getOperand('addA'), this.getOperand('addB')));
  }

  performSubtract() {
    this.showParallelogramResult(this.operations.subtract(this.getOperand('addA'), this.getOperand('addB')));
  }

  performScale() {
    const scalar = this.sidebar.getScalarInput();
    if (isNaN(scalar)) {
      this.cancelAnimations();
      this.clearVisualizations();
      this.render();
      this.sidebar.displayResult('Enter a number to scale by');
      return;
    }
    this.showResult(this.operations.scale(this.getOperand('scale'), scalar));
  }

  performDot() {
    this.showResult(this.operations.dot(this.getOperand('dotA'), this.getOperand('dotB')));
  }

  performProject() {
    this.showResult(this.operations.project(this.getOperand('projectA'), this.getOperand('projectB')));
  }

  performAngleBetween() {
    this.showResult(this.operations.angleBetween(this.getOperand('projectA'), this.getOperand('projectB')));
  }

  performNormalize() {
    this.showResult(this.operations.normalize(this.getOperand('normalize')));
  }

  performPerpendicular() {
    this.showResult(this.operations.perpendicular(this.getOperand('perpendicular')));
  }

  performReflect() {
    const reflectionType = this.sidebar.getReflectionType();
    this.showResult(this.operations.reflect(this.getOperand('reflect'), reflectionType));
  }

  performLinearCombination() {
    const { scalarA, scalarB } = this.sidebar.getLinearComboScalars();
    if (isNaN(scalarA) || isNaN(scalarB)) return;

    this.showParallelogramResult(this.operations.linearCombination(
      this.getOperand('comboA'),
      this.getOperand('comboB'),
      scalarA,
      scalarB
    ));
  }

  // ============================================================================
  // ANIMATION
  // ============================================================================

  /**
   * Stop any running result or parallelogram animation
   */
  cancelAnimations() {
    if (this.animationControl) {
      this.animationControl.cancel();
      this.animationControl = null;
    }
    if (this.parallelogramFrame !== null) {
      cancelAnimationFrame(this.parallelogramFrame);
      this.parallelogramFrame = null;
    }
    this.isAnimating = false;
  }

  animateToResult(targetVector, onComplete) {
    this.cancelAnimations();
    this.isAnimating = true;
    this.animationFrom = this.resultVector ? this.resultVector.clone() : new Vector(0, 0, targetVector.color, '');
    this.animationTo = targetVector;

    // Use Animator for animation loop
    this.animationControl = Animator.animate({
      duration: this.styleConstants.animationDuration,
      easingFunction: Animator.easeOutCubic,
      onFrame: (eased) => {
        // Use Animator.lerpVector for interpolation
        this.resultVector = Animator.lerpVector(this.animationFrom, this.animationTo, eased);
        this.render(); // Only render canvas, no UI updates
      },
      onComplete: () => {
        this.isAnimating = false;
        this.animationControl = null;
        this.resultVector = this.animationTo;
        this.render();
        if (onComplete) onComplete();
      }
    });
  }

  /**
   * Animate parallelogram construction with staggered phases
   * Phase 1 (0-200ms): Fade in edges
   * Phase 2 (0-400ms): Draw translated second operand from first operand's tip
   * Phase 3 (200-600ms): Draw translated first operand from second operand's tip (overlaps phase 2)
   * Then triggers result vector animation
   *
   * @param {Vector} resultVector - The final result vector to animate after parallelogram
   * @param {Vector} vector1 - First operand
   * @param {Vector} vector2 - Second operand (negated for subtraction)
   * @param {Vector} negatedVector2 - For subtraction: negated operand to draw dashed; null otherwise
   * @param {Function} onComplete - Callback when all animations complete
   * @param {Object} linearComboData - Optional: {scaledV1, scaledV2, scalarA, scalarB} for linear combination visualization
   */
  animateParallelogram(resultVector, vector1, vector2, negatedVector2, onComplete, linearComboData = null) {
    this.cancelAnimations();
    this.isAnimating = true;

    this.parallelogramState = {
      startTime: performance.now(),
      v1Progress: 0,
      v2Progress: 0,
      edgeOpacity: 0,
      useVector1: vector1,
      useVector2: vector2,
      negatedVector2: negatedVector2,
      isLinearCombination: linearComboData !== null,
      scaledV1: linearComboData?.scaledV1 || null,
      scaledV2: linearComboData?.scaledV2 || null,
      scalarA: linearComboData?.scalarA || null,
      scalarB: linearComboData?.scalarB || null
    };

    const timing = this.styleConstants.parallelogram;
    const totalDuration = timing.staggerDelay + timing.translateDuration;

    const animate = (currentTime) => {
      const state = this.parallelogramState;
      if (!state) return;

      const elapsed = currentTime - state.startTime;

      // Phase 1: Fade in edges
      state.edgeOpacity = Math.min(elapsed / timing.edgeFadeInDuration, 1);

      // Phase 2: Draw translated second operand from first operand's tip
      const v2Progress = Math.min(elapsed / timing.translateDuration, 1);
      state.v2Progress = Animator.easeOutCubic(v2Progress);

      // Phase 3: Draw translated first operand from second operand's tip (overlaps phase 2)
      const v1Elapsed = Math.max(0, elapsed - timing.staggerDelay);
      const v1Progress = Math.min(v1Elapsed / timing.translateDuration, 1);
      state.v1Progress = Animator.easeOutCubic(v1Progress);

      this.render(); // Only render canvas, no UI updates

      if (elapsed < totalDuration) {
        this.parallelogramFrame = requestAnimationFrame(animate);
      } else {
        this.parallelogramFrame = null;
        state.v1Progress = 1;
        state.v2Progress = 1;
        state.edgeOpacity = 1;
        this.render();

        // Trigger result vector animation
        this.animateToResult(resultVector, onComplete);
      }
    };

    this.parallelogramFrame = requestAnimationFrame(animate);
  }

  // ============================================================================
  // LIFECYCLE HOOKS
  // ============================================================================

  /**
   * Initialize the mode (called after construction)
   */
  init() {
    // Already initialized in constructor
  }

  /**
   * Get all current vectors for collision detection
   * @returns {Array<Vector>} Array of current vectors
   */
  getVectors() {
    return this.resultVector ? [...this.vectors, this.resultVector] : [...this.vectors];
  }

  /**
   * Snapshot kept by ModeManager while another mode is active
   * @returns {{vectors: Array<{id: number, x: number, y: number}>, coordinateMode: string}}
   */
  getState() {
    return {
      vectors: this.vectors.map(v => ({ id: v.id, x: v.x, y: v.y })),
      coordinateMode: this.coordinateMode
    };
  }

  /**
   * Rebuild vectors and the coordinate mode from a getState() snapshot
   * @param {Object} state - Snapshot from getState()
   */
  restoreState(state) {
    this.vectors = (state.vectors || [])
      .filter(v => v.id >= 1 && v.id <= this.maxVectors)
      .map(({ id, x, y }) => {
        const vector = this.createVector(id);
        vector.x = x;
        vector.y = y;
        return vector;
      })
      .sort((a, b) => a.id - b.id);

    if (state.coordinateMode && state.coordinateMode !== this.coordinateMode) {
      this.coordinateMode = state.coordinateMode;
      if (this.sidebar.dropdowns.coordMode) this.sidebar.dropdowns.coordMode.setValue(state.coordinateMode);
    }
  }

  /**
   * Clean up resources when mode is destroyed
   */
  destroy() {
    // Remove canvas event listeners
    if (this.canvasEventListeners) {
      this.canvasEventListeners.forEach(({ element, event, handler }) => {
        if (element && typeof element.removeEventListener === 'function') {
          element.removeEventListener(event, handler);
        }
      });
      this.canvasEventListeners = [];
    }

    // Unsubscribe from theme service
    if (this.themeUnsubscribe) {
      this.themeUnsubscribe();
      this.themeUnsubscribe = null;
    }

    if (this.viewport) {
      this.viewport.destroy();
      this.viewport = null;
    }

    // Clean up sidebar
    if (this.sidebar) {
      this.sidebar.destroy();
    }

    // Clear resize callback
    if (this.coordSystem) {
      this.coordSystem.setResizeCallback(null);
    }

    // Cancel any running animations
    this.cancelAnimations();

    // Clear state
    this.vectors = [];
    this.clearVisualizations();
    this.isDrawing = false;
    this.isEditing = false;
    this.editTarget = null;
    this.hoveredVector = null;
  }
}
