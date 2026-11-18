/**
 * CoordinateSystem Class
 * Handles canvas setup, coordinate transformations, and grid/axes rendering
 *
 * The visible region is described by a view: { scale, offsetX, offsetY }, where
 * scale is pixels per math unit and the offsets move the origin away from the
 * canvas center (in pixels). Each mode activates its own named view.
 */

// Candidate grid spacings (math units); the smallest one at least
// MIN_GRID_SPACING_PX apart on screen is used for grid lines and tick labels
const GRID_STEPS = [0.1, 0.2, 0.25, 0.5, 1, 2, 5, 10, 20, 25, 50, 100];
const MIN_GRID_SPACING_PX = 32;

class CoordinateSystem {
  constructor(canvas, colors, styleConstants, skipAutoSetup = false) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.colors = colors || {};
    this.styleConstants = styleConstants; // Styling constants (gridSize, lineWidths, etc.)

    // Canvas dimensions (set by setupCanvas)
    this.width = 0;
    this.height = 0;

    // Named views so each mode keeps its own pan/zoom
    this.views = {};
    this.view = this.createDefaultView();

    if (!skipAutoSetup) {
      this.setupCanvas();
    }
  }

  // Screen position of the math origin
  get centerX() {
    return this.width / 2 + this.view.offsetX;
  }

  get centerY() {
    return this.height / 2 + this.view.offsetY;
  }

  // ============================================================================
  // VIEW (PAN + ZOOM)
  // ============================================================================

  createDefaultView() {
    return { scale: this.styleConstants.gridSize, offsetX: 0, offsetY: 0 };
  }

  /**
   * Switch to the named view, creating it at the default position on first use
   * @param {string} key - View name (e.g. the mode name)
   */
  activateView(key) {
    if (!this.views[key]) {
      this.views[key] = this.createDefaultView();
    }
    this.view = this.views[key];
  }

  /**
   * Current zoom level
   * @returns {number} Pixels per math unit
   */
  getScale() {
    return this.view.scale;
  }

  isDefaultView() {
    return this.view.scale === this.styleConstants.gridSize &&
      this.view.offsetX === 0 &&
      this.view.offsetY === 0;
  }

  resetView() {
    Object.assign(this.view, this.createDefaultView());
  }

  /**
   * Move the view by a screen-space delta
   * @param {number} dx - Pixels to move right
   * @param {number} dy - Pixels to move down
   */
  panBy(dx, dy) {
    this.view.offsetX += dx;
    this.view.offsetY += dy;
  }

  /**
   * Zoom by a factor while keeping the math point under (screenX, screenY) fixed
   * @param {number} screenX - Zoom anchor X in screen space
   * @param {number} screenY - Zoom anchor Y in screen space
   * @param {number} factor - Multiplier applied to the scale (> 1 zooms in)
   */
  zoomAt(screenX, screenY, factor) {
    const { minScale, maxScale } = this.styleConstants.viewport;
    const anchor = this.screenToMath(screenX, screenY);
    this.view.scale = Math.min(maxScale, Math.max(minScale, this.view.scale * factor));
    this.view.offsetX = screenX - anchor.x * this.view.scale - this.width / 2;
    this.view.offsetY = screenY + anchor.y * this.view.scale - this.height / 2;
  }

  /**
   * Grid spacing in math units for the current zoom
   * @returns {number} Step between grid lines
   */
  getGridStep() {
    const step = GRID_STEPS.find(s => s * this.view.scale >= MIN_GRID_SPACING_PX);
    return step || GRID_STEPS[GRID_STEPS.length - 1];
  }

  setupCanvas() {
    const resizeCanvas = () => {
      const container = this.canvas.parentElement;
      const dpr = window.devicePixelRatio || 1;

      this.canvas.width = container.clientWidth * dpr;
      this.canvas.height = container.clientHeight * dpr;

      this.canvas.style.width = container.clientWidth + 'px';
      this.canvas.style.height = container.clientHeight + 'px';

      this.ctx.scale(dpr, dpr);

      this.width = container.clientWidth;
      this.height = container.clientHeight;

      // Trigger external render callback if registered
      if (this.onResize) {
        this.onResize();
      }
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
  }

  /**
   * Register callback to be called when canvas resizes
   * @param {function} callback - Function to call on resize
   */
  setResizeCallback(callback) {
    this.onResize = callback;
  }

  /**
   * Update color cache (for theme changes)
   * @param {object} colors - Color object
   */
  updateColors(colors) {
    this.colors = colors;
  }

  // ============================================================================
  // COORDINATE TRANSFORMATIONS
  // ============================================================================

  /**
   * Convert screen coordinates to mathematical coordinates
   * @param {number} screenX - X coordinate in screen space
   * @param {number} screenY - Y coordinate in screen space
   * @returns {object} - {x, y} in mathematical coordinates
   */
  screenToMath(screenX, screenY) {
    const mathX = (screenX - this.centerX) / this.view.scale;
    const mathY = -(screenY - this.centerY) / this.view.scale;
    return { x: mathX, y: mathY };
  }

  /**
   * Convert mathematical coordinates to screen coordinates
   * @param {number} mathX - X coordinate in mathematical space
   * @param {number} mathY - Y coordinate in mathematical space
   * @returns {object} - {x, y} in screen coordinates
   */
  mathToScreen(mathX, mathY) {
    const screenX = this.centerX + mathX * this.view.scale;
    const screenY = this.centerY - mathY * this.view.scale;
    return { x: screenX, y: screenY };
  }

  /**
   * Snap a value to the nearest 0.5 increment
   * @param {number} value - Value to snap
   * @returns {number} - Snapped value
   */
  snapToGrid(value) {
    return Math.round(value * 2) / 2; // Snap to 0.5 increments
  }

  // ============================================================================
  // RENDERING
  // ============================================================================

  /**
   * Clear the entire canvas
   */
  clear() {
    this.ctx.clearRect(0, 0, this.width, this.height);
  }

  /**
   * Draw the background grid
   */
  drawGrid() {
    this.ctx.strokeStyle = this.colors.grid;
    this.ctx.lineWidth = this.styleConstants.gridLineWidth;

    const step = this.getGridStep();
    const { xs, ys } = this.getVisibleTicks(step);

    // Vertical lines
    xs.forEach(value => {
      const x = this.mathToScreen(value, 0).x;
      this.ctx.beginPath();
      this.ctx.moveTo(x, 0);
      this.ctx.lineTo(x, this.height);
      this.ctx.stroke();
    });

    // Horizontal lines
    ys.forEach(value => {
      const y = this.mathToScreen(0, value).y;
      this.ctx.beginPath();
      this.ctx.moveTo(0, y);
      this.ctx.lineTo(this.width, y);
      this.ctx.stroke();
    });
  }

  /**
   * Multiples of `step` inside the visible area, per axis
   * @param {number} step - Grid step in math units
   * @returns {{xs: number[], ys: number[]}} Visible tick values
   */
  getVisibleTicks(step) {
    const topLeft = this.screenToMath(0, 0);
    const bottomRight = this.screenToMath(this.width, this.height);
    const range = (min, max) => {
      const values = [];
      // Integer multipliers avoid floating-point drift (0.1 + 0.2 ...)
      for (let k = Math.ceil(min / step); k <= Math.floor(max / step); k++) {
        values.push(k * step);
      }
      return values;
    };
    return {
      xs: range(topLeft.x, bottomRight.x),
      ys: range(bottomRight.y, topLeft.y)
    };
  }

  /**
   * Format a tick value with just enough decimals for the step
   * @param {number} value - Tick value
   * @param {number} step - Grid step in math units
   * @returns {string} Label text
   */
  formatTick(value, step) {
    const decimals = step >= 1 ? 0 : String(step).split('.')[1].length;
    return value.toFixed(decimals).replace(/^-(0(\.0+)?)$/, '$1');
  }

  /**
   * Draw the X and Y axes with labels.
   * When an axis is scrolled out of view its tick labels stick to the nearest edge.
   */
  drawAxes() {
    const ctx = this.ctx;
    ctx.strokeStyle = this.colors.axis;
    ctx.lineWidth = this.styleConstants.axisLineWidth;
    ctx.fillStyle = this.colors.text;
    ctx.font = '500 11px "Work Sans", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const originX = this.centerX;
    const originY = this.centerY;

    // X-axis
    ctx.beginPath();
    ctx.moveTo(0, originY);
    ctx.lineTo(this.width, originY);
    ctx.stroke();

    // Y-axis
    ctx.beginPath();
    ctx.moveTo(originX, 0);
    ctx.lineTo(originX, this.height);
    ctx.stroke();

    // Label rows/columns, clamped to stay on screen
    const xLabelY = Math.min(Math.max(originY + 15, 12), this.height - 12);
    const yLabelX = Math.min(Math.max(originX - 15, 15), this.width - 15);

    const step = this.getGridStep();
    const { xs, ys } = this.getVisibleTicks(step);

    xs.forEach(value => {
      if (value === 0) return;
      const screenX = this.mathToScreen(value, 0).x;
      ctx.beginPath();
      ctx.moveTo(screenX, originY - 5);
      ctx.lineTo(screenX, originY + 5);
      ctx.stroke();
      // Leave room for the 'x' axis letter at the right edge
      if (screenX < this.width - 35) {
        ctx.fillText(this.formatTick(value, step), screenX, xLabelY);
      }
    });

    ys.forEach(value => {
      if (value === 0) return;
      const screenY = this.mathToScreen(0, value).y;
      ctx.beginPath();
      ctx.moveTo(originX - 5, screenY);
      ctx.lineTo(originX + 5, screenY);
      ctx.stroke();
      // Leave room for the 'y' axis letter at the top edge
      if (screenY > 35) {
        ctx.fillText(this.formatTick(value, step), yLabelX, screenY);
      }
    });

    // Draw origin label
    ctx.fillText('0', originX - 15, originY + 15);

    // Draw axis labels
    ctx.font = 'italic 500 14px "Work Sans", system-ui, sans-serif';
    ctx.fillText('x', this.width - 20, Math.min(Math.max(originY + 20, 20), this.height - 20));
    ctx.fillText('y', Math.min(Math.max(originX + 20, 20), this.width - 20), 20);
  }

  /**
   * Calculate smart label position based on vector angle to avoid collisions
   * @param {Vector} vector - The vector to calculate label position for
   * @param {number} baseOffset - Base offset distance in pixels (default: 20)
   * @returns {{x: number, y: number}} - Screen coordinates for label position
   */
  computeLabelPosition(vector, baseOffset = 20) {
    const end = this.mathToScreen(vector.x, vector.y);
    const magnitude = vector.magnitude();

    // For very short vectors (normalized vectors have magnitude ~1), increase offset
    const offsetMultiplier = magnitude < 1.5 ? 1.8 : 1.0;
    const offset = baseOffset * offsetMultiplier;

    // Calculate vector angle
    const angle = Math.atan2(vector.y, vector.x);

    // Position label perpendicular to vector (90 degrees offset)
    // We add π/2 to rotate the offset perpendicular to the vector
    const labelAngle = angle + Math.PI / 2;

    // Calculate label position
    // For vectors pointing right (angle near 0), label goes above
    // For vectors pointing up (angle near π/2), label goes left
    // For vectors pointing left (angle near π), label goes below
    // For vectors pointing down (angle near -π/2), label goes right
    let labelX = end.x + offset * Math.cos(labelAngle);
    let labelY = end.y - offset * Math.sin(labelAngle);

    // Adjust to keep labels above/right for better readability
    // If label would be below or left of endpoint, flip it to other side
    if (labelY > end.y + 5) {
      // Label is too far below, flip to above
      labelX = end.x - offset * Math.cos(labelAngle);
      labelY = end.y + offset * Math.sin(labelAngle);
    }

    return { x: labelX, y: labelY };
  }

  /**
   * Draw a vector from the origin
   * @param {Vector} vector - The vector to draw
   * @param {object} styleConstants - Style constants object (gridSize, arrowHeadSize, vectorLineWidth, hitRadius)
   * @param {object} colors - Color object (hover, hoverHighlight)
   * @param {boolean} isDashed - Whether to draw with dashed line
   * @param {number} opacity - Opacity (0-1)
   * @param {boolean} isHovered - Whether the vector is hovered
   * @param {number} lineWidthOverride - Override line width
   */
  drawVector(vector, styleConstants, colors, isDashed = false, opacity = 1, isHovered = false, lineWidthOverride = null, subscript = null) {
    const start = this.mathToScreen(0, 0);
    const end = this.mathToScreen(vector.x, vector.y);

    this.ctx.save();
    this.ctx.globalAlpha = opacity;

    // Use hover color if hovered, otherwise use vector color
    const drawColor = isHovered && colors ? colors.hover : vector.color;
    this.ctx.strokeStyle = drawColor;
    this.ctx.fillStyle = drawColor;

    // Use vector's custom lineWidth if available, otherwise use override or default
    const lineWidth = vector.lineWidth || lineWidthOverride || (isHovered ? styleConstants.vectorLineWidth + 1 : styleConstants.vectorLineWidth);
    this.ctx.lineWidth = lineWidth;

    if (isDashed) {
      this.ctx.setLineDash([5, 5]);
    }

    // Draw line, stopping inside the arrowhead so the thick shaft doesn't poke out past the tip
    const angle = Math.atan2(end.y - start.y, end.x - start.x);
    const headlen = styleConstants.arrowHeadSize;
    const screenLength = Math.hypot(end.x - start.x, end.y - start.y);
    const shaftLength = Math.max(0, screenLength - headlen * Math.cos(Math.PI / 6) + 1);
    this.ctx.beginPath();
    this.ctx.moveTo(start.x, start.y);
    this.ctx.lineTo(start.x + shaftLength * Math.cos(angle), start.y + shaftLength * Math.sin(angle));
    this.ctx.stroke();

    // Draw arrowhead

    this.ctx.beginPath();
    this.ctx.moveTo(end.x, end.y);
    this.ctx.lineTo(
      end.x - headlen * Math.cos(angle - Math.PI / 6),
      end.y - headlen * Math.sin(angle - Math.PI / 6)
    );
    this.ctx.lineTo(
      end.x - headlen * Math.cos(angle + Math.PI / 6),
      end.y - headlen * Math.sin(angle + Math.PI / 6)
    );
    this.ctx.closePath();
    this.ctx.fill();

    // Draw hover highlight circle around endpoint
    if (isHovered && colors) {
      this.ctx.globalAlpha = 0.3 * opacity;
      this.ctx.strokeStyle = colors.hoverHighlight;
      this.ctx.lineWidth = 2;
      this.ctx.beginPath();
      this.ctx.arc(end.x, end.y, styleConstants.hitRadius, 0, Math.PI * 2);
      this.ctx.stroke();

      // Fill circle for better visibility
      this.ctx.globalAlpha = 0.1 * opacity;
      this.ctx.fillStyle = colors.hoverHighlight;
      this.ctx.fill();

      this.ctx.globalAlpha = opacity; // Reset alpha
    }

    // Draw label using smart positioning
    if (vector.label) {
      this.ctx.font = 'italic 600 16px "Work Sans", system-ui, sans-serif';
      this.ctx.fillStyle = drawColor;
      const labelPos = this.computeLabelPosition(vector);

      // Draw base label
      this.ctx.fillText(vector.label, labelPos.x, labelPos.y);

      // Draw subscript if provided
      if (subscript) {
        // Measure base label width to position subscript
        const baseTextMetrics = this.ctx.measureText(vector.label);
        const subscriptFontSize = 11; // ~70% of base 16px font
        this.ctx.font = `600 ${subscriptFontSize}px "Work Sans", system-ui, sans-serif`;
        this.ctx.fillText(subscript, labelPos.x + baseTextMetrics.width + 1, labelPos.y + 5);
      }
    }

    this.ctx.restore();
  }

  /**
   * Draw a vector translated from a non-origin starting point
   * Used for visualizing parallelogram law in vector addition/subtraction
   *
   * @param {Vector} vector - The vector to draw
   * @param {Object} startPoint - Starting point in math coordinates {x, y}
   * @param {object} styleConstants - Style constants object (gridSize, arrowHeadSize, parallelogram settings)
   * @param {number} progress - Animation progress 0-1 (1 = fully drawn)
   * @param {string} color - Color override for the vector
   */
  drawTranslatedVector(vector, startPoint, styleConstants, progress = 1, color = null) {
    // Convert start point from math to screen coordinates
    const start = this.mathToScreen(startPoint.x, startPoint.y);

    // Calculate endpoint: startPoint + (vector * progress)
    const endMathX = startPoint.x + (vector.x * progress);
    const endMathY = startPoint.y + (vector.y * progress);
    const end = this.mathToScreen(endMathX, endMathY);

    // If progress is near zero, don't draw anything
    if (progress < 0.01) return;

    this.ctx.save();
    this.ctx.globalAlpha = styleConstants.parallelogram.opacity;

    const drawColor = color || vector.color;
    this.ctx.strokeStyle = drawColor;
    this.ctx.fillStyle = drawColor;
    this.ctx.lineWidth = styleConstants.parallelogram.lineWidth;
    this.ctx.setLineDash(styleConstants.parallelogram.dashPattern);

    // Draw line from translated start to translated end
    this.ctx.beginPath();
    this.ctx.moveTo(start.x, start.y);
    this.ctx.lineTo(end.x, end.y);
    this.ctx.stroke();

    // Draw arrowhead at end (only if progress is significant)
    if (progress > 0.3) {
      const angle = Math.atan2(end.y - start.y, end.x - start.x);
      const headlen = styleConstants.arrowHeadSize;

      this.ctx.beginPath();
      this.ctx.moveTo(end.x, end.y);
      this.ctx.lineTo(
        end.x - headlen * Math.cos(angle - Math.PI / 6),
        end.y - headlen * Math.sin(angle - Math.PI / 6)
      );
      this.ctx.lineTo(
        end.x - headlen * Math.cos(angle + Math.PI / 6),
        end.y - headlen * Math.sin(angle + Math.PI / 6)
      );
      this.ctx.closePath();
      this.ctx.fill();
    }

    // No label for parallelogram edges (keeps canvas clean)

    this.ctx.restore();
  }
}
