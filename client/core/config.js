/**
 * Config Loader
 * Handles loading and parsing of configuration from config.json
 */

(function() {
  let configCache = null;
  let configPromise = null;

  // Default configuration. Sidebar sections default to shown; see SidebarSections.
  const DEFAULT_CONFIG = {
    defaultMode: 'vector',
    enabledModes: ['vector', 'matrix', 'tensor'],
    ui: {},
    vectorMode: {
      maxVectors: 12,
      sections: {}
    },
    matrixMode: {
      maxMatrices: 2,
      includeVector: false,
      sections: {}
    },
    tensorMode: {
      sections: {}
    }
  };

  /**
   * Load configuration from config.json
   * @returns {Promise<Object>} Configuration object
   */
  async function loadConfig() {
    if (configCache) {
      return configCache;
    }

    if (configPromise) {
      return configPromise;
    }

    configPromise = (async () => {
      // Emit loading status if StatusService is available
      if (window.StatusService) {
        window.StatusService.setLoading();
      }

      try {
        const response = await fetch('./config.json');

        if (!response.ok) {
          console.warn('config.json not found, using default configuration');
          const config = {
            ...DEFAULT_CONFIG,
            enabledModes: [...DEFAULT_CONFIG.enabledModes]
          };
          // Ensure defaultMode is always included in enabledModes
          if (!config.enabledModes.includes(config.defaultMode)) {
            config.enabledModes = [...config.enabledModes, config.defaultMode];
          }
          configCache = config;

          if (window.StatusService) {
            window.StatusService.setReady();
          }

          return config;
        }

        const userConfig = await response.json();

        // Merge with defaults
        const defaultMode = userConfig.defaultMode || DEFAULT_CONFIG.defaultMode;
        let enabledModes = Array.isArray(userConfig.enabledModes) && userConfig.enabledModes.length > 0
          ? userConfig.enabledModes
          : DEFAULT_CONFIG.enabledModes;

        // Ensure defaultMode is always included in enabledModes
        if (!enabledModes.includes(defaultMode)) {
          enabledModes = [...enabledModes, defaultMode];
        }

        const config = {
          defaultMode: defaultMode,
          enabledModes: enabledModes,
          ui: {
            ...DEFAULT_CONFIG.ui,
            ...(userConfig.ui || {})
          },
          vectorMode: {
            ...DEFAULT_CONFIG.vectorMode,
            ...(userConfig.vectorMode || userConfig), // Backward compatible
            operationGroups: userConfig.vectorMode?.operationGroups || userConfig.operationGroups
          },
          matrixMode: {
            ...DEFAULT_CONFIG.matrixMode,
            ...(userConfig.matrixMode || {})
          },
          tensorMode: {
            ...DEFAULT_CONFIG.tensorMode,
            ...(userConfig.tensorMode || {})
          }
        };

        configCache = config;
        console.log(`Configuration loaded successfully. Default mode: ${config.defaultMode}`);

        if (window.StatusService) {
          window.StatusService.setReady();
        }

        return config;
      } catch (error) {
        console.warn('Failed to load config.json, using default configuration:', error);
        const config = {
          ...DEFAULT_CONFIG,
          enabledModes: [...DEFAULT_CONFIG.enabledModes]
        };
        // Ensure defaultMode is always included in enabledModes
        if (!config.enabledModes.includes(config.defaultMode)) {
          config.enabledModes = [...config.enabledModes, config.defaultMode];
        }
        configCache = config;

        if (window.StatusService) {
          window.StatusService.setLoadFailed();
        }

        return config;
      }
    })();

    return configPromise;
  }

  /**
   * Get cached configuration (synchronous)
   * Returns null if config hasn't been loaded yet
   * @returns {Object|null} Configuration object or null
   */
  function getConfig() {
    return configCache;
  }

  /**
   * Clear configuration cache (useful for testing or reloading)
   */
  function clearCache() {
    configCache = null;
    configPromise = null;
  }

  // ==========================================================================
  // Option readers: forgiving parsers for the feature switches and starting
  // values in config.json. Bad values are reported in the console and fall
  // back to the default, so a typo never breaks a practice.
  // ==========================================================================

  /**
   * Read an on/off switch: a boolean, or `{ "shown": bool }` / `{ "enabled": bool }`
   * @param {*} value - Raw config value
   * @param {boolean} [fallback=true] - Used when the value is missing or malformed
   * @param {string} [path] - Config path for the warning
   * @returns {boolean}
   */
  function readFlag(value, fallback = true, path = '') {
    if (value === undefined || value === null) return fallback;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'object') {
      if (typeof value.shown === 'boolean') return value.shown;
      if (typeof value.enabled === 'boolean') return value.enabled;
    }
    console.warn(`config.json: ${path || 'value'} must be true or false`);
    return fallback;
  }

  /**
   * Read a group of switches, every known key defaulting to on
   * @param {Object} [source] - Raw config object, e.g. vectorMode.interactions
   * @param {string[]} keys - Known keys
   * @param {string} path - Config path for warnings
   * @returns {Object} Frozen `{ key: boolean }` map
   */
  function readFlags(source, keys, path) {
    const flags = {};
    keys.forEach(key => { flags[key] = true; });
    if (source !== undefined && (source === null || typeof source !== 'object' || Array.isArray(source))) {
      console.warn(`config.json: ${path} must be an object of true/false switches`);
      return Object.freeze(flags);
    }
    Object.keys(source || {}).forEach(key => {
      if (!keys.includes(key)) {
        console.warn(`config.json: unknown ${path} key "${key}" (known: ${keys.join(', ')})`);
        return;
      }
      flags[key] = readFlag(source[key], true, `${path}.${key}`);
    });
    return Object.freeze(flags);
  }

  /**
   * Convert a config value to a number without coercion surprises: only real
   * numbers and non-blank numeric strings count. null, booleans, blank strings
   * and objects (including ones whose toString/valueOf would throw) give NaN.
   * @returns {number} The number, or NaN
   */
  function toNumber(value) {
    if (typeof value === 'number') return value;
    if (typeof value === 'string' && value.trim() !== '') return Number(value);
    return NaN;
  }

  /**
   * Read a finite number
   * @returns {number} The number, or fallback
   */
  function readNumber(value, fallback, path = '') {
    if (value === undefined || value === null) return fallback;
    const number = toNumber(value);
    if (!Number.isFinite(number)) {
      console.warn(`config.json: ${path || 'value'} must be a number`);
      return fallback;
    }
    return number;
  }

  /**
   * Read a 2D point: `[x, y]`, `{ "x": .., "y": .. }` or polar `{ "r": .., "theta": .. }` (degrees)
   * @returns {{x: number, y: number}|null} The point, or null when malformed
   */
  function readPoint(value, path = '') {
    let x;
    let y;
    if (Array.isArray(value) && value.length === 2) {
      [x, y] = value.map(toNumber);
    } else if (value && typeof value === 'object' && 'x' in value && 'y' in value) {
      x = toNumber(value.x);
      y = toNumber(value.y);
    } else if (value && typeof value === 'object' && 'r' in value && 'theta' in value) {
      const r = toNumber(value.r);
      const theta = toNumber(value.theta) * Math.PI / 180;
      x = r * Math.cos(theta);
      y = r * Math.sin(theta);
      // Keep whole numbers whole (cos/sin leave tiny rounding errors)
      x = Math.abs(x - Math.round(x)) < 1e-9 ? Math.round(x) : x;
      y = Math.abs(y - Math.round(y)) < 1e-9 ? Math.round(y) : y;
    }
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      console.warn(`config.json: ${path || 'point'} must be [x, y], {"x": .., "y": ..} or {"r": .., "theta": ..}`);
      return null;
    }
    return { x, y };
  }

  /**
   * Read a 2×2 matrix written as rows: `[[a, b], [c, d]]`
   * @returns {number[][]|null} The rows, or null when malformed
   */
  function readMatrix2(value, path = '') {
    const ok = Array.isArray(value) && value.length === 2 && value.every(row =>
      Array.isArray(row) && row.length === 2 && row.every(cell => typeof cell === 'number' && Number.isFinite(cell)));
    if (!ok) {
      if (value !== undefined) console.warn(`config.json: ${path || 'matrix'} must be [[a, b], [c, d]] with numbers`);
      return null;
    }
    return value.map(row => [...row]);
  }

  /**
   * Read one of a fixed set of strings
   * @returns {string} The value, or fallback
   */
  function readChoice(value, choices, fallback, path = '') {
    if (value === undefined || value === null) return fallback;
    if (choices.includes(value)) return value;
    console.warn(`config.json: ${path || 'value'} must be one of ${choices.map(c => `"${c}"`).join(', ')}`);
    return fallback;
  }

  /**
   * App-wide switches (config.json "ui"); every one defaults to on
   * @param {Object} config - Loaded config
   * @returns {{helpButton: boolean, resultsPanel: boolean, zoom: boolean, pan: boolean}}
   */
  function readUiFlags(config) {
    return readFlags(config && config.ui, ['helpButton', 'resultsPanel', 'zoom', 'pan'], 'ui');
  }

  // Export to global scope
  window.ConfigService = {
    loadConfig,
    getConfig,
    clearCache
  };

  window.ConfigOptions = {
    readFlag,
    readFlags,
    readNumber,
    readPoint,
    readMatrix2,
    readChoice,
    readUiFlags
  };
})();

