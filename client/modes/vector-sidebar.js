/**
 * VectorSidebar Class
 * Manages all DOM interactions and UI state for the vector mode sidebar
 * Caches DOM elements for performance and provides event-driven UI updates
 */

// Operand dropdowns that list the user's vectors.
// defaultSlot is the position in the vector list selected until the user picks
// a vector, so two-operand operations start on different vectors.
// withAxes also lists the x- and y-axis (see AXIS_OPTIONS).
const OPERAND_SELECTS = [
  { key: 'addA', selector: '#add-vector-a-dropdown', defaultSlot: 0 },
  { key: 'addB', selector: '#add-vector-b-dropdown', defaultSlot: 1 },
  { key: 'scale', selector: '#scale-vector-dropdown', defaultSlot: 0 },
  { key: 'dotA', selector: '#dot-vector-a-dropdown', defaultSlot: 0 },
  { key: 'dotB', selector: '#dot-vector-b-dropdown', defaultSlot: 1 },
  { key: 'projectA', selector: '#project-vector-a-dropdown', defaultSlot: 0 },
  { key: 'projectB', selector: '#project-vector-b-dropdown', defaultSlot: 1, withAxes: true },
  { key: 'normalize', selector: '#normalize-vector-dropdown', defaultSlot: 0 },
  { key: 'perpendicular', selector: '#perpendicular-vector-dropdown', defaultSlot: 0 },
  { key: 'reflect', selector: '#reflect-vector-dropdown', defaultSlot: 0 },
  { key: 'comboA', selector: '#combo-vector-a-dropdown', defaultSlot: 0 },
  { key: 'comboB', selector: '#combo-vector-b-dropdown', defaultSlot: 1 }
];

// Axis options for operand dropdowns with withAxes; values are what getOperandValue returns
const AXIS_OPTIONS = [
  { value: 'x-axis', label: 'X-axis' },
  { value: 'y-axis', label: 'Y-axis' }
];

// Coordinate field labels per coordinate mode; θ is in degrees
const COORD_FIELDS = {
  cartesian: [{ prefix: 'x', suffix: '' }, { prefix: 'y', suffix: '' }],
  polar: [{ prefix: 'r', suffix: '' }, { prefix: 'θ', suffix: '°' }]
};

// Reflection axis choices; config.json vectorMode.reflectionAxes picks a subset
const REFLECTION_AXIS_ITEMS = [
  { value: 'x-axis', label: 'X-axis' },
  { value: 'y-axis', label: 'Y-axis' },
  { value: 'diagonal', label: 'y = x' }
];

// Used when the sidebar runs without a VectorMode (every feature on)
const DEFAULT_SIDEBAR_OPTIONS = {
  coordinateMode: 'cartesian',
  interactions: { draw: true, dragTips: true, typeCoordinates: true, add: true, remove: true },
  reflectionAxes: ['x-axis', 'y-axis', 'diagonal'],
  coefficients: [1, 1]
};
class VectorSidebar {
  constructor(rootElement, parentMode = null) {
    this.root = rootElement;
    this.parentMode = parentMode;
    // Feature switches and starting values from config.json (see VectorMode.readOptions)
    this.options = (parentMode && parentMode.options) || DEFAULT_SIDEBAR_OPTIONS;

    // Cache all DOM element references once
    this.elements = {
      // Vector list
      vectorList: this.root.querySelector('#vector-list'),
      vectorCount: this.root.querySelector('#vector-count'),
      vectorAdd: this.root.querySelector('#vector-add'),

      // Control buttons
      canvasReset: this.root.querySelector('#canvas-reset'),

      // Operation buttons
      opAdd: this.root.querySelector('#op-add'),
      opSubtract: this.root.querySelector('#op-subtract'),
      opScale: this.root.querySelector('#op-scale'),
      opDot: this.root.querySelector('#op-dot'),
      opProject: this.root.querySelector('#op-project'),
      opAngle: this.root.querySelector('#op-angle'),
      opNormalize: this.root.querySelector('#op-normalize'),
      opPerpendicular: this.root.querySelector('#op-perpendicular'),
      opReflect: this.root.querySelector('#op-reflect'),
      opLinearCombo: this.root.querySelector('#op-linear-combo'),
      linearComboPreview: this.root.querySelector('#linear-combo-preview'),

      // Inputs
      scalarInput: this.root.querySelector('#scalar-input')
    };

    // Initialize ResultsPanel for result display
    const resultsElement = document.querySelector('#vector-results');
    if (resultsElement && this.parentMode) {
      this.resultsPanel = new ResultsPanel(resultsElement, {
        emptyMessage: 'Perform an operation to see results',
        canvasContainer: document.querySelector('.canvas-container'),
        coordSystem: this.parentMode.coordSystem,
        modeInstance: this.parentMode
      });
    } else {
      this.resultsPanel = resultsElement ? new ResultsPanel(resultsElement, {
        emptyMessage: 'Perform an operation to see results'
      }) : null;
    }

    // Event listener references for cleanup
    this.eventListeners = [];

    // Vector list state. Rows are reused across renders so a field being typed
    // into is never replaced.
    this.vectorRows = new Map(); // vector id -> row (see createVectorRow)
    this.draft = null; // row for typing in a new vector, or null
    this.emptyMessage = null;
    this.listState = null; // arguments of the last renderVectorList call
    this.handlers = {};

    // Operand dropdown state
    this.vectorLabels = new Map(); // dropdown value (vector id string) -> label
    this.optionsSignature = null; // ids currently listed in operand dropdowns
    this.userSelected = {}; // operand key -> true once the user picked a vector

    // Initialize dropdowns
    this.dropdowns = {};
    this.initializeDropdowns();

    // Initialize sliders
    this.sliders = {};
    this.initializeSliders();
  }

