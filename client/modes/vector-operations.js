/**
 * VectorOperations Class
 * Encapsulates vector math operations and result formatting
 * Returns operation results without side effects
 *
 * Operand vectors are user vectors created by VectorMode and carry:
 * - label: display label with subscript (e.g. 'v₃')
 * - subscript: subscript digits only (e.g. '₃')
 * - name: plain-text name used in logs (e.g. 'v3')
 */

class VectorOperations {
  constructor(appConfig, styleConstants) {
    this.appConfig = appConfig; // Runtime configuration (for future operation group checks)
    this.styleConstants = styleConstants; // Styling constants (colors, etc.)

    // Set Vector default result color from styleConstants
    if (Vector.setDefaultResultColor) {
      Vector.setDefaultResultColor(styleConstants.colors.result);
    }
  }

  /**
   * Format a vector as [x, y]
   * @param {Vector} vector - Vector to format
   * @param {number} digits - Decimal places
   * @returns {string} Formatted components
   */
  format(vector, digits = 1) {
    return `[${vector.x.toFixed(digits)}, ${vector.y.toFixed(digits)}]`;
  }

  /**
   * Format a vector in polar form so results can be read in either coordinate system
   * @param {Vector} vector - Vector to format
   * @returns {string} e.g. 'polar: r = 5.00, θ = 53.13°'
   */
  formatPolar(vector) {
    const { r, theta } = vector.toPolar();
    if (r < 1e-9) return 'polar: r = 0 (no direction)';
    return `polar: r = ${r.toFixed(2)}, θ = ${theta.toFixed(2)}°`;
  }

  /**
   * Format a vector for log messages: name (x, y)
   * @param {Vector} vector - Vector to describe
   * @returns {string} Log-friendly description
   */
  describe(vector) {
    return `${vector.name} (${vector.x.toFixed(1)}, ${vector.y.toFixed(1)})`;
  }

  /**
   * Perform vector addition
   * @param {Vector} vectorA - First operand
   * @param {Vector} vectorB - Second operand
   * @returns {Object} Operation result with result vector and formatted strings
   */
  add(vectorA, vectorB) {
    if (!vectorA || !vectorB) return null;

    const result = vectorA.add(vectorB);
    result.label = `${vectorA.label} + ${vectorB.label}`;

    logAction(`Add operation: ${this.describe(vectorA)} + ${this.describe(vectorB)}. Result: (${result.x.toFixed(1)}, ${result.y.toFixed(1)})`);

    const formula = `${vectorA.label} + ${vectorB.label} = ${this.format(vectorA)} + ${this.format(vectorB)}`;
    const resultText = `= ${this.format(result)}`;

    return {
      resultVector: result,
      parallelogramVectors: { v1: vectorA, v2: vectorB, negatedV2: null },
      resultLines: [formula, resultText]
    };
  }

  /**
   * Perform vector subtraction
   * @param {Vector} vectorA - Minuend
   * @param {Vector} vectorB - Subtrahend
   * @returns {Object} Operation result with result vector and formatted strings
   */
  subtract(vectorA, vectorB) {
    if (!vectorA || !vectorB) return null;

    const result = vectorA.subtract(vectorB);
    result.label = `${vectorA.label} - ${vectorB.label}`;

    logAction(`Subtract operation: ${this.describe(vectorA)} - ${this.describe(vectorB)}. Result: (${result.x.toFixed(1)}, ${result.y.toFixed(1)})`);

    // Negated B for parallelogram visualization (a - b = a + (-b))
    const negB = new Vector(-vectorB.x, -vectorB.y, vectorB.color, `-${vectorB.label}`);

    const formula = `${vectorA.label} - ${vectorB.label} = ${this.format(vectorA)} - ${this.format(vectorB)}`;
    const resultText = `= ${this.format(result)}`;

    return {
      resultVector: result,
      parallelogramVectors: { v1: vectorA, v2: negB, negatedV2: negB },
      resultLines: [formula, resultText]
    };
  }

  /**
   * Perform scalar multiplication
   * @param {Vector} vector - Vector to scale
   * @param {number} scalar - Scalar value
   * @returns {Object} Operation result with result vector and formatted strings
   */
  scale(vector, scalar) {
    if (!vector || isNaN(scalar)) return null;

    const result = vector.scale(scalar);
    result.label = `${scalar}${vector.label}`;
    result.color = this.styleConstants.colors.result;

    logAction(`Scale operation: ${this.describe(vector)} * ${scalar}. Result: (${result.x.toFixed(1)}, ${result.y.toFixed(1)})`);

    const formula = `${scalar}${vector.label} = ${scalar} × ${this.format(vector)}`;
    const resultText = `= ${this.format(result)}`;

    return {
      resultVector: result,
      clearParallelogram: true,
      clearAngleArc: true,
      resultLines: [formula, resultText]
    };
  }

