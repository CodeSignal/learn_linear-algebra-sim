/**
 * Sidebar Sections
 * Config-driven visibility for every sidebar section, per mode.
 *
 * config.json sets `<mode>Mode.sections.<key>` to `{ "shown": true|false }`
 * (a bare boolean is accepted too). Missing keys are shown. The legacy
 * `<mode>Mode.operationGroups` booleans are still honoured; `sections` wins
 * when both name the same key.
 *
 * Hidden sections are removed from the DOM rather than styled away, so the
 * visibility a teacher configures cannot be toggled back from the page.
 * Markup contract:
 *   - `data-section="<key>"` marks a configurable section.
 *   - `data-section-container` marks a wrapper that is removed once none of
 *     its sections remain (e.g. the "Operations" card).
 */

const SIDEBAR_SECTIONS = Object.freeze({
  vector: Object.freeze([
    'coordinateMode',
    'reset',
    'vectorList',
    'addition',
    'scalarMultiplication',
    'dotProduct',
    'projectionAngle',
    'normalization',
    'perpendicular',
    'reflection',
    'linearCombination'
  ]),
  matrix: Object.freeze([
    'reset',
    'addition',
    'scalarMultiplication',
    'multiplication',
    'linearTransformation',
    'determinant'
  ]),
  tensor: Object.freeze([
    'reset',
    'rank0',
    'rank1',
    'rank2',
    'rank3',
    'controlsHint'
  ])
});

/**
 * @param {*} value - `{ shown: boolean }` or a boolean
 * @returns {boolean|null} The flag, or null when the value is malformed
 */
function readShownFlag(value) {
  if (typeof value === 'boolean') return value;
  if (value && typeof value === 'object' && typeof value.shown === 'boolean') {
    return value.shown;
  }
  return null;
}

/**
 * Resolve a mode's section flags into a complete, frozen `{ key: boolean }` map
 * @param {string} mode - 'vector', 'matrix' or 'tensor'
 * @param {Object} [sections] - `<mode>Mode.sections` from config.json
 * @param {Object} [legacyOperationGroups] - `<mode>Mode.operationGroups` from config.json
 * @returns {Object} Every known section key mapped to its shown flag
 */
function resolveSections(mode, sections, legacyOperationGroups) {
  const keys = SIDEBAR_SECTIONS[mode] || [];
  const resolved = {};
  keys.forEach(key => { resolved[key] = true; });

  const applySource = (source, field) => {
    if (!source || typeof source !== 'object') return;
    Object.keys(source).forEach(key => {
      if (!keys.includes(key)) {
        console.warn(`config.json: unknown ${mode}Mode.${field} key "${key}" (known: ${keys.join(', ')})`);
        return;
      }
      const shown = readShownFlag(source[key]);
      if (shown === null) {
        console.warn(`config.json: ${mode}Mode.${field}.${key} must be { "shown": true } or { "shown": false }`);
        return;
      }
      resolved[key] = shown;
    });
  };

  applySource(legacyOperationGroups, 'operationGroups');
  applySource(sections, 'sections');

  return Object.freeze(resolved);
}

/**
 * Remove hidden sections (and wrappers left empty) from a mode's sidebar
 * @param {Element} root - Mode sidebar root
 * @param {Object} sections - Resolved `{ key: boolean }` map
 */
function applySections(root, sections) {
  if (!root || !sections) return;

  root.querySelectorAll('[data-section]').forEach(element => {
    if (sections[element.dataset.section] === false) {
      element.remove();
    }
  });

  root.querySelectorAll('[data-section-container]').forEach(element => {
    if (!element.querySelector('[data-section]')) {
      element.remove();
    }
  });
}

/**
 * Choose which collapsible operation groups (`<details class="operation-group">`)
 * start open. With only a few operations left after config filtering, all of
 * them open; otherwise only the first does, so the sidebar stays short.
 * Call after applySections.
 * @param {Element} root - Mode sidebar root
 * @param {number} [openAllUpTo=3] - Open every group when there are this many or fewer
 */
function openInitialGroups(root, openAllUpTo = 3) {
  if (!root) return;
  const groups = Array.from(root.querySelectorAll('details.operation-group'));
  const openAll = groups.length <= openAllUpTo;
  groups.forEach((group, index) => {
    group.open = openAll || index === 0;
  });
}

/**
 * @param {Object} sections - Resolved `{ key: boolean }` map
 * @param {string} key - Section key
 * @returns {boolean} False only when the section is explicitly hidden
 */
function isSectionShown(sections, key) {
  return !sections || sections[key] !== false;
}

window.SidebarSections = {
  SIDEBAR_SECTIONS,
  resolveSections,
  applySections,
  openInitialGroups,
  isShown: isSectionShown
};
