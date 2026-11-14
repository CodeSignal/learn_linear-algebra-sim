/**
 * ViewportController Class
 * Adds pan and zoom to a 2D canvas whose transforms come from CoordinateSystem.
 *
 * - Pan: drag with the middle or right mouse button, or hold Space and drag.
 *   With `panWithPrimaryButton`, a plain left drag pans too (for modes that
 *   don't use left drag themselves).
 * - Zoom: mouse wheel or trackpad pinch, anchored at the cursor.
 *
 * Pan gestures are handled in the window capture phase and stopped there, so
 * the mode's own canvas mouse handlers never see them.
 */

const ZOOM_LOG_DELAY_MS = 500;
const BUTTON_ZOOM_FACTOR = 1.25; // zoom step for the + / − buttons

class ViewportController {
  /**
   * @param {HTMLCanvasElement} canvas - Canvas to control
   * @param {CoordinateSystem} coordSystem - Shared coordinate system
   * @param {Object} options
   * @param {string} options.viewKey - Name of the view to activate (one per mode)
   * @param {Function} options.onChange - Called (at most once per frame) after the view changes
   * @param {boolean} [options.panWithPrimaryButton=false] - Let plain left drag pan
   * @param {HTMLElement} [options.resetButton] - Button that restores the default view
   * @param {HTMLElement} [options.controls] - Container shown while this controller is active
   * @param {HTMLElement} [options.zoomInButton] - Button that zooms in around the canvas center
   * @param {HTMLElement} [options.zoomOutButton] - Button that zooms out around the canvas center
   */
  constructor(canvas, coordSystem, options = {}) {
    this.canvas = canvas;
    this.coordSystem = coordSystem;
    this.onChange = options.onChange || null;
    this.panWithPrimaryButton = Boolean(options.panWithPrimaryButton);
    this.resetButton = options.resetButton || null;
    this.controls = options.controls || null;
    this.zoomInButton = options.zoomInButton || null;
    this.zoomOutButton = options.zoomOutButton || null;
    this.speeds = coordSystem.styleConstants.viewport;

    this.isPanning = false;
    this.panButton = null;
    this.lastPointer = null;
    this.isSpaceDown = false;
    this.isPointerOver = false;
    this.frameId = null;
    this.zoomLogTimer = null;
    this.listeners = [];

    coordSystem.activateView(options.viewKey);
    this.bindEvents();
    this.updateCursor();
    this.updateResetButton();
    if (this.controls) {
      this.controls.hidden = false;
    }
  }

  bindEvents() {
    const listen = (element, event, handler, opts) => {
      element.addEventListener(event, handler, opts);
      this.listeners.push({ element, event, handler, opts });
    };

    listen(window, 'mousedown', (e) => this.handleMouseDown(e), true);
    listen(window, 'mousemove', (e) => this.handleMouseMove(e), true);
    listen(window, 'mouseup', (e) => this.handleMouseUp(e), true);
    listen(window, 'keydown', (e) => this.handleKey(e, true));
    listen(window, 'keyup', (e) => this.handleKey(e, false));
    listen(window, 'blur', () => this.cancelGestures());

    listen(this.canvas, 'wheel', (e) => this.handleWheel(e), { passive: false });
    listen(this.canvas, 'contextmenu', (e) => e.preventDefault());
    listen(this.canvas, 'mouseenter', () => {
      this.isPointerOver = true;
      this.updateCursor();
    });
    listen(this.canvas, 'mouseleave', () => {
      this.isPointerOver = false;
      this.updateCursor();
    });

    if (this.resetButton) {
      listen(this.resetButton, 'click', () => this.resetView());
    }
    if (this.zoomInButton) {
      listen(this.zoomInButton, 'click', () => this.zoomByStep(BUTTON_ZOOM_FACTOR));
    }
    if (this.zoomOutButton) {
      listen(this.zoomOutButton, 'click', () => this.zoomByStep(1 / BUTTON_ZOOM_FACTOR));
    }
  }

  // ============================================================================
  // PAN
  // ============================================================================

  shouldStartPan(e) {
    if (e.target !== this.canvas) return false;
    // Ignore extra buttons pressed during a left-button drag (e.g. drawing a vector)
    if ((e.buttons & 1) && e.button !== 0) return false;
    if (e.button === 1 || e.button === 2) return true;
    return e.button === 0 && (this.isSpaceDown || this.panWithPrimaryButton);
  }

  handleMouseDown(e) {
    if (this.isPanning || !this.shouldStartPan(e)) return;

    e.preventDefault(); // Prevents middle-click autoscroll and text selection
    e.stopPropagation();
    this.isPanning = true;
    this.panButton = e.button;
    this.lastPointer = { x: e.clientX, y: e.clientY };
    this.updateCursor();
  }