  /**
   * Perform dot product
   * @param {Vector} vectorA - First operand
   * @param {Vector} vectorB - Second operand
   * @returns {Object} Operation result with formatted strings
   */
  dot(vectorA, vectorB) {
    if (!vectorA || !vectorB) return null;

    const dotProduct = vectorA.dot(vectorB);

    logAction(`Dot product: ${this.describe(vectorA)} · ${this.describe(vectorB)}. Result: ${dotProduct.toFixed(2)}`);

    const formula = `${vectorA.label} · ${vectorB.label} = ${this.format(vectorA)} · ${this.format(vectorB)}`;
    const calculation = `= (${vectorA.x.toFixed(1)} × ${vectorB.x.toFixed(1)}) + (${vectorA.y.toFixed(1)} × ${vectorB.y.toFixed(1)})`;
    const resultText = `= ${dotProduct.toFixed(2)}`;

    return {
      resultVector: null,
      clearParallelogram: true,
      clearAngleArc: true,
      resultLines: [formula, calculation, resultText]
    };
  }

  /**
   * Perform projection
   * @param {Vector} vectorA - Vector to project
   * @param {Vector} vectorB - Vector to project onto
   * @returns {Object} Operation result with result vector and formatted strings
   */
  project(vectorA, vectorB) {
    if (!vectorA || !vectorB) return null;

    const a = vectorA.label;
    const b = vectorB.label;
    const mag2Squared = vectorB.x * vectorB.x + vectorB.y * vectorB.y;

    if (mag2Squared === 0) {
      return {
        resultVector: null,
        clearParallelogram: true,
        clearAngleArc: true,
        resultLines: [`proj_${b}(${a}) is undefined`, `${b} is the zero vector`]
      };
    }

    const result = vectorA.projectOnto(vectorB);
    result.label = `proj_${vectorB.axisName || b}(${a})`;

    logAction(`Project operation: ${this.describe(vectorA)} onto ${this.describe(vectorB)}. Result: (${result.x.toFixed(2)}, ${result.y.toFixed(2)})`);

    const dotProduct = vectorA.dot(vectorB);

    // Onto an axis: the unit vector î or ĵ keeps only that component
    if (vectorB.axisName) {
      return {
        resultVector: result,
        clearParallelogram: true,
        clearAngleArc: true,
        resultLines: [
          `${result.label} = (${a}·${b}) ${b}`,
          `= ${dotProduct.toFixed(2)} × ${this.format(vectorB)}`,
          `= ${this.format(result, 2)}`
        ]
      };
    }

    const formula = `proj_${b}(${a}) = ((${a}·${b})/(${b}·${b})) × ${b}`;
    const calculation = `= ((${dotProduct.toFixed(2)})/(${mag2Squared.toFixed(2)})) × ${this.format(vectorB)}`;
    const resultText = `= ${this.format(result, 2)}`;

    return {
      resultVector: result,
      projectionState: { source: vectorA },
      clearParallelogram: true,
      clearAngleArc: true,
      resultLines: [formula, calculation, resultText]
    };
  }

  /**
   * Calculate angle between vectors
   * @param {Vector} vectorA - First operand
   * @param {Vector} vectorB - Second operand
   * @returns {Object} Operation result with angle arc state and formatted strings
   */
  angleBetween(vectorA, vectorB) {
    if (!vectorA || !vectorB) return null;

    const angleRad = vectorA.angleBetween(vectorB);
    const angleDeg = vectorA.angleBetweenDegrees(vectorB);

    logAction(`Angle between: ${this.describe(vectorA)} and ${this.describe(vectorB)}. Result: ${angleDeg.toFixed(2)}°`);

    const a = vectorA.label;
    const b = vectorB.label;
    const dotProduct = vectorA.dot(vectorB);
    const magA = vectorA.magnitude();
    const magB = vectorB.magnitude();

    const formula = `θ = arccos((${a}·${b})/(||${a}||×||${b}||))`;
    const calculation = `= arccos((${dotProduct.toFixed(2)})/(${magA.toFixed(2)}×${magB.toFixed(2)}))`;
    const resultText = `= ${angleDeg.toFixed(2)}° (${angleRad.toFixed(3)} radians)`;

    return {
      resultVector: null,
      clearParallelogram: true,
      angleArcState: {
        vector1: vectorA,
        vector2: vectorB,
        angleRadians: angleRad,
        angleDegrees: angleDeg
      },
      resultLines: [formula, calculation, resultText]
    };
  }

