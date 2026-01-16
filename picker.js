// Element picker state
let pickerActive = false;
let extensionActive = false;
let currentElement = null;
let pickerLayer = null;
let overlay = null;
let tooltip = null;
let toolbar = null;
let pinnedTooltips = [];
let draggedTooltip = null;
let dragOffset = { x: 0, y: 0 };

// Toolbar drag state
let draggingToolbar = false;
let toolbarDragOffset = 0;

// Highlight elements
let elementHighlight = null;
let tooltipHighlight = null;
let renderLoopId = null;
let linesSvg = null;

// Current highlighted pair
let highlightedElement = null;
let highlightedTooltip = null;

// Map elements to their tooltips (WeakMap so elements can be garbage collected)
const elementToTooltip = new WeakMap();

// Highlight color
const HIGHLIGHT_COLOR = '#4ade80';
const PICKER_COLOR = '#4A90E2';
const LINE_COLOR = '#555';

// Create the main picker layer (contains everything)
function createPickerLayer() {
  if (pickerLayer) return;

  pickerLayer = document.createElement('div');
  pickerLayer.id = 'ext-picker-layer';
  pickerLayer.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    overflow: hidden;
    pointer-events: none;
    z-index: 2147483647;
  `;

  // Create overlay div (blue highlight on hover)
  overlay = document.createElement('div');
  overlay.id = 'ext-element-picker-overlay';
  overlay.style.cssText = `
    position: fixed;
    pointer-events: none;
    background: rgba(74, 144, 226, 0.3);
    border: 2px solid #4A90E2;
    box-sizing: border-box;
    display: none;
  `;

  // Create hover tooltip
  tooltip = document.createElement('div');
  tooltip.id = 'ext-element-picker-tooltip';
  tooltip.className = 'ext-picker-tooltip';
  tooltip.style.position = 'fixed';

  // Create highlight rectangles - use outline so it renders outside the element
  elementHighlight = document.createElement('div');
  elementHighlight.className = 'ext-highlight-rect';
  elementHighlight.style.cssText = `
    position: fixed;
    outline: 2px solid ${HIGHLIGHT_COLOR};
    pointer-events: none;
    display: none;
  `;

  tooltipHighlight = document.createElement('div');
  tooltipHighlight.className = 'ext-highlight-rect';
  tooltipHighlight.style.cssText = `
    position: fixed;
    outline: 2px solid ${HIGHLIGHT_COLOR};
    pointer-events: none;
    display: none;
  `;

  // Create SVG for connection lines
  linesSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  linesSvg.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    overflow: visible;
  `;

  // Add highlights first, then overlay and tooltip on top
  pickerLayer.appendChild(linesSvg);
  pickerLayer.appendChild(elementHighlight);
  pickerLayer.appendChild(tooltipHighlight);
  // Overlay and tooltip render on top of highlights
  pickerLayer.appendChild(overlay);
  pickerLayer.appendChild(tooltip);

  // Create toolbar
  toolbar = document.createElement('div');
  toolbar.id = 'ext-picker-toolbar';
  toolbar.className = 'ext-picker-toolbar';
  toolbar.style.pointerEvents = 'auto';
  toolbar.innerHTML = `
    <div class="ext-toolbar-handle" title="Drag to move">
      <svg width="6" height="14" viewBox="0 0 6 14" fill="currentColor">
        <circle cx="1.5" cy="2" r="1.2"/><circle cx="4.5" cy="2" r="1.2"/>
        <circle cx="1.5" cy="7" r="1.2"/><circle cx="4.5" cy="7" r="1.2"/>
        <circle cx="1.5" cy="12" r="1.2"/><circle cx="4.5" cy="12" r="1.2"/>
      </svg>
    </div>
    <span class="ext-toolbar-title">Element Picker</span>
    <div class="ext-toolbar-separator"></div>
    <button class="ext-toolbar-icon-btn ext-toolbar-pick active" title="Select element (toggle)">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
        <path d="M3 2l8 6-3.5 1L6 12.5 3 2z"/>
        <path d="M6.5 9.5l3 3"/>
      </svg>
    </button>
    <div class="ext-toolbar-separator"></div>
    <button class="ext-toolbar-icon-btn ext-toolbar-clear" title="Clear all (C)">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
        <path d="M3 4h10M6 4V3h4v1M4 4v9a1 1 0 001 1h6a1 1 0 001-1V4"/>
      </svg>
    </button>
    <button class="ext-toolbar-icon-btn ext-toolbar-close" title="Exit (Esc)">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
        <path d="M4 4l8 8M12 4l-8 8"/>
      </svg>
    </button>
  `;
  pickerLayer.appendChild(toolbar);

  // Setup toolbar events
  setupToolbarEvents();

  document.documentElement.appendChild(pickerLayer);
}

// Setup toolbar event listeners
function setupToolbarEvents() {
  if (!toolbar) return;

  // Handle drag
  const handle = toolbar.querySelector('.ext-toolbar-handle');
  if (handle) {
    handle.addEventListener('mousedown', startToolbarDrag);
  }

  // Picker toggle
  const pickBtn = toolbar.querySelector('.ext-toolbar-pick');
  if (pickBtn) {
    pickBtn.addEventListener('click', () => {
      if (pickBtn.classList.contains('active')) {
        pickBtn.classList.remove('active');
        disablePickerMode();
      } else {
        pickBtn.classList.add('active');
        enablePickerMode();
      }
    });
  }

  // Clear button
  const clearBtn = toolbar.querySelector('.ext-toolbar-clear');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      clearPinnedTooltips();
    });
  }

  // Close button
  const closeBtn = toolbar.querySelector('.ext-toolbar-close');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      deactivateExtension();
    });
  }
}