  /**
   * Initialize all dropdown components
   */
  initializeDropdowns() {
    if (!window.Dropdown) return;

    // Coordinate mode dropdown
    const coordModeContainer = this.root.querySelector('#coord-mode-dropdown');
    if (coordModeContainer) {
      this.dropdowns.coordMode = new window.Dropdown(coordModeContainer, {
        items: [
          { value: 'cartesian', label: 'Cartesian' },
          { value: 'polar', label: 'Polar' }
        ],
        selectedValue: this.options.coordinateMode
      });
    }

    // Reflection axis dropdown
    const reflectTypeContainer = this.root.querySelector('#reflect-type-dropdown');
    if (reflectTypeContainer) {
      const items = REFLECTION_AXIS_ITEMS.filter(item => this.options.reflectionAxes.includes(item.value));
      this.dropdowns.reflectType = new window.Dropdown(reflectTypeContainer, {
        items,
        selectedValue: items.length > 0 ? items[0].value : null
      });
    }

    // Operand dropdowns start empty and are filled by updateVectorOptions()
    OPERAND_SELECTS.forEach(({ key, selector }) => {
      const container = this.root.querySelector(selector);
      if (container) {
        this.dropdowns[key] = this.createOperandDropdown(key, container, [], null);
      }
    });
  }

  /**
   * Create a dropdown listing the user's vectors
   * @param {string} key - Operand key from OPERAND_SELECTS
   * @param {HTMLElement} container - Dropdown container
   * @param {Array<{value: string, label: string}>} items - Vector options
   * @param {string|null} selectedValue - Selected vector id
   * @returns {Dropdown} Dropdown instance
   */
  createOperandDropdown(key, container, items, selectedValue) {
    return new window.Dropdown(container, {
      items,
      selectedValue,
      placeholder: 'No vectors',
      onSelect: () => {
        this.userSelected[key] = true;
        this.updateOperationLabels();
      }
    });
  }

  /**
   * Initialize all numeric slider components
   */
  initializeSliders() {
    if (!window.NumericSlider) return;

    ['lcScalarA', 'lcScalarB'].forEach((key, index) => {
      const container = this.root.querySelector(key === 'lcScalarA' ? '#lc-scalar-a' : '#lc-scalar-b');
      if (!container) return;
      this.sliders[key] = new window.NumericSlider(container, {
        type: 'single',
        min: -9,
        max: 9,
        step: 0.1,
        value: this.options.coefficients[index],
        showInputs: true,
        onChange: () => this.updateLinearComboButton()
      });
      this.showDecimalsInSliderInput(this.sliders[key]);
    });
  }

