/**
 * VectorCanvas Class
 * Handles canvas rendering and hit testing for vector mode
 * Pure rendering logic with no DOM queries or side effects
 */

class VectorCanvas {
  constructor(canvas, coordSystem, styleConstants, colors) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.coordSystem = coordSystem;
    this.styleConstants = styleConstants; // Styling constants
    this.colors = colors;
  }

  /**
   * Update dimensions from CoordinateSystem
   */
  updateDimensions() {
    this.width = this.coordSystem.width;
    this.height = this.coordSystem.height;
    this.centerX = this.coordSystem.centerX;
    this.centerY = this.coordSystem.centerY;
  }

  /**
   * Update colors cache
   * @param {Object} colors - Color object
   */
  updateColors(colors) {
    this.colors = colors;
  }

  // ============================================================================
  // COORDINATE TRANSFORMATIONS
  // ============================================================================

  screenToMath(screenX, screenY) {
    return this.coordSystem.screenToMath(screenX, screenY);
  }

  mathToScreen(mathX, mathY) {
    return this.coordSystem.mathToScreen(mathX, mathY);
  }

  snapToGrid(value) {
    return Math.round(value * 2) / 2; // Snap to 0.5 increments
  }

  // ============================================================================
  // HIT TESTING
  // ============================================================================

  /**
   * Check if mouse is near vector endpoint (for editing)
   * @param {number} mouseScreenX - Mouse X position in screen coordinates
   * @param {number} mouseScreenY - Mouse Y position in screen coordinates
   * @param {Array<Vector>} vectors - User vectors in draw order
   * @returns {Vector|null} Topmost vector whose endpoint is under the mouse
   */
  checkEndpointHit(mouseScreenX, mouseScreenY, vectors) {
    // Iterate in reverse so the vector drawn on top wins
    for (let i = vectors.length - 1; i >= 0; i--) {
      const endpoint = this.mathToScreen(vectors[i].x, vectors[i].y);
      const dx = mouseScreenX - endpoint.x;
      const dy = mouseScreenY - endpoint.y;
      if (Math.sqrt(dx * dx + dy * dy) <= this.styleConstants.hitRadius) {
        return vectors[i];
      }
    }
    return null;
  }

  // ============================================================================
  // RENDERING
  // ============================================================================

  /**
   * Render the canvas with current vector state
   * @param {Object} state - Rendering state object
   * @param {Array<Vector>} state.vectors - User vectors
   * @param {Vector|null} state.resultVector - Result vector
   * @param {Vector|null} state.drawingVector - Vector being drawn
   * @param {boolean} state.isDrawing - Whether currently drawing
   * @param {Vector|null} state.hoveredVector - Vector under the cursor
   * @param {Object|null} state.angleArcState - Angle arc visualization state
   * @param {Object|null} state.parallelogramState - Parallelogram animation state
   */
  render(state) {
    // Update dimensions from CoordinateSystem (in case of resize)
    this.updateDimensions();

    // Use CoordinateSystem's clear method
    this.coordSystem.clear();

    // Every line on the canvas, so labels can avoid them
    const pState = state.parallelogramState;
    const obstacles = state.vectors.map(vector => ({ vector }));
    if (state.resultVector) obstacles.push({ vector: state.resultVector });
    if (state.isDrawing && state.drawingVector) obstacles.push({ vector: state.drawingVector });
    if (pState) {
      [pState.negatedVector2, pState.scaledV1, pState.scaledV2].forEach(vector => {
        if (vector) obstacles.push({ vector });
      });
      if (pState.useVector1 && pState.useVector2) {
        obstacles.push({ vector: pState.useVector2, start: pState.useVector1 });
        obstacles.push({ vector: pState.useVector1, start: pState.useVector2 });
      }
    }
    if (state.projectionState && state.resultVector) {
      const { source } = state.projectionState;
      const tip = state.resultVector;
      obstacles.push({ vector: { x: source.x - tip.x, y: source.y - tip.y }, start: tip });
    }
    this.coordSystem.setLabelObstacles(obstacles);

    // Use CoordinateSystem for grid and axes
    this.coordSystem.drawGrid();
    this.coordSystem.drawAxes();

    // Draw vectors with hover state using CoordinateSystem
    state.vectors.forEach(vector => {
      this.coordSystem.drawVector(
        vector,
        this.styleConstants,
        this.colors,
        false,
        1,
        state.hoveredVector === vector
      );
    });

    // Draw angle arc if angle visualization is active
    if (state.angleArcState) {
      this.drawAngleArc(
        state.angleArcState.vector1,
        state.angleArcState.vector2,
        state.angleArcState.angleRadians,
        state.angleArcState.angleDegrees
      );
    }

    // Draw negated vector for subtraction (dashed style, similar to parallelogram edges)
    if (state.parallelogramState && state.parallelogramState.negatedVector2) {
      this.coordSystem.drawVector(
        state.parallelogramState.negatedVector2,
        this.styleConstants,
        this.colors,
        true,  // dashed
        0.5,   // 50% opacity like parallelogram edges
        false  // no hover
      );
    }

    // Draw scaled vectors from origin for linear combination visualization
    if (state.parallelogramState && state.parallelogramState.isLinearCombination) {
      const scaledV1 = state.parallelogramState.scaledV1;
      const scaledV2 = state.parallelogramState.scaledV2;

      // Calculate opacity with fade-in effect during animation
      const baseOpacity = this.styleConstants.parallelogram.opacity;
      const currentOpacity = baseOpacity * state.parallelogramState.edgeOpacity;

      if (scaledV1) {
        // Draw scaled v1 (av₁) from origin as dashed vector
        this.coordSystem.drawVector(
          scaledV1,
          this.styleConstants,
          this.colors,
          true,  // dashed
          currentOpacity,  // Use computed opacity with fade-in
          false  // no hover
        );
      }

      if (scaledV2) {
        // Draw scaled v2 (bv₂) from origin as dashed vector
        this.coordSystem.drawVector(
          scaledV2,
          this.styleConstants,
          this.colors,
          true,  // dashed
          currentOpacity,  // Use computed opacity with fade-in
          false  // no hover
        );
      }
    }

    // Draw parallelogram edges (if animating)
    if (state.parallelogramState && state.parallelogramState.useVector1 && state.parallelogramState.useVector2) {
      const v1 = state.parallelogramState.useVector1;
      const v2 = state.parallelogramState.useVector2;

      // Calculate opacity with fade-in effect
      const baseOpacity = this.styleConstants.parallelogram.opacity;
      const currentOpacity = baseOpacity * state.parallelogramState.edgeOpacity;

      // Draw second operand translated to the first operand's tip
      this.coordSystem.drawTranslatedVector(
        v2,
        { x: v1.x, y: v1.y },
        this.styleConstants,
        state.parallelogramState.v2Progress
      );

      // Draw first operand translated to the second operand's tip
      this.coordSystem.drawTranslatedVector(
        v1,
        { x: v2.x, y: v2.y },
        this.styleConstants,
        state.parallelogramState.v1Progress
      );
    }

    // Projection: perpendicular drop from the projected vector's tip
    if (state.projectionState && state.resultVector) {
      this.drawProjectionDrop(state.projectionState.source, state.resultVector);
    }

    // Draw result vector
    if (state.resultVector) {
      this.coordSystem.drawVector(
        state.resultVector,
        this.styleConstants,
        this.colors,
        true,
        1,
        false
      );
    }

    // Draw vector being created
    if (state.isDrawing && state.drawingVector) {
      this.coordSystem.drawVector(
        state.drawingVector,
        this.styleConstants,
        this.colors,
        false,
        0.5,
        false
      );
    }
  }

  /**
   * Draw the dashed drop line from a vector's tip to its projection, with a
   * right-angle mark where it meets the projection
   * @param {Vector} source - Vector that was projected
   * @param {Vector} projection - Projection result
   */
  drawProjectionDrop(source, projection) {
    const from = this.coordSystem.mathToScreen(source.x, source.y);
    const to = this.coordSystem.mathToScreen(projection.x, projection.y);
    const dropLength = Math.hypot(from.x - to.x, from.y - to.y);
    if (dropLength < 1) return; // source already lies on the line

    const ctx = this.ctx;
    const { parallelogram } = this.styleConstants;
    ctx.save();
    ctx.strokeStyle = source.color;
    ctx.globalAlpha = parallelogram.opacity;
    ctx.lineWidth = parallelogram.lineWidth;
    ctx.setLineDash(parallelogram.dashPattern);
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();

    // Right-angle mark: unit vectors along the drop and back toward the origin
    const origin = this.coordSystem.mathToScreen(0, 0);
    const alongLength = Math.hypot(origin.x - to.x, origin.y - to.y);
    if (alongLength >= 1) {
      const size = Math.min(10, dropLength / 2, alongLength / 2);
      const ux = (from.x - to.x) / dropLength;
      const uy = (from.y - to.y) / dropLength;
      const vx = (origin.x - to.x) / alongLength;
      const vy = (origin.y - to.y) / alongLength;
      ctx.setLineDash([]);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(to.x + ux * size, to.y + uy * size);
      ctx.lineTo(to.x + (ux + vx) * size, to.y + (uy + vy) * size);
      ctx.lineTo(to.x + vx * size, to.y + vy * size);
      ctx.stroke();
    }
    ctx.restore();
  }

  /**
   * Draw an angle arc between two vectors at the origin
   * @param {Vector} vector1 - First vector
   * @param {Vector} vector2 - Second vector
   * @param {number} angleRadians - Angle in radians
   * @param {number} angleDegrees - Angle in degrees for label
   */
  drawAngleArc(vector1, vector2, angleRadians, angleDegrees) {
    const origin = this.mathToScreen(0, 0);

    // Calculate arc radius (60 pixels or 20% of smaller vector, whichever is smaller)
    const mag1 = vector1.magnitude() * this.coordSystem.getScale();
    const mag2 = vector2.magnitude() * this.coordSystem.getScale();
    const maxRadius = 60;
    const minRadius = 30;
    const arcRadius = Math.min(maxRadius, Math.max(minRadius, Math.min(mag1, mag2) * 0.4));

    // Get angles for both vectors (in screen coordinates, y is inverted)
    const angle1 = Math.atan2(-vector1.y, vector1.x);  // Negative y because screen y is inverted
    const angle2 = Math.atan2(-vector2.y, vector2.x);

    // Determine start and end angles (ensure we draw the smaller arc)
    let startAngle = angle1;
    let endAngle = angle2;

    // Normalize angles to 0-2π range
    if (startAngle < 0) startAngle += Math.PI * 2;
    if (endAngle < 0) endAngle += Math.PI * 2;

    // Swap if needed to draw counterclockwise from smaller to larger
    if (startAngle > endAngle) {
      [startAngle, endAngle] = [endAngle, startAngle];
    }

    // If the arc would be > 180°, draw the other way
    if (endAngle - startAngle > Math.PI) {
      [startAngle, endAngle] = [endAngle, startAngle];
    }

    this.ctx.save();

    // Draw filled arc sector
    this.ctx.beginPath();
    this.ctx.moveTo(origin.x, origin.y);
    this.ctx.arc(origin.x, origin.y, arcRadius, startAngle, endAngle);
    this.ctx.closePath();

    // Fill with semi-transparent purple/amber color
    this.ctx.fillStyle = 'rgba(168, 85, 247, 0.2)';  // Purple with 20% opacity
    this.ctx.fill();

    // Draw arc outline for better visibility
    this.ctx.beginPath();
    this.ctx.arc(origin.x, origin.y, arcRadius, startAngle, endAngle);
    this.ctx.strokeStyle = 'rgba(168, 85, 247, 0.6)';  // Purple with 60% opacity
    this.ctx.lineWidth = 2;
    this.ctx.stroke();

    // Draw angle label at midpoint of arc
    const midAngle = (startAngle + endAngle) / 2;
    const labelRadius = arcRadius * 0.6;  // Place label at 60% of arc radius
    const labelX = origin.x + labelRadius * Math.cos(midAngle);
    const labelY = origin.y + labelRadius * Math.sin(midAngle);

    this.ctx.font = '600 13px "Work Sans", system-ui, sans-serif';
    this.ctx.fillStyle = 'rgb(147, 51, 234)';  // Darker purple for text
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';
    this.ctx.fillText(`${angleDegrees.toFixed(1)}°`, labelX, labelY);

    this.ctx.restore();
  }
}