// Toolbar drag functions
function startToolbarDrag(e) {
  e.preventDefault();
  draggingToolbar = true;
  const rect = toolbar.getBoundingClientRect();
  toolbarDragOffset = e.clientX - rect.left;
  document.addEventListener('mousemove', onToolbarDrag, true);
  document.addEventListener('mouseup', stopToolbarDrag, true);
}

function onToolbarDrag(e) {
  if (!draggingToolbar || !toolbar) return;
  e.preventDefault();
  const x = e.clientX - toolbarDragOffset;
  const maxX = window.innerWidth - toolbar.offsetWidth;
  toolbar.style.left = Math.max(0, Math.min(x, maxX)) + 'px';
  toolbar.style.transform = 'none';
}

function stopToolbarDrag() {
  draggingToolbar = false;
  document.removeEventListener('mousemove', onToolbarDrag, true);
  document.removeEventListener('mouseup', stopToolbarDrag, true);
}

// Update toolbar toggle state
function updateToolbarToggle(active) {
  if (!toolbar) return;
  const pickBtn = toolbar.querySelector('.ext-toolbar-pick');
  if (pickBtn) {
    if (active) {
      pickBtn.classList.add('active');
    } else {
      pickBtn.classList.remove('active');
    }
  }
}

// Remove picker layer
function removePickerLayer() {
  if (pickerLayer) {
    pickerLayer.remove();
    pickerLayer = null;
    overlay = null;
    tooltip = null;
    toolbar = null;
    elementHighlight = null;
    tooltipHighlight = null;
    linesSvg = null;
  }
  pinnedTooltips = [];
  stopRenderLoop();
}

// Create a connection line for a tooltip
function createTooltipLine(tooltipEl) {
  if (!linesSvg) return null;
  const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  line.setAttribute('stroke', LINE_COLOR);
  line.setAttribute('stroke-width', '2');
  linesSvg.appendChild(line);
  return line;
}

// Get edge points for a rectangle (corners + centers of each edge)
function getEdgePoints(rect) {
  return [
    // Corners
    { x: rect.left, y: rect.top },                       // top-left
    { x: rect.right, y: rect.top },                      // top-right
    { x: rect.right, y: rect.bottom },                   // bottom-right
    { x: rect.left, y: rect.bottom },                    // bottom-left
    // Edge centers
    { x: rect.left + rect.width / 2, y: rect.top },      // top center
    { x: rect.right, y: rect.top + rect.height / 2 },    // right center
    { x: rect.left + rect.width / 2, y: rect.bottom },   // bottom center
    { x: rect.left, y: rect.top + rect.height / 2 },     // left center
  ];
}

// Calculate distance between two points
function pointDistance(p1, p2) {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  return dx * dx + dy * dy; // squared distance is fine for comparison
}

// Update connection line position
function updateTooltipLine(tooltipEl) {
  const line = tooltipEl._connectionLine;
  const element = tooltipEl._targetElement;
  if (!line || !element) return;

  const tooltipRect = tooltipEl.getBoundingClientRect();
  const elementRect = element.getBoundingClientRect();

  // Get edge points for both rectangles
  const tooltipPoints = getEdgePoints(tooltipRect);
  const elementPoints = getEdgePoints(elementRect);

  // Find the closest pair of edge points
  let minDist = Infinity;
  let bestTooltipPoint = tooltipPoints[0];
  let bestElementPoint = elementPoints[0];

  for (const tp of tooltipPoints) {
    for (const ep of elementPoints) {
      const dist = pointDistance(tp, ep);
      if (dist < minDist) {
        minDist = dist;
        bestTooltipPoint = tp;
        bestElementPoint = ep;
      }
    }
  }

  line.setAttribute('x1', bestTooltipPoint.x);
  line.setAttribute('y1', bestTooltipPoint.y);
  line.setAttribute('x2', bestElementPoint.x);
  line.setAttribute('y2', bestElementPoint.y);
}

// Remove connection line
function removeTooltipLine(tooltipEl) {
  if (tooltipEl._connectionLine) {
    tooltipEl._connectionLine.remove();
    tooltipEl._connectionLine = null;
  }
}

// Activate extension (show toolbar, start picker mode)
function activateExtension() {
  if (extensionActive) return;
  extensionActive = true;
  createPickerLayer();
  enablePickerMode();
}

// Deactivate extension (close everything)
function deactivateExtension() {
  if (!extensionActive) return;
  extensionActive = false;
  disablePickerMode();
  clearPinnedTooltips();
  removePickerLayer();
  // Clear all state
  highlightedElement = null;
  highlightedTooltip = null;
  currentHighlightedTooltip = null;
  currentHighlightedElement = null;
  // Clean up any in-progress drags
  if (draggedTooltip) {
    document.removeEventListener('mousemove', onDrag, true);
    document.removeEventListener('mouseup', stopDrag, true);
    draggedTooltip = null;
  }
  if (draggingToolbar) {
    document.removeEventListener('mousemove', onToolbarDrag, true);
    document.removeEventListener('mouseup', stopToolbarDrag, true);
    draggingToolbar = false;
  }
}

// Enable picker mode (allow picking new elements)
function enablePickerMode() {
  if (pickerActive) return;
  pickerActive = true;
  document.body.style.cursor = 'crosshair';
  updateToolbarToggle(true);

  // Add event listeners
  document.addEventListener('mousemove', handleMouseMove, true);
  document.addEventListener('click', handleClick, true);
  document.addEventListener('keydown', handleKeyDown, true);
  document.addEventListener('contextmenu', handleContextMenu, true);
}