  /**
   * The design-system slider writes Math.round(value) into its number box on
   * every change, so 2.5 shows as "3" and typing "2.5" is cut to "2" mid-typing.
   * Show the value with one decimal instead, and leave the box alone while the
   * user is typing in it.
   * @param {NumericSlider} slider - Single-value slider with showInputs
   */
  showDecimalsInSliderInput(slider) {
    const input = slider && slider.valueInput;
    if (!input) return;
    const baseUpdate = slider.updateVisuals.bind(slider);
    slider.updateVisuals = () => {
      // Run the original update without its input write, then write our own
      const showInputs = slider.config.showInputs;
      slider.config.showInputs = false;
      try {
        baseUpdate();
      } finally {
        slider.config.showInputs = showInputs;
      }
      if (document.activeElement !== input) {
        input.value = String(Number(slider.values.toFixed(1)) || 0);
      }
    };
    slider.updateVisuals();
  }

  /**
   * Set up event listeners with handlers provided by VectorMode
   * @param {Object} handlers - Object with handler functions
   */
  setupEventListeners(handlers) {
    this.handlers = handlers;

    const listen = (element, event, handler) => {
      if (!element || !handler) return;
      element.addEventListener(event, handler);
      this.eventListeners.push({ element, event, handler });
    };

    listen(this.elements.canvasReset, 'click', handlers.onClearAll);

    // Coordinate mode dropdown
    if (this.dropdowns.coordMode && handlers.onCoordModeChange) {
      this.dropdowns.coordMode.config.onSelect = (value) => {
        handlers.onCoordModeChange({ target: { value } });
      };
    }

    // Rows come and go with the vectors, so delegate from the list container
    listen(this.elements.vectorAdd, 'click', () => this.openDraft());
    listen(this.elements.vectorList, 'click', (e) => this.handleListClick(e));
    listen(this.elements.vectorList, 'input', (e) => this.handleListInput(e));
    listen(this.elements.vectorList, 'keydown', (e) => this.handleListKeydown(e));
    listen(this.elements.vectorList, 'focusin', (e) => this.handleListFocusIn(e));
    listen(this.elements.vectorList, 'focusout', (e) => this.handleListFocusOut(e));

    // Operation buttons
    listen(this.elements.opAdd, 'click', handlers.onAdd);
    listen(this.elements.opSubtract, 'click', handlers.onSubtract);
    listen(this.elements.opScale, 'click', handlers.onScale);
    listen(this.elements.opDot, 'click', handlers.onDot);
    listen(this.elements.opProject, 'click', handlers.onProject);
    listen(this.elements.opAngle, 'click', handlers.onAngle);
    listen(this.elements.opNormalize, 'click', handlers.onNormalize);
    listen(this.elements.opPerpendicular, 'click', handlers.onPerpendicular);
    listen(this.elements.opReflect, 'click', handlers.onReflect);
    listen(this.elements.opLinearCombo, 'click', handlers.onLinearCombo);
  }

  /**
   * Render the list of user vectors with editable coordinates.
   * Rows are updated in place; a row that holds focus keeps what the user typed.
   * @param {Array<Vector>} vectors - User vectors (sorted by id)
   * @param {string} coordinateMode - 'cartesian' or 'polar'
   * @param {number} maxVectors - Maximum number of vectors allowed
   * @param {Vector|null} nextVector - Vector the next creation would produce, or null at the limit
   */
  renderVectorList(vectors, coordinateMode, maxVectors, nextVector = null) {
    this.listState = { vectors, coordinateMode, maxVectors, nextVector };

    if (this.elements.vectorCount) {
      this.elements.vectorCount.textContent = `${vectors.length} / ${maxVectors}`;
    }
    if (this.elements.vectorAdd) {
      this.elements.vectorAdd.disabled = !nextVector;
    }
    if (!nextVector) {
      this.draft = null;
    }

    const list = this.elements.vectorList;
    if (!list) return;

    const ids = new Set(vectors.map(v => v.id));
    this.vectorRows.forEach((row, id) => {
      if (!ids.has(id)) this.vectorRows.delete(id);
    });

    const nodes = vectors.map((vector) => {
      let row = this.vectorRows.get(vector.id);
      if (!row) {
        row = this.createVectorRow(vector);
        this.vectorRows.set(vector.id, row);
      }
      row.vector = vector;
      this.updateVectorRow(row, coordinateMode);
      return row.element;
    });

    if (this.draft) {
      this.updateDraftRow(nextVector, coordinateMode);
      nodes.push(this.draft.element);
    } else if (vectors.length === 0) {
      nodes.push(this.getEmptyMessage());
    }

    // Only move nodes that are out of place: moving a node drops its focus
    nodes.forEach((node, index) => {
      if (list.children[index] !== node) {
        list.insertBefore(node, list.children[index] || null);
      }
    });
    while (list.children.length > nodes.length) {
      list.lastElementChild.remove();
    }
  }