  /**
   * Normalize a vector
   * @param {Vector} vector - Vector to normalize
   * @returns {Object} Operation result with result vector and formatted strings
   */
  normalize(vector) {
    if (!vector) return null;

    const unitLabel = `û${vector.subscript}`;
    const result = vector.normalize();
    result.label = unitLabel;
    result.color = this.styleConstants.colors.result;
    result.lineWidth = 4;  // Thicker line for better visibility

    logAction(`Normalize operation: ${this.describe(vector)}. Result: (${result.x.toFixed(3)}, ${result.y.toFixed(3)})`);

    const mag = vector.magnitude();
    const formula = `${unitLabel} = ${vector.label}/||${vector.label}||`;
    const calculation = `= ${this.format(vector)}/${mag.toFixed(2)}`;
    const resultText = `= ${this.format(result, 3)} (magnitude = 1.0)`;

    return {
      resultVector: result,
      clearParallelogram: true,
      clearAngleArc: true,
      resultLines: [formula, calculation, resultText]
    };
  }

  /**
   * Get perpendicular vector
   * @param {Vector} vector - Vector to get perpendicular of
   * @returns {Object} Operation result with result vector and formatted strings
   */
  perpendicular(vector) {
    if (!vector) return null;

    const perpLabel = `${vector.label}⊥`;
    const result = vector.perpendicular();
    result.label = perpLabel;
    result.color = vector.color;

    logAction(`Perpendicular operation: ${this.describe(vector)}. Result: (${result.x.toFixed(1)}, ${result.y.toFixed(1)})`);

    const formula = `${perpLabel} = [-y, x] (90° rotation)`;
    const resultText = `= ${this.format(result)}`;

    return {
      resultVector: result,
      clearParallelogram: true,
      clearAngleArc: true,
      resultLines: [formula, resultText]
    };
  }

  /**
   * Reflect a vector
   * @param {Vector} vector - Vector to reflect
   * @param {string} reflectionType - 'x-axis', 'y-axis', or 'diagonal'
   * @returns {Object} Operation result with result vector and formatted strings
   */
  reflect(vector, reflectionType) {
    if (!vector) return null;

    const label = vector.label;
    let result, axis, formula;

    switch (reflectionType) {
      case 'x-axis':
        result = vector.reflectX();
        result.label = `${label}_reflₓ`;
        axis = 'X-axis';
        formula = `Reflect ${label} across X-axis: (x, y) → (x, -y)`;
        break;
      case 'y-axis':
        result = vector.reflectY();
        result.label = `${label}_refly`;
        axis = 'Y-axis';
        formula = `Reflect ${label} across Y-axis: (x, y) → (-x, y)`;
        break;
      case 'diagonal':
        result = vector.reflectDiagonal();
        result.label = `${label}_reflᵈ`;
        axis = 'diagonal (y=x)';
        formula = `Reflect ${label} across y=x: (x, y) → (y, x)`;
        break;
      default:
        return null;
    }

    logAction(`Reflect ${axis}: ${this.describe(vector)}. Result: (${result.x.toFixed(1)}, ${result.y.toFixed(1)})`);

    const calculation = `${this.format(vector)} → ${this.format(result)}`;

    return {
      resultVector: result,
      clearParallelogram: true,
      clearAngleArc: true,
      resultLines: [formula, calculation]
    };
  }

  /**
   * Perform linear combination a·A + b·B
   * @param {Vector} vectorA - First operand
   * @param {Vector} vectorB - Second operand
   * @param {number} scalarA - Scalar for vectorA
   * @param {number} scalarB - Scalar for vectorB
   * @returns {Object} Operation result with result vector and formatted strings
   */
  linearCombination(vectorA, vectorB, scalarA, scalarB) {
    if (!vectorA || !vectorB || isNaN(scalarA) || isNaN(scalarB)) return null;

    const termA = `${scalarA}${vectorA.label}`;
    const termB = `${scalarB}${vectorB.label}`;

    const scaledA = vectorA.scale(scalarA);
    scaledA.label = termA;
    scaledA.color = vectorA.color;

    const scaledB = vectorB.scale(scalarB);
    scaledB.label = termB;
    scaledB.color = vectorB.color;

    const result = new Vector(
      scaledA.x + scaledB.x,
      scaledA.y + scaledB.y,
      this.styleConstants.colors.result,
      `${termA} + ${termB}`
    );

    logAction(`Linear combination: ${scalarA}${vectorA.name} + ${scalarB}${vectorB.name}. Result: (${result.x.toFixed(2)}, ${result.y.toFixed(2)})`);

    const formula = `${termA} + ${termB}`;
    const calculation = `= ${scalarA}${this.format(vectorA)} + ${scalarB}${this.format(vectorB)}`;
    const resultText = `= ${this.format(result, 2)}`;

    return {
      resultVector: result,
      parallelogramVectors: {
        v1: scaledA,
        v2: scaledB,
        negatedV2: null,
        isLinearCombination: true,
        scaledV1: scaledA,
        scaledV2: scaledB,
        scalarA: scalarA,
        scalarB: scalarB
      },
      resultLines: [formula, calculation, resultText]
    };
  }
}