// Disable picker mode (keep tooltips but stop picking)
function disablePickerMode() {
  if (!pickerActive) return;
  pickerActive = false;
  document.body.style.cursor = '';
  currentElement = null;
  updateToolbarToggle(false);

  // Hide overlay and tooltip
  if (overlay) overlay.style.display = 'none';
  if (tooltip) tooltip.style.display = 'none';

  // Clear any highlights from hovering
  unhighlightPair(currentHighlightedTooltip, currentHighlightedElement);
  currentHighlightedTooltip = null;
  currentHighlightedElement = null;

  // Remove event listeners
  document.removeEventListener('mousemove', handleMouseMove, true);
  document.removeEventListener('click', handleClick, true);
  document.removeEventListener('keydown', handleKeyDown, true);
  document.removeEventListener('contextmenu', handleContextMenu, true);
}

// Clear all pinned tooltips
function clearPinnedTooltips() {
  pinnedTooltips.forEach(t => {
    const el = t._targetElement;
    if (el) {
      elementToTooltip.delete(el);
    }
    removeTooltipLine(t);
    t.remove();
  });
  pinnedTooltips = [];
  unhighlightPair(null, null);
  stopRenderLoop();
}

// Update highlight rectangle position
function updateHighlightRect(rect, element) {
  if (!rect || !element) return;
  const bounds = element.getBoundingClientRect();
  rect.style.left = bounds.left + 'px';
  rect.style.top = bounds.top + 'px';
  rect.style.width = bounds.width + 'px';
  rect.style.height = bounds.height + 'px';
  rect.style.display = 'block';
}

// Hide highlight rectangle
function hideHighlightRect(rect) {
  if (rect) rect.style.display = 'none';
}

// Highlight both tooltip and element together
function highlightPair(tooltipEl, element) {
  // Ensure layer exists
  if (!pickerLayer) createPickerLayer();

  // Change line to highlight color
  if (tooltipEl._connectionLine) {
    tooltipEl._connectionLine.setAttribute('stroke', HIGHLIGHT_COLOR);
  }

  highlightedElement = element;
  highlightedTooltip = tooltipEl;
  startRenderLoop();
}

// Remove highlight from both
function unhighlightPair(tooltipEl, element) {
  // Change line back to dark
  if (tooltipEl && tooltipEl._connectionLine) {
    tooltipEl._connectionLine.setAttribute('stroke', LINE_COLOR);
  }

  highlightedElement = null;
  highlightedTooltip = null;
  hideHighlightRect(elementHighlight);
  hideHighlightRect(tooltipHighlight);

  // Stop render loop if no pinned tooltips need updating
  if (pinnedTooltips.length === 0) {
    stopRenderLoop();
  }
}

// Render loop - constantly update highlights and tooltip data
function renderLoop() {
  // Stop if extension not active or nothing to update
  if (!extensionActive || (pinnedTooltips.length === 0 && !highlightedElement && !highlightedTooltip)) {
    stopRenderLoop();
    return;
  }

  // Update highlight positions
  if (highlightedElement && elementHighlight) {
    updateHighlightRect(elementHighlight, highlightedElement);
  } else {
    hideHighlightRect(elementHighlight);
  }

  if (highlightedTooltip && tooltipHighlight) {
    updateHighlightRect(tooltipHighlight, highlightedTooltip);
  } else {
    hideHighlightRect(tooltipHighlight);
  }

  // Update all pinned tooltips with fresh data
  for (const pinnedTooltip of pinnedTooltips) {
    const element = pinnedTooltip._targetElement;
    if (element && document.body.contains(element)) {
      const selector = getElementSelector(element);
      const declaredStyles = getDeclaredStyles(element);
      const keyStyles = getKeyComputedStyles(element);
      const textContent = getTextContent(element);
      const newContent = buildTooltipContent(selector, declaredStyles, keyStyles, textContent, true);

      // Only update if content changed to avoid flicker
      if (pinnedTooltip._lastContent !== newContent) {
        pinnedTooltip.innerHTML = newContent;
        pinnedTooltip._lastContent = newContent;
        setupPinnedTooltipEvents(pinnedTooltip, element);
        setupTooltipDrag(pinnedTooltip);
      }

      // Update connection line
      updateTooltipLine(pinnedTooltip);
    }
  }

  renderLoopId = requestAnimationFrame(renderLoop);
}

// Start render loop
function startRenderLoop() {
  if (!renderLoopId) {
    renderLoopId = requestAnimationFrame(renderLoop);
  }
}

// Stop render loop
function stopRenderLoop() {
  if (renderLoopId) {
    cancelAnimationFrame(renderLoopId);
    renderLoopId = null;
  }
}

// Legacy functions for compatibility
function highlightTooltip(tooltipEl) {
  highlightPair(tooltipEl, null);
}

function unhighlightTooltip(tooltipEl) {
  unhighlightPair(tooltipEl, null);
}

// Find tooltip for element
function getTooltipForElement(element) {
  return elementToTooltip.get(element);
}

// Check if position overlaps with existing tooltips
function findNonOverlappingPosition(x, y, width, height) {
  let newX = x;
  let newY = y;
  let attempts = 0;
  const maxAttempts = 10;

  while (attempts < maxAttempts) {
    let hasOverlap = false;

    for (const existingTooltip of pinnedTooltips) {
      const rect = existingTooltip.getBoundingClientRect();

      // Check for overlap
      if (newX < rect.right &&
        newX + width > rect.left &&
        newY < rect.bottom &&
        newY + height > rect.top) {
        hasOverlap = true;
        // Move below the overlapping tooltip
        newY = rect.bottom + 10;
        break;
      }
    }

    if (!hasOverlap) break;
    attempts++;
  }

  return { x: newX, y: newY };
}