  /** Re-render the list with the last known state (after draft changes) */
  refreshVectorList() {
    if (!this.listState) return;
    const { vectors, coordinateMode, maxVectors, nextVector } = this.listState;
    this.renderVectorList(vectors, coordinateMode, maxVectors, nextVector);
  }

  getEmptyMessage() {
    if (!this.emptyMessage) {
      this.emptyMessage = document.createElement('p');
      this.emptyMessage.className = 'vector-list-empty body-xsmall';
      // Only mention the ways of adding a vector that config.json leaves on
      const { draw, add } = this.options.interactions;
      this.emptyMessage.textContent = draw && add
        ? 'Click and drag on the grid to draw a vector, or press + Add to type one in.'
        : draw
          ? 'Click and drag on the grid to draw a vector.'
          : add
            ? 'Press + Add to type in a vector.'
            : 'No vectors yet.';
    }
    return this.emptyMessage;
  }

  /**
   * Build a coordinate field: a Design System input box holding a prefix
   * (x, y, r or θ), a bare text input, and an optional unit suffix
   * @returns {{wrapper: HTMLElement, prefix: HTMLElement, input: HTMLInputElement, suffix: HTMLElement}}
   */
  createCoordField() {
    const wrapper = document.createElement('label');
    wrapper.className = 'input coord-field';

    const prefix = document.createElement('span');
    prefix.className = 'coord-prefix';

    const input = document.createElement('input');
    input.type = 'text';
    input.inputMode = 'decimal';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.className = 'coord-input';

    const suffix = document.createElement('span');
    suffix.className = 'coord-suffix';

    wrapper.append(prefix, input, suffix);
    return { wrapper, prefix, input, suffix };
  }

  /**
   * Apply the coordinate mode's labels to a pair of fields
   * @param {Array} fields - Two fields from createCoordField
   * @param {string} coordinateMode - 'cartesian' or 'polar'
   * @param {string} ownerLabel - Vector label for accessible names (e.g. v₁)
   */
  labelCoordFields(fields, coordinateMode, ownerLabel) {
    COORD_FIELDS[coordinateMode].forEach((meta, index) => {
      const field = fields[index];
      field.prefix.textContent = meta.prefix;
      field.suffix.textContent = meta.suffix;
      field.input.setAttribute('aria-label', `${ownerLabel} ${meta.prefix}`);
    });
  }

  createVectorRow(vector) {
    const element = document.createElement('div');
    element.className = 'vector-row body-xsmall';
    element.dataset.vectorId = String(vector.id);

    const label = document.createElement('span');
    label.className = 'vector-label';

    const fields = [this.createCoordField(), this.createCoordField()];

    // config.json vectorMode.interactions.typeCoordinates: fields become read-only
    if (!this.options.interactions.typeCoordinates) {
      element.classList.add('is-readonly');
      fields.forEach(field => {
        field.input.readOnly = true;
        field.input.tabIndex = -1;
        field.wrapper.classList.add('is-readonly');
      });
    }

    const magnitude = document.createElement('span');
    magnitude.className = 'vector-row-magnitude';

    element.append(label, fields[0].wrapper, fields[1].wrapper, magnitude);

    // config.json vectorMode.interactions.remove: no × button
    let remove = null;
    if (this.options.interactions.remove) {
      remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'button button-tertiary button-xsmall vector-remove';
      remove.dataset.vectorId = String(vector.id);
      remove.textContent = '×';
      element.append(remove);
    }
    return { element, label, fields, magnitude, remove, vector, coordinateMode: null, snapshot: null, exact: null };
  }

  /**
   * Sync a row with its vector. Fields are left alone while the row has focus.
   * @param {Object} row - Row from createVectorRow
   * @param {string} coordinateMode - 'cartesian' or 'polar'
   * @param {boolean} [force=false] - Overwrite fields even if the row has focus
   */
  updateVectorRow(row, coordinateMode, force = false) {
    const { vector } = row;
    row.label.textContent = vector.label;
    row.label.style.setProperty('--vector-color', vector.color);
    if (row.remove) row.remove.setAttribute('aria-label', `Remove ${vector.label}`);

    if (row.coordinateMode !== coordinateMode) {
      this.labelCoordFields(row.fields, coordinateMode, vector.label);
      row.coordinateMode = coordinateMode;
      force = true;
    }

    // Polar mode already shows the magnitude as r
    row.magnitude.hidden = coordinateMode === 'polar';
    row.magnitude.textContent = `|v| ${vector.magnitude().toFixed(2)}`;

    if (!force && row.element.contains(document.activeElement)) return;

    const values = this.getDisplayValues(vector, coordinateMode);
    row.fields.forEach((field, index) => {
      field.input.value = values[index];
      field.wrapper.classList.remove('is-invalid');
    });
    // Fields show rounded values; an untouched field must keep the exact one
    row.exact = { shown: values, values: this.getExactValues(vector, coordinateMode) };
  }