  handleMouseMove(e) {
    if (!this.isPanning) return;

    e.stopPropagation();
    this.coordSystem.panBy(e.clientX - this.lastPointer.x, e.clientY - this.lastPointer.y);
    this.lastPointer = { x: e.clientX, y: e.clientY };
    this.requestRender();
  }

  handleMouseUp(e) {
    if (!this.isPanning || e.button !== this.panButton) return;

    e.stopPropagation();
    this.isPanning = false;
    this.panButton = null;
    this.updateCursor();

    const center = this.coordSystem.screenToMath(this.coordSystem.width / 2, this.coordSystem.height / 2);
    logAction(`View panned: center (${center.x.toFixed(1)}, ${center.y.toFixed(1)})`);
  }

  handleKey(e, isDown) {
    if (e.code !== 'Space') return;

    if (isDown) {
      // Only claim Space while the pointer is over the canvas and the user isn't typing
      if (!this.isPointerOver || this.isTypingTarget(e.target)) return;
      e.preventDefault(); // Stops page scroll and activation of a focused button
      this.isSpaceDown = true;
    } else {
      // Buttons activate on Space keyup, so suppress it if we claimed the keydown
      if (this.isSpaceDown) e.preventDefault();
      this.isSpaceDown = false;
    }
    this.updateCursor();
  }

  isTypingTarget(target) {
    if (!target) return false;
    if (target.isContentEditable) return true;
    if (target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return true;
    return target.tagName === 'INPUT' && !['button', 'checkbox', 'radio', 'range', 'submit'].includes(target.type);
  }

  cancelGestures() {
    this.isPanning = false;
    this.panButton = null;
    this.isSpaceDown = false;
    this.updateCursor();
  }

  // ============================================================================
  // ZOOM
  // ============================================================================

  handleWheel(e) {
    e.preventDefault();

    // Normalize line/page deltas to pixels
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? this.coordSystem.height : 1;
    // Browsers report trackpad pinch as a wheel event with ctrlKey set
    const speed = e.ctrlKey ? this.speeds.pinchZoomSpeed : this.speeds.wheelZoomSpeed;
    const factor = Math.exp(-e.deltaY * unit * speed);

    const rect = this.canvas.getBoundingClientRect();
    this.coordSystem.zoomAt(e.clientX - rect.left, e.clientY - rect.top, factor);
    this.requestRender();

    clearTimeout(this.zoomLogTimer);
    this.zoomLogTimer = setTimeout(() => {
      logAction(`View zoomed: ${this.coordSystem.getScale().toFixed(0)} px per unit`);
    }, ZOOM_LOG_DELAY_MS);
  }

  /**
   * Zoom around the canvas center (zoom buttons)
   * @param {number} factor - Scale multiplier (>1 zooms in)
   */
  zoomByStep(factor) {
    this.coordSystem.zoomAt(this.coordSystem.width / 2, this.coordSystem.height / 2, factor);
    this.requestRender();
    logAction(`View zoomed: ${this.coordSystem.getScale().toFixed(0)} px per unit`);
  }

  // ============================================================================
  // VIEW STATE
  // ============================================================================

  resetView() {
    this.coordSystem.resetView();
    this.requestRender();
    logAction('View reset');
  }

  requestRender() {
    if (this.frameId !== null) return;
    this.frameId = requestAnimationFrame(() => {
      this.frameId = null;
      this.updateResetButton();
      if (this.onChange) this.onChange();
    });
  }

  updateResetButton() {
    if (this.resetButton) {
      this.resetButton.hidden = this.coordSystem.isDefaultView();
    }
  }

  updateCursor() {
    const panReady = this.panWithPrimaryButton || (this.isSpaceDown && this.isPointerOver);
    this.canvas.classList.toggle('pan-ready', panReady && !this.isPanning);
    this.canvas.classList.toggle('panning', this.isPanning);
  }

  destroy() {
    this.listeners.forEach(({ element, event, handler, opts }) => {
      element.removeEventListener(event, handler, opts);
    });
    this.listeners = [];

    if (this.frameId !== null) {
      cancelAnimationFrame(this.frameId);
      this.frameId = null;
    }
    clearTimeout(this.zoomLogTimer);

    this.canvas.classList.remove('pan-ready', 'panning');
    if (this.resetButton) {
      this.resetButton.hidden = true;
    }
    if (this.controls) {
      this.controls.hidden = true;
    }
    this.onChange = null;
  }
}