// Get element selector string
function getElementSelector(element) {
  if (element.id) {
    return `#${element.id}`;
  }

  let selector = element.tagName.toLowerCase();

  if (element.className && typeof element.className === 'string') {
    const classes = element.className.trim().split(/\s+/).filter(c => c);
    if (classes.length > 0) {
      selector += '.' + classes.slice(0, 2).join('.');
    }
  }

  return selector;
}

// Check if a property is a color property
function isColorProperty(prop) {
  return prop.includes('color') ||
         prop === 'background' ||
         prop === 'border' ||
         prop.startsWith('border-') && prop.endsWith('-color') ||
         prop === 'outline' ||
         prop === 'text-decoration' ||
         prop === 'caret' ||
         prop === 'fill' ||
         prop === 'stroke';
}

// Check if a value looks like a color
function isColorValue(value) {
  if (!value || typeof value !== 'string') return false;
  const v = value.trim().toLowerCase();
  return v.startsWith('#') ||
         v.startsWith('rgb') ||
         v.startsWith('hsl') ||
         v.startsWith('oklch') ||
         v.startsWith('oklab') ||
         v.startsWith('lab') ||
         v.startsWith('lch');
}

// Get declared values from stylesheets and inline styles
function getDeclaredStyles(element) {
  const declared = {};

  // Recursively process CSS rules (handles @media, @supports, @layer, etc.)
  function processRules(rules) {
    if (!rules) return;

    for (const rule of rules) {
      try {
        if (rule.type === CSSRule.STYLE_RULE) {
          // Regular style rule
          if (element.matches(rule.selectorText)) {
            const style = rule.style;
            for (let i = 0; i < style.length; i++) {
              const prop = style[i];
              const value = style.getPropertyValue(prop);
              const priority = style.getPropertyPriority(prop);
              // Mark property as declared (value may be empty for shorthand-expanded props)
              declared[prop] = { value: value, priority: priority };
            }
          }
        } else if (rule.cssRules) {
          // Grouping rule (@media, @supports, @layer, etc.) - recurse into it
          processRules(rule.cssRules);
        }
      } catch (e) {
        // Skip invalid selectors or inaccessible rules
      }
    }
  }

  // Get styles from matching CSS rules
  try {
    for (const sheet of document.styleSheets) {
      try {
        processRules(sheet.cssRules || sheet.rules);
      } catch (e) {
        // Skip cross-origin stylesheets
      }
    }
  } catch (e) {
    // Ignore stylesheet access errors
  }

  // Inline styles override stylesheet styles
  if (element.style.cssText) {
    for (let i = 0; i < element.style.length; i++) {
      const prop = element.style[i];
      const value = element.style.getPropertyValue(prop);
      const priority = element.style.getPropertyPriority(prop);
      declared[prop] = { value: value, priority: priority };
    }
  }

  // Filter out initial values and convert colors
  const computed = window.getComputedStyle(element);
  const temp = document.createElement('div');
  temp.style.all = 'initial';
  document.body.appendChild(temp);
  const initial = window.getComputedStyle(temp);

  const result = {};
  for (const [prop, declaredInfo] of Object.entries(declared)) {
    // Skip if computed value equals initial value
    const computedValue = computed.getPropertyValue(prop);
    const initialValue = initial.getPropertyValue(prop);
    if (computedValue === initialValue) continue;

    // Use declared value if present, otherwise use computed value (for shorthand-expanded props)
    let displayValue = declaredInfo.value && declaredInfo.value.trim() ? declaredInfo.value : computedValue;
    if (declaredInfo.priority) {
      displayValue = `${displayValue} !important`;
    }

    // Check if value contains var() - show var() but tooltip shows computed
    const hasVar = displayValue && displayValue.includes('var(');

    // Convert colors to object format with hex
    if (isColorProperty(prop) || isColorValue(displayValue)) {
      // Use computed value to get resolved color
      const rawColor = computedValue;
      if (rawColor && rawColor !== 'transparent' && rawColor !== 'rgba(0, 0, 0, 0)') {
        result[prop] = { value: rgbToHex(rawColor), raw: rawColor };
        if (hasVar) {
          result[prop].value = displayValue;
          result[prop].computed = rgbToHex(rawColor);
        }
      } else {
        result[prop] = hasVar ? { value: displayValue, computed: computedValue } : displayValue;
      }
    } else {
      // For non-color properties with var(), convert computed if it looks like a color
      const computedForTooltip = isColorValue(computedValue) ? rgbToHex(computedValue) : computedValue;
      result[prop] = hasVar ? { value: displayValue, computed: computedForTooltip } : displayValue;
    }
  }

  temp.remove();

  // Collapse longhand properties into shorthands
  return collapseToShorthands(result);
}