  /**
   * @param {Vector} vector
   * @param {string} coordinateMode - 'cartesian' or 'polar'
   * @returns {number[]} The two unrounded field values
   */
  getExactValues(vector, coordinateMode) {
    if (coordinateMode === 'polar') {
      const { r, theta } = vector.toPolar();
      return [r, theta];
    }
    return [vector.x, vector.y];
  }

  /**
   * @param {Vector} vector
   * @param {string} coordinateMode - 'cartesian' or 'polar'
   * @returns {string[]} The two field values, rounded to 2 decimals
   */
  getDisplayValues(vector, coordinateMode) {
    if (coordinateMode === 'polar') {
      const { r, theta } = vector.toPolar();
      return [this.formatCoordinate(r), this.formatCoordinate(theta)];
    }
    return [this.formatCoordinate(vector.x), this.formatCoordinate(vector.y)];
  }

  formatCoordinate(value) {
    return String(Number(value.toFixed(2)) || 0);
  }

  /**
   * Parse a typed coordinate; accepts a comma as the decimal separator
   * @param {string} text
   * @returns {number|null} The number, or null if the text isn't one
   */
  parseCoordinate(text) {
    const normalized = text.trim().replace(',', '.');
    if (normalized === '') return null;
    const value = Number(normalized);
    return Number.isFinite(value) ? value : null;
  }

  /**
   * Validate a pair of fields and convert them to Cartesian components.
   * Invalid fields are flagged; in polar mode r must not be negative.
   * @param {Array} fields - Two fields from createCoordField
   * @param {string} coordinateMode - 'cartesian' or 'polar'
   * @param {boolean} [flagEmpty=true] - Flag empty fields as invalid
   * @param {Object} [exact] - `{ shown, values }`: fields still showing `shown[i]` read as `values[i]`
   * @returns {{x: number, y: number}|null} Components, or null if a field is invalid
   */
  readCoordFields(fields, coordinateMode, flagEmpty = true, exact = null) {
    const values = fields.map((field, index) => (
      exact && field.input.value === exact.shown[index]
        ? exact.values[index]
        : this.parseCoordinate(field.input.value)
    ));
    const valid = values.map((value, index) => {
      if (value === null) return false;
      return !(coordinateMode === 'polar' && index === 0 && value < 0);
    });

    fields.forEach((field, index) => {
      const empty = field.input.value.trim() === '';
      field.wrapper.classList.toggle('is-invalid', !valid[index] && (flagEmpty || !empty));
    });

    if (!valid[0] || !valid[1]) return null;
    return coordinateMode === 'polar'
      ? Vector.polarToCartesian(values[0], values[1])
      : { x: values[0], y: values[1] };
  }

  // ----------------------------------------------------------------------------
  // New-vector draft row
  // ----------------------------------------------------------------------------

  /** Show the draft row (or focus it if already open) */
  openDraft() {
    if (!this.listState || !this.listState.nextVector) return;

    if (!this.draft) {
      this.draft = this.createDraftRow();
      this.refreshVectorList();
    }
    this.draft.fields[0].input.focus();
  }

  closeDraft() {
    if (!this.draft) return;
    this.draft = null;
    this.refreshVectorList();
  }

  createDraftRow() {
    const element = document.createElement('div');
    element.className = 'vector-row vector-row-draft body-xsmall';

    const label = document.createElement('span');
    label.className = 'vector-label';

    const fields = [this.createCoordField(), this.createCoordField()];

    const confirm = document.createElement('button');
    confirm.type = 'button';
    confirm.className = 'button button-primary button-xsmall vector-draft-confirm';
    confirm.textContent = '✓';
    confirm.disabled = true;

    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'button button-tertiary button-xsmall vector-draft-cancel';
    cancel.setAttribute('aria-label', 'Cancel new vector');
    cancel.textContent = '×';

    element.append(label, fields[0].wrapper, fields[1].wrapper, confirm, cancel);
    return { element, label, fields, confirm, cancel, coordinateMode: null };
  }

  /**
   * Keep the draft's label on the next free slot and convert typed values
   * when the coordinate mode changes
   * @param {Vector} nextVector - Vector the draft would become
   * @param {string} coordinateMode - 'cartesian' or 'polar'
   */
  updateDraftRow(nextVector, coordinateMode) {
    const draft = this.draft;
    draft.label.textContent = nextVector.label;
    draft.label.style.setProperty('--vector-color', nextVector.color);
    draft.confirm.setAttribute('aria-label', `Add ${nextVector.label}`);
    draft.nextLabel = nextVector.label;

    if (draft.coordinateMode !== coordinateMode) {
      if (draft.coordinateMode) {
        const components = this.readCoordFields(draft.fields, draft.coordinateMode, false);
        const values = components
          ? this.getDisplayValues(new Vector(components.x, components.y), coordinateMode)
          : ['', ''];
        draft.fields.forEach((field, index) => {
          field.input.value = values[index];
          field.wrapper.classList.remove('is-invalid');
        });
      }
      this.labelCoordFields(draft.fields, coordinateMode, nextVector.label);
      draft.coordinateMode = coordinateMode;
    }
    this.updateDraftConfirm();
  }

  /**
   * Enable the confirm button only for a valid, non-zero vector
   * @returns {{x: number, y: number}|null} Components if the draft can be added
   */
  updateDraftConfirm() {
    const draft = this.draft;
    const components = this.readCoordFields(draft.fields, draft.coordinateMode, false);
    const usable = Boolean(components) && (components.x !== 0 || components.y !== 0);
    draft.confirm.disabled = !usable;
    draft.confirm.title = components && !usable
      ? 'A vector needs a non-zero length'
      : `Add ${draft.nextLabel || 'vector'}`;
    return usable ? components : null;
  }

  submitDraft() {
    const draft = this.draft;
    const components = this.updateDraftConfirm();
    if (!components) {
      // Point the user at the first field that still needs a value
      this.readCoordFields(draft.fields, draft.coordinateMode, true);
      const target = draft.fields.find(field => field.wrapper.classList.contains('is-invalid')) || draft.fields[0];
      target.input.focus();
      return;
    }

    this.draft = null;
    if (this.handlers.onAddVector) {
      this.handlers.onAddVector(components.x, components.y);
    }
    this.refreshVectorList();
    if (this.elements.vectorAdd && !this.elements.vectorAdd.disabled) {
      this.elements.vectorAdd.focus();
    }
  }

  // ----------------------------------------------------------------------------
  // Vector list events (delegated from #vector-list)
  // ----------------------------------------------------------------------------

  /**
   * @param {Event} e
   * @returns {{kind: 'draft'}|{kind: 'vector', row: Object}|null} Row the event belongs to
   */
  getEventRow(e) {
    const element = e.target.closest('.vector-row');
    if (!element) return null;
    if (this.draft && element === this.draft.element) return { kind: 'draft' };
    const row = this.vectorRows.get(Number(element.dataset.vectorId));
    return row ? { kind: 'vector', row } : null;
  }

  handleListClick(e) {
    const removeButton = e.target.closest('.vector-remove');
    if (removeButton && this.handlers.onRemoveVector) {
      this.handlers.onRemoveVector(Number(removeButton.dataset.vectorId));
      return;
    }
    if (e.target.closest('.vector-draft-confirm')) {
      this.submitDraft();
    } else if (e.target.closest('.vector-draft-cancel')) {
      this.closeDraft();
    }
  }

  handleListInput(e) {
    const target = this.getEventRow(e);
    if (!target) return;

    if (target.kind === 'draft') {
      this.updateDraftConfirm();
      return;
    }

    // Empty fields aren't flagged mid-edit; leaving the row restores them
    const { row } = target;
    const components = this.readCoordFields(row.fields, row.coordinateMode, false, row.exact);
    if (components && this.handlers.onVectorInput) {
      this.handlers.onVectorInput(row.vector.id, components.x, components.y);
    }
  }