// Collapse longhand CSS properties into shorthands where possible
function collapseToShorthands(styles) {
  const result = { ...styles };

  // Helper to get string value from style (handles color objects)
  function getVal(prop) {
    const v = result[prop];
    if (!v) return null;
    if (typeof v === 'object' && v.value) return v.value;
    return v;
  }

  // Helper to check if all values are equal
  function allEqual(...vals) {
    const filtered = vals.filter(v => v != null);
    if (filtered.length === 0) return false;
    return filtered.every(v => v === filtered[0]);
  }

  // Helper to remove props from result
  function removeProps(...props) {
    props.forEach(p => delete result[p]);
  }

  // Collapse margin
  const mt = getVal('margin-top'), mr = getVal('margin-right'),
        mb = getVal('margin-bottom'), ml = getVal('margin-left');
  if (mt && mr && mb && ml) {
    if (allEqual(mt, mr, mb, ml)) {
      result['margin'] = mt;
    } else if (mt === mb && mr === ml) {
      result['margin'] = `${mt} ${mr}`;
    } else if (mr === ml) {
      result['margin'] = `${mt} ${mr} ${mb}`;
    } else {
      result['margin'] = `${mt} ${mr} ${mb} ${ml}`;
    }
    removeProps('margin-top', 'margin-right', 'margin-bottom', 'margin-left');
  }

  // Collapse padding
  const pt = getVal('padding-top'), pr = getVal('padding-right'),
        pb = getVal('padding-bottom'), pl = getVal('padding-left');
  if (pt && pr && pb && pl) {
    if (allEqual(pt, pr, pb, pl)) {
      result['padding'] = pt;
    } else if (pt === pb && pr === pl) {
      result['padding'] = `${pt} ${pr}`;
    } else if (pr === pl) {
      result['padding'] = `${pt} ${pr} ${pb}`;
    } else {
      result['padding'] = `${pt} ${pr} ${pb} ${pl}`;
    }
    removeProps('padding-top', 'padding-right', 'padding-bottom', 'padding-left');
  }

  // Collapse border (if all sides are the same)
  const btw = getVal('border-top-width'), bts = getVal('border-top-style'), btc = result['border-top-color'];
  const brw = getVal('border-right-width'), brs = getVal('border-right-style'), brc = result['border-right-color'];
  const bbw = getVal('border-bottom-width'), bbs = getVal('border-bottom-style'), bbc = result['border-bottom-color'];
  const blw = getVal('border-left-width'), bls = getVal('border-left-style'), blc = result['border-left-color'];

  const btcVal = typeof btc === 'object' ? btc.value : btc;
  const brcVal = typeof brc === 'object' ? brc.value : brc;
  const bbcVal = typeof bbc === 'object' ? bbc.value : bbc;
  const blcVal = typeof blc === 'object' ? blc.value : blc;

  if (btw && bts && btcVal &&
      allEqual(btw, brw, bbw, blw) &&
      allEqual(bts, brs, bbs, bls) &&
      allEqual(btcVal, brcVal, bbcVal, blcVal)) {
    // All borders are the same - collapse to single border
    if (typeof btc === 'object' && btc.raw) {
      result['border'] = { prefix: `${btw} ${bts}`, value: btcVal, raw: btc.raw };
    } else {
      result['border'] = `${btw} ${bts} ${btcVal}`;
    }
    removeProps('border-top-width', 'border-top-style', 'border-top-color',
                'border-right-width', 'border-right-style', 'border-right-color',
                'border-bottom-width', 'border-bottom-style', 'border-bottom-color',
                'border-left-width', 'border-left-style', 'border-left-color');
  }

  // Collapse border-radius
  const rtl = getVal('border-top-left-radius'), rtr = getVal('border-top-right-radius'),
        rbr = getVal('border-bottom-right-radius'), rbl = getVal('border-bottom-left-radius');
  if (rtl && rtr && rbr && rbl) {
    if (allEqual(rtl, rtr, rbr, rbl)) {
      result['border-radius'] = rtl;
    } else if (rtl === rbr && rtr === rbl) {
      result['border-radius'] = `${rtl} ${rtr}`;
    } else if (rtr === rbl) {
      result['border-radius'] = `${rtl} ${rtr} ${rbr}`;
    } else {
      result['border-radius'] = `${rtl} ${rtr} ${rbr} ${rbl}`;
    }
    removeProps('border-top-left-radius', 'border-top-right-radius',
                'border-bottom-right-radius', 'border-bottom-left-radius');
  }

  // Collapse grid-column (start / end)
  const gcs = getVal('grid-column-start'), gce = getVal('grid-column-end');
  if (gcs && gce) {
    if (gce === 'auto') {
      result['grid-column'] = gcs;
    } else {
      result['grid-column'] = `${gcs} / ${gce}`;
    }
    removeProps('grid-column-start', 'grid-column-end');
  } else if (gcs) {
    result['grid-column'] = gcs;
    removeProps('grid-column-start');
  }

  // Collapse grid-row (start / end)
  const grs = getVal('grid-row-start'), gre = getVal('grid-row-end');
  if (grs && gre) {
    if (gre === 'auto') {
      result['grid-row'] = grs;
    } else {
      result['grid-row'] = `${grs} / ${gre}`;
    }
    removeProps('grid-row-start', 'grid-row-end');
  } else if (grs) {
    result['grid-row'] = grs;
    removeProps('grid-row-start');
  }

  return result;
}