  handleListKeydown(e) {
    if (e.key !== 'Enter' && e.key !== 'Escape') return;
    if (!e.target.classList.contains('coord-input')) return;
    const target = this.getEventRow(e);
    if (!target) return;
    e.preventDefault();

    if (target.kind === 'draft') {
      if (e.key === 'Escape') {
        this.closeDraft();
        if (this.elements.vectorAdd) this.elements.vectorAdd.focus();
      } else if (e.target === this.draft.fields[0].input && this.draft.fields[1].input.value.trim() === '') {
        this.draft.fields[1].input.focus();
      } else {
        this.submitDraft();
      }
      return;
    }

    const { row } = target;
    if (e.key === 'Escape' && row.snapshot && this.handlers.onVectorInput) {
      this.handlers.onVectorInput(row.vector.id, row.snapshot.x, row.snapshot.y);
    }
    e.target.blur();
  }

  handleListFocusIn(e) {
    const target = this.getEventRow(e);
    if (!target || target.kind !== 'vector') return;
    const { row } = target;
    if (!row.element.contains(e.relatedTarget)) {
      row.snapshot = { x: row.vector.x, y: row.vector.y };
    }
  }

  handleListFocusOut(e) {
    const target = this.getEventRow(e);
    if (!target || target.kind !== 'vector') return;
    const { row } = target;
    if (row.element.contains(e.relatedTarget)) return;

    // Leaving the row: drop invalid text and show the vector's actual values
    this.updateVectorRow(row, row.coordinateMode, true);

    const { snapshot, vector } = row;
    row.snapshot = null;
    if (snapshot && (snapshot.x !== vector.x || snapshot.y !== vector.y) && this.handlers.onVectorCommit) {
      this.handlers.onVectorCommit(vector.id);
    }
  }

  /**
   * Refresh operand dropdowns when vectors are added or removed.
   * Rebuilding is skipped while the set of vectors is unchanged (e.g. while dragging).
   * @param {Array<Vector>} vectors - User vectors (sorted by id)
   */
  updateVectorOptions(vectors) {
    const signature = vectors.map(v => v.id).join(',');
    if (signature === this.optionsSignature) return;
    this.optionsSignature = signature;

    const vectorItems = vectors.map(v => ({ value: String(v.id), label: v.label }));
    this.vectorLabels = new Map([...vectorItems, ...AXIS_OPTIONS].map(item => [item.value, item.label]));

    OPERAND_SELECTS.forEach(({ key, defaultSlot, withAxes }) => {
      const dropdown = this.dropdowns[key];
      if (!dropdown) return;

      const items = withAxes ? [...AXIS_OPTIONS, ...vectorItems] : vectorItems; // axes first, so they stay visible with many vectors
      const current = dropdown.getValue();
      if (!items.some(item => item.value === current)) {
        this.userSelected[key] = false;
      }

      let selected = null;
      if (this.userSelected[key]) {
        selected = current;
      } else if (withAxes && vectorItems.length <= defaultSlot) {
        selected = AXIS_OPTIONS[0].value; // too few vectors for a distinct default: use the x-axis
      } else if (vectorItems.length > 0) {
        selected = vectorItems[Math.min(defaultSlot, vectorItems.length - 1)].value;
      }

      const container = dropdown.container;
      dropdown.destroy();
      this.dropdowns[key] = this.createOperandDropdown(key, container, items, selected);
    });

    this.updateOperationLabels();
  }

  /**
   * Update button states based on how many vectors exist
   * @param {number} vectorCount - Number of user vectors
   */
  updateButtonStates(vectorCount) {
    const disabled = vectorCount === 0;
    [
      'opAdd', 'opSubtract', 'opScale', 'opDot', 'opProject', 'opAngle',
      'opNormalize', 'opPerpendicular', 'opReflect', 'opLinearCombo'
    ].forEach((key) => {
      if (this.elements[key]) this.elements[key].disabled = disabled;
    });
  }

  /**
   * Refresh text that depends on the selected operands. Operation buttons keep
   * short fixed labels (the dropdowns already show the operands); only the
   * linear combination shows a preview of the expression it will draw.
   */
  updateOperationLabels() {
    this.updateLinearComboButton();
  }

  /**
   * Update the linear combination preview (e.g. "2v₁ − v₂")
   */
  updateLinearComboButton() {
    const preview = this.elements.linearComboPreview;
    if (!preview) return;

    const labelA = this.getOperandLabel('comboA');
    const labelB = this.getOperandLabel('comboB');
    if (!labelA || !labelB) {
      preview.textContent = '';
      return;
    }

    const { scalarA, scalarB } = this.getLinearComboScalars();

    // Round to 1 decimal place
    const roundedA = Math.round(scalarA * 10) / 10;
    const roundedB = Math.round(scalarB * 10) / 10;

    // Format with proper signs; a coefficient of 1 is implied
    const aText = roundedA === 1 ? '' : roundedA === -1 ? '−' : String(roundedA).replace('-', '−');
    const bAbs = Math.abs(roundedB);
    const bText = `${roundedB >= 0 ? ' + ' : ' − '}${bAbs === 1 ? '' : bAbs}`;

    preview.textContent = `${aText}${labelA}${bText}${labelB}`;
  }