// Pin tooltip at current position
function pinTooltip(element) {
  if (!tooltip || !pickerLayer) return;

  // Check if element already has a tooltip - do nothing
  const existingTooltip = getTooltipForElement(element);
  if (existingTooltip) {
    return;
  }

  const rect = element.getBoundingClientRect();
  const selector = getElementSelector(element);

  // Clone the tooltip for pinning
  const pinnedTooltip = document.createElement('div');
  pinnedTooltip.className = 'ext-picker-tooltip ext-picker-tooltip-pinned';
  pinnedTooltip.style.position = 'fixed';
  pinnedTooltip.style.pointerEvents = 'auto';

  let tooltipX = rect.left;
  let tooltipY = rect.bottom + 5;

  // If tooltip would go off bottom of viewport, position above element
  if (rect.bottom + 200 > window.innerHeight) {
    tooltipY = rect.top - 200;
    if (tooltipY < 0) {
      tooltipY = 5;
    }
  }

  // Estimate tooltip size and find non-overlapping position
  const estimatedWidth = 300;
  const estimatedHeight = 250;
  const adjustedPos = findNonOverlappingPosition(tooltipX, tooltipY, estimatedWidth, estimatedHeight);
  tooltipX = adjustedPos.x;
  tooltipY = adjustedPos.y;

  pinnedTooltip.style.left = tooltipX + 'px';
  pinnedTooltip.style.top = tooltipY + 'px';

  // Store reference to target element
  pinnedTooltip._targetElement = element;

  // Register element -> tooltip mapping
  elementToTooltip.set(element, pinnedTooltip);

  // Build tooltip content
  const declaredStyles = getDeclaredStyles(element);
  const keyStyles = getKeyComputedStyles(element);
  const textContent = getTextContent(element);

  pinnedTooltip.innerHTML = buildTooltipContent(selector, declaredStyles, keyStyles, textContent, true);

  // Create connection line
  pinnedTooltip._connectionLine = createTooltipLine(pinnedTooltip);

  pickerLayer.appendChild(pinnedTooltip);
  pinnedTooltips.push(pinnedTooltip);

  // Start render loop to keep data updated
  startRenderLoop();

  // Add hover events to highlight both tooltip and element
  pinnedTooltip.addEventListener('mouseenter', () => {
    if (!draggedTooltip) highlightPair(pinnedTooltip, element);
  });
  pinnedTooltip.addEventListener('mouseleave', () => {
    if (!draggedTooltip) unhighlightPair(pinnedTooltip, element);
  });

  // Add event listeners for pinned tooltip
  setupPinnedTooltipEvents(pinnedTooltip, element);
  setupTooltipDrag(pinnedTooltip);

  // Highlight the newly pinned pair
  highlightPair(pinnedTooltip, element);
  currentHighlightedTooltip = pinnedTooltip;
  currentHighlightedElement = element;
}

// Setup drag on tooltip header (avoids duplicate listeners)
function setupTooltipDrag(pinnedTooltip) {
  const header = pinnedTooltip.querySelector('.ext-tooltip-header');
  if (header && !header._dragSetup) {
    header.style.cursor = 'move';
    header._dragSetup = true;
    header.addEventListener('mousedown', (e) => startDrag(e, pinnedTooltip));
  }
}

// Drag functionality
function startDrag(e, tooltipElement) {
  // Only allow dragging from header, not from buttons
  if (e.target.classList.contains('ext-tooltip-btn')) {
    return;
  }

  e.preventDefault();
  e.stopPropagation();

  draggedTooltip = tooltipElement;

  // Highlight this tooltip and its element while dragging
  const element = tooltipElement._targetElement;
  if (element) {
    highlightPair(tooltipElement, element);
  }

  const rect = tooltipElement.getBoundingClientRect();
  dragOffset.x = e.clientX - rect.left;
  dragOffset.y = e.clientY - rect.top;

  document.addEventListener('mousemove', onDrag, true);
  document.addEventListener('mouseup', stopDrag, true);

  tooltipElement.style.opacity = '0.8';
}

function onDrag(e) {
  if (!draggedTooltip) return;

  e.preventDefault();

  const x = e.clientX - dragOffset.x;
  const y = e.clientY - dragOffset.y;

  draggedTooltip.style.left = x + 'px';
  draggedTooltip.style.top = y + 'px';
}

function stopDrag(e) {
  if (draggedTooltip) {
    draggedTooltip.style.opacity = '1';
    draggedTooltip = null;
  }

  document.removeEventListener('mousemove', onDrag, true);
  document.removeEventListener('mouseup', stopDrag, true);
}

// Get text content of element (truncated)
function getTextContent(element) {
  const text = element.textContent?.trim() || '';
  if (!text) return '';
  // Only return if it's direct text, not from children with lots of content
  const directText = Array.from(element.childNodes)
    .filter(node => node.nodeType === Node.TEXT_NODE)
    .map(node => node.textContent.trim())
    .join(' ')
    .trim();
  if (!directText) return '';
  return directText.length > 30 ? directText.substring(0, 30) + '…' : directText;
}

// Format number with decimals only if needed
function formatNum(n) {
  if (Number.isInteger(n)) return n.toString();
  return n.toFixed(1).replace(/\.0$/, '');
}

// Convert RGB/RGBA color to hex
function rgbToHex(color) {
  if (!color) return null;

  // Already hex
  if (color.startsWith('#')) return color;

  // Parse rgb/rgba
  const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
  if (!match) return color;

  const r = parseInt(match[1]);
  const g = parseInt(match[2]);
  const b = parseInt(match[3]);
  const a = match[4] !== undefined ? parseFloat(match[4]) : 1;

  const hex = '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');

  if (a < 1) {
    return `${hex} (${Math.round(a * 100)}%)`;
  }
  return hex;
}

// Get key computed properties that should always show
function getKeyComputedStyles(element) {
  const computed = window.getComputedStyle(element);
  const styles = {};
  const rect = element.getBoundingClientRect();

  // Width x Height (with decimals if needed)
  styles['size'] = `${formatNum(rect.width)} × ${formatNum(rect.height)}`;

  // Padding (if not zero)
  const padding = computed.padding;
  if (padding && padding !== '0px') {
    styles['padding'] = padding;
  }

  // Margin (if not zero)
  const margin = computed.margin;
  if (margin && margin !== '0px') {
    styles['margin'] = margin;
  }

  // Border (if not zero/none) - show individual sides if different
  const borderTopWidth = computed.borderTopWidth;
  const borderRightWidth = computed.borderRightWidth;
  const borderBottomWidth = computed.borderBottomWidth;
  const borderLeftWidth = computed.borderLeftWidth;

  const hasTopBorder = borderTopWidth && borderTopWidth !== '0px';
  const hasRightBorder = borderRightWidth && borderRightWidth !== '0px';
  const hasBottomBorder = borderBottomWidth && borderBottomWidth !== '0px';
  const hasLeftBorder = borderLeftWidth && borderLeftWidth !== '0px';

  // Helper to format border with hex color
  function formatBorder(width, style, color) {
    const hexColor = rgbToHex(color);
    return { prefix: `${width} ${style}`, value: hexColor, raw: color };
  }

  if (hasTopBorder || hasRightBorder || hasBottomBorder || hasLeftBorder) {
    const topStyle = computed.borderTopStyle;
    const rightStyle = computed.borderRightStyle;
    const bottomStyle = computed.borderBottomStyle;
    const leftStyle = computed.borderLeftStyle;
    const topColor = computed.borderTopColor;
    const rightColor = computed.borderRightColor;
    const bottomColor = computed.borderBottomColor;
    const leftColor = computed.borderLeftColor;

    // Check if all borders are the same
    const allSame = borderTopWidth === borderRightWidth &&
                    borderRightWidth === borderBottomWidth &&
                    borderBottomWidth === borderLeftWidth &&
                    topStyle === rightStyle &&
                    rightStyle === bottomStyle &&
                    bottomStyle === leftStyle &&
                    topColor === rightColor &&
                    rightColor === bottomColor &&
                    bottomColor === leftColor;

    if (allSame && hasTopBorder) {
      styles['border'] = formatBorder(borderTopWidth, topStyle, topColor);
    } else {
      if (hasTopBorder) styles['border-top'] = formatBorder(borderTopWidth, topStyle, topColor);
      if (hasRightBorder) styles['border-right'] = formatBorder(borderRightWidth, rightStyle, rightColor);
      if (hasBottomBorder) styles['border-bottom'] = formatBorder(borderBottomWidth, bottomStyle, bottomColor);
      if (hasLeftBorder) styles['border-left'] = formatBorder(borderLeftWidth, leftStyle, leftColor);
    }
  }

  // Color (as hex)
  const color = computed.color;
  if (color) {
    styles['color'] = { value: rgbToHex(color), raw: color };
  }

  // Background (as hex if color)
  const bgColor = computed.backgroundColor;
  const bgImage = computed.backgroundImage;
  if (bgColor && bgColor !== 'rgba(0, 0, 0, 0)' && bgColor !== 'transparent') {
    styles['background'] = { value: rgbToHex(bgColor), raw: bgColor };
  } else if (bgImage && bgImage !== 'none') {
    styles['background'] = bgImage;
  }

  return styles;
}

function buildTooltipContent(selector, declaredStyles, keyStyles, textContent, isPinned) {
  const declaredCount = Object.keys(declaredStyles).length;

  let html = `<div class="ext-tooltip-header"><span class="ext-tooltip-selector">${escapeHtml(selector)}</span>`;
  html += `<button class="ext-tooltip-btn ext-tooltip-close${isPinned ? '' : ' ext-tooltip-close-hidden'}" title="Close">×</button>`;
  html += `</div><div class="ext-tooltip-styles">`;

  // Show text content as first item in computed group
  if (textContent) {
    html += `<div class="ext-style-row ext-key-style"><span class="ext-style-prop">content</span>:<span class="ext-style-value">"${escapeHtml(textContent)}"</span></div>`;
  }

  // Always show key computed properties
  html += formatKeyStyles(keyStyles);

  // Then show declared styles
  if (declaredCount > 0) {
    html += `<div class="ext-style-separator"></div>`;
    html += formatSetStyles(declaredStyles);
  }

  html += `</div>`;

  return html;
}

// Escape HTML
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Format key computed styles
function formatKeyStyles(styles) {
  let html = '';
  for (const [prop, value] of Object.entries(styles)) {
    // Check if value is a color object with raw color for square
    if (value && typeof value === 'object' && value.raw) {
      if (value.prefix) {
        // Border-style value: prefix + color square + hex
        html += `<div class="ext-style-row ext-key-style"><span class="ext-style-prop">${escapeHtml(prop)}</span>:<span class="ext-style-value">${escapeHtml(value.prefix)} <span class="ext-color-square" style="background:${value.raw}"></span>${escapeHtml(value.value)}</span></div>`;
      } else {
        // Simple color value: color square + hex
        html += `<div class="ext-style-row ext-key-style"><span class="ext-style-prop">${escapeHtml(prop)}</span>:<span class="ext-color-square" style="background:${value.raw}"></span><span class="ext-style-value">${escapeHtml(value.value)}</span></div>`;
      }
    } else {
      html += `<div class="ext-style-row ext-key-style"><span class="ext-style-prop">${escapeHtml(prop)}</span>:<span class="ext-style-value">${escapeHtml(value)}</span></div>`;
    }
  }
  return html;
}

// Format set/declared styles
function formatSetStyles(styles) {
  let html = '';
  for (const [prop, value] of Object.entries(styles)) {
    if (value && typeof value === 'object') {
      const titleAttr = value.computed ? ` title="${escapeHtml(value.computed)}"` : '';
      if (value.raw) {
        // Color value with square
        html += `<div class="ext-style-row"><span class="ext-style-prop">${escapeHtml(prop)}</span>:<span class="ext-color-square" style="background:${value.raw}"></span><span class="ext-style-value"${titleAttr}>${escapeHtml(value.value)};</span></div>`;
      } else {
        // Value with var() - show computed in title
        html += `<div class="ext-style-row"><span class="ext-style-prop">${escapeHtml(prop)}</span>:<span class="ext-style-value"${titleAttr}>${escapeHtml(value.value)};</span></div>`;
      }
    } else {
      html += `<div class="ext-style-row"><span class="ext-style-prop">${escapeHtml(prop)}</span>:<span class="ext-style-value">${escapeHtml(value)};</span></div>`;
    }
  }
  return html;
}