  /**
   * Display result lines in the results panel
   * @param {...string} lines - One or more lines to display
   */
  displayResult(...lines) {
    if (this.resultsPanel) {
      this.resultsPanel.show(...lines);
    }
  }

  /**
   * Clear the results panel
   */
  clearResults() {
    if (this.resultsPanel) {
      this.resultsPanel.clear();
    }
  }

  /**
   * Get the vector id selected in an operand dropdown
   * @param {string} key - Operand key from OPERAND_SELECTS
   * @returns {number|null} Vector id or null when nothing (or an axis) is selected
   */
  getOperandId(key) {
    const value = this.getOperandValue(key);
    return value && !this.isAxisValue(value) ? Number(value) : null;
  }

  /**
   * Get the raw value selected in an operand dropdown: a vector id as a string,
   * or an axis value ('x-axis' / 'y-axis') in dropdowns with withAxes
   * @param {string} key - Operand key from OPERAND_SELECTS
   * @returns {string|null} Selected value or null
   */
  getOperandValue(key) {
    return this.dropdowns[key] ? this.dropdowns[key].getValue() : null;
  }

  /**
   * @param {string|null} value - Operand dropdown value
   * @returns {boolean} Whether the value is an axis option
   */
  isAxisValue(value) {
    return AXIS_OPTIONS.some(axis => axis.value === value);
  }

  /**
   * Get the label of the vector selected in an operand dropdown
   * @param {string} key - Operand key from OPERAND_SELECTS
   * @returns {string|null} Vector label or null
   */
  getOperandLabel(key) {
    const value = this.dropdowns[key] ? this.dropdowns[key].getValue() : null;
    return this.vectorLabels.get(value) || null;
  }

  /**
   * Get scalar input value
   * @returns {number} Scalar value or NaN
   */
  getScalarInput() {
    if (!this.elements.scalarInput) return NaN;
    return parseFloat(this.elements.scalarInput.value);
  }

  /**
   * Get linear combination scalar values
   * @returns {Object} Object with scalarA and scalarB
   */
  getLinearComboScalars() {
    const scalarA = this.sliders.lcScalarA ? this.sliders.lcScalarA.getValue() : NaN;
    const scalarB = this.sliders.lcScalarB ? this.sliders.lcScalarB.getValue() : NaN;
    return { scalarA, scalarB };
  }

  /**
   * Get selected reflection axis
   * @returns {string} Reflection type ('x-axis', 'y-axis', 'diagonal')
   */
  getReflectionType() {
    return this.dropdowns.reflectType ? this.dropdowns.reflectType.getValue() : 'x-axis';
  }

  /**
   * Get coordinate mode
   * @returns {string} 'cartesian' or 'polar'
   */
  getCoordinateMode() {
    return this.dropdowns.coordMode ? this.dropdowns.coordMode.getValue() : 'cartesian';
  }

  /**
   * Clean up all event listeners
   */
  destroy() {
    if (this.eventListeners) {
      this.eventListeners.forEach(({ element, event, handler }) => {
        if (element && typeof element.removeEventListener === 'function') {
          element.removeEventListener(event, handler);
        }
      });
      this.eventListeners = [];
    }

    // The list container outlives this instance; drop rows it owns
    this.vectorRows.clear();
    this.draft = null;
    this.handlers = {};
    if (this.elements.vectorList) {
      this.elements.vectorList.replaceChildren();
    }

    // Destroy all dropdowns
    if (this.dropdowns) {
      Object.values(this.dropdowns).forEach(dropdown => {
        if (dropdown && typeof dropdown.destroy === 'function') {
          dropdown.destroy();
        }
      });
      this.dropdowns = {};
    }

    // Destroy all sliders
    if (this.sliders) {
      Object.values(this.sliders).forEach(slider => {
        if (slider && typeof slider.destroy === 'function') {
          slider.destroy();
        }
      });
      this.sliders = {};
    }
  }
}