// Setup event listeners for pinned tooltip
function setupPinnedTooltipEvents(pinnedTooltip, element) {
  // Close button
  const closeBtn = pinnedTooltip.querySelector('.ext-tooltip-close');
  if (closeBtn) {
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      // Clean up element mapping
      const targetEl = pinnedTooltip._targetElement;
      if (targetEl) {
        elementToTooltip.delete(targetEl);
      }
      // Clear highlights if this was highlighted
      if (highlightedTooltip === pinnedTooltip || highlightedElement === targetEl) {
        unhighlightPair(highlightedTooltip, highlightedElement);
      }
      // Remove connection line
      removeTooltipLine(pinnedTooltip);
      pinnedTooltip.remove();
      pinnedTooltips = pinnedTooltips.filter(t => t !== pinnedTooltip);
      // Stop render loop if no more tooltips
      if (pinnedTooltips.length === 0) {
        stopRenderLoop();
      }
    });
  }
}

// Update overlay position and tooltip
function updateOverlay(element) {
  if (!overlay || !tooltip) return;

  const rect = element.getBoundingClientRect();

  // Update overlay (fixed positioning)
  overlay.style.left = rect.left + 'px';
  overlay.style.top = rect.top + 'px';
  overlay.style.width = rect.width + 'px';
  overlay.style.height = rect.height + 'px';
  overlay.style.display = 'block';

  // Update tooltip
  const selector = getElementSelector(element);
  const declaredStyles = getDeclaredStyles(element);
  const keyStyles = getKeyComputedStyles(element);
  const textContent = getTextContent(element);

  let tooltipX = rect.left;
  let tooltipY = rect.bottom + 5;

  // Keep tooltip in viewport
  if (rect.bottom + 200 > window.innerHeight) {
    tooltipY = rect.top - 200;
  }

  tooltip.style.left = tooltipX + 'px';
  tooltip.style.top = tooltipY + 'px';
  tooltip.innerHTML = buildTooltipContent(selector, declaredStyles, keyStyles, textContent, false);
  tooltip.style.display = 'block';
}

// Legacy start/stop functions - now call activate/deactivate
function startPicker() {
  activateExtension();
}

function stopPicker() {
  deactivateExtension();
}

// Track currently highlighted pair (for cleanup)
let currentHighlightedTooltip = null;
let currentHighlightedElement = null;

// Check if element is part of picker UI (works with SVG elements too)
function isPickerUIElement(el) {
  let node = el;
  while (node && node !== document.documentElement) {
    if (node === pickerLayer || node === overlay || node === tooltip || node === toolbar) {
      return true;
    }
    if (node.id === 'ext-picker-layer') {
      return true;
    }
    if (node.classList && (
        node.classList.contains('ext-picker-tooltip') ||
        node.classList.contains('ext-picker-toolbar'))) {
      return true;
    }
    node = node.parentNode || node.parentElement;
  }
  return false;
}

// Handle mouse move
function handleMouseMove(e) {
  if (!pickerActive) return;

  // Don't process while dragging a tooltip or toolbar
  if (draggedTooltip || draggingToolbar) return;

  currentElement = e.target;

  // Don't highlight our own overlay/tooltip/toolbar or any pinned tooltips
  if (isPickerUIElement(currentElement)) {
    // Hide overlay and tooltip when over our own elements
    if (overlay) overlay.style.display = 'none';
    if (tooltip) tooltip.style.display = 'none';
    // Don't clear highlights here - pinned tooltip's own hover events handle that
    return;
  }

  // Check if element already has a tooltip
  const existingTooltip = getTooltipForElement(currentElement);
  if (existingTooltip) {
    // Hide picker overlay/tooltip and highlight both existing tooltip and element
    if (overlay) overlay.style.display = 'none';
    if (tooltip) tooltip.style.display = 'none';

    // Unhighlight previous pair if different
    if (currentHighlightedTooltip && currentHighlightedTooltip !== existingTooltip) {
      unhighlightPair(currentHighlightedTooltip, currentHighlightedElement);
    }

    highlightPair(existingTooltip, currentElement);
    currentHighlightedTooltip = existingTooltip;
    currentHighlightedElement = currentElement;
    e.stopPropagation();
    return;
  }

  // Clear any previously highlighted pair
  if (currentHighlightedTooltip || currentHighlightedElement) {
    unhighlightPair(currentHighlightedTooltip, currentHighlightedElement);
    currentHighlightedTooltip = null;
    currentHighlightedElement = null;
  }

  updateOverlay(currentElement);
  e.stopPropagation();
}

// Handle click - select element
function handleClick(e) {
  if (!pickerActive) return;

  // Don't process clicks on our own elements
  if (isPickerUIElement(e.target)) {
    return;
  }

  e.preventDefault();
  e.stopPropagation();

  const element = currentElement;

  if (element) {
    // Pin the tooltip at current position
    pinTooltip(element);
  }

  // Don't stop picker - let it continue
}

// Handle keyboard events
function handleKeyDown(e) {
  if (!pickerActive) return;

  // Escape key - disable picker mode but keep extension active
  if (e.key === 'Escape') {
    e.preventDefault();
    e.stopPropagation();
    disablePickerMode();
  }
}

// Handle context menu - clear pinned tooltips
function handleContextMenu(e) {
  if (pickerActive) {
    e.preventDefault();
    e.stopPropagation();

    // Clear all pinned tooltips
    clearPinnedTooltips();
  }
}

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'startPicker') {
    activateExtension();
    sendResponse({ success: true });
  }
});

// Allow Ctrl+Shift+C to toggle extension (like DevTools)
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.shiftKey && e.key === 'C') {
    e.preventDefault();
    if (extensionActive) {
      deactivateExtension();
    } else {
      activateExtension();
    }
  }
});
