// Element picker state
let pickerActive = false;
let currentElement = null;
let overlay = null;
let tooltip = null;
let pinnedTooltips = [];
let draggedTooltip = null;
let dragOffset = { x: 0, y: 0 };

// Map elements to their tooltips (WeakMap so elements can be garbage collected)
const elementToTooltip = new WeakMap();

// Create overlay elements
function createOverlay() {
  if (overlay) return;
  
  // Create overlay div
  overlay = document.createElement('div');
  overlay.id = 'ext-element-picker-overlay';
  overlay.style.cssText = `
    position: absolute;
    pointer-events: none;
    z-index: 2147483647;
    background: rgba(74, 144, 226, 0.3);
    border: 2px solid #4A90E2;
    box-sizing: border-box;
  `;
  
  // Create tooltip
  tooltip = document.createElement('div');
  tooltip.id = 'ext-element-picker-tooltip';
  tooltip.className = 'ext-picker-tooltip';
  document.documentElement.appendChild(overlay);
  document.documentElement.appendChild(tooltip);
}

// Remove overlay elements
function removeOverlay() {
  if (overlay) {
    overlay.remove();
    overlay = null;
  }
  if (tooltip) {
    tooltip.remove();
    tooltip = null;
  }
  // Keep pinned tooltips
}

// Clear all pinned tooltips
function clearPinnedTooltips() {
  pinnedTooltips.forEach(t => {
    const el = t._targetElement;
    if (el) {
      elementToTooltip.delete(el);
    }
    t.remove();
  });
  pinnedTooltips = [];
}

// Highlight color
const HIGHLIGHT_COLOR = '#4ade80';

// Highlight both tooltip and element together
function highlightPair(tooltipEl, element) {
  if (tooltipEl) {
    tooltipEl.style.outline = `2px solid ${HIGHLIGHT_COLOR}`;
    tooltipEl.style.outlineOffset = '2px';
  }
  if (element) {
    element._originalOutline = element.style.outline;
    element.style.outline = `2px solid ${HIGHLIGHT_COLOR}`;
  }
}

// Remove highlight from both
function unhighlightPair(tooltipEl, element) {
  if (tooltipEl) {
    tooltipEl.style.outline = '';
    tooltipEl.style.outlineOffset = '';
  }
  if (element) {
    element.style.outline = element._originalOutline || '';
  }
}

// Legacy functions for compatibility
function highlightTooltip(tooltipEl) {
  highlightPair(tooltipEl, null);
}

function unhighlightTooltip(tooltipEl) {
  unhighlightPair(tooltipEl, null);
}

function highlightTargetElement(element) {
  highlightPair(null, element);
}

function unhighlightTargetElement(element) {
  unhighlightPair(null, element);
}

// Find tooltip for element
function getTooltipForElement(element) {
  return elementToTooltip.get(element);
}

// Check if position overlaps with existing tooltips
function findNonOverlappingPosition(x, y, width, height) {
  const scrollX = window.scrollX || window.pageXOffset;
  const scrollY = window.scrollY || window.pageYOffset;

  let newX = x;
  let newY = y;
  let attempts = 0;
  const maxAttempts = 10;

  while (attempts < maxAttempts) {
    let hasOverlap = false;

    for (const existingTooltip of pinnedTooltips) {
      const rect = existingTooltip.getBoundingClientRect();
      const existingX = rect.left + scrollX;
      const existingY = rect.top + scrollY;
      const existingWidth = rect.width;
      const existingHeight = rect.height;

      // Check for overlap
      if (newX < existingX + existingWidth &&
          newX + width > existingX &&
          newY < existingY + existingHeight &&
          newY + height > existingY) {
        hasOverlap = true;
        // Move below the overlapping tooltip
        newY = existingY + existingHeight + 10;
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

// Get declared values from stylesheets and inline styles
function getDeclaredStyles(element) {
  const declared = {};

  // Get styles from matching CSS rules
  try {
    for (const sheet of document.styleSheets) {
      try {
        const rules = sheet.cssRules || sheet.rules;
        if (!rules) continue;

        for (const rule of rules) {
          if (rule.type === CSSRule.STYLE_RULE) {
            try {
              if (element.matches(rule.selectorText)) {
                const style = rule.style;
                for (let i = 0; i < style.length; i++) {
                  const prop = style[i];
                  const value = style.getPropertyValue(prop);
                  const priority = style.getPropertyPriority(prop);
                  declared[prop] = priority ? `${value} !important` : value;
                }
              }
            } catch (e) {
              // Skip invalid selectors
            }
          }
        }
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
      declared[prop] = priority ? `${value} !important` : value;
    }
  }

  return declared;
}

// Pin tooltip at current position
function pinTooltip(element) {
  if (!tooltip) return;

  // Check if element already has a tooltip
  const existingTooltip = getTooltipForElement(element);
  if (existingTooltip) {
    // Highlight existing tooltip instead of creating new one
    highlightTooltip(existingTooltip);
    setTimeout(() => unhighlightTooltip(existingTooltip), 500);
    return;
  }

  const rect = element.getBoundingClientRect();
  const scrollX = window.scrollX || window.pageXOffset;
  const scrollY = window.scrollY || window.pageYOffset;
  const selector = getElementSelector(element);

  // Clone the tooltip for pinning
  const pinnedTooltip = document.createElement('div');
  pinnedTooltip.className = 'ext-picker-tooltip ext-picker-tooltip-pinned';

  let tooltipX = rect.left + scrollX;
  let tooltipY = rect.bottom + scrollY + 5;

  // If tooltip would go off bottom of viewport, position above element
  if (rect.bottom + 200 > window.innerHeight) {
    tooltipY = rect.top + scrollY - 200;
    if (tooltipY < scrollY) {
      tooltipY = scrollY + 5;
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

  document.documentElement.appendChild(pinnedTooltip);
  pinnedTooltips.push(pinnedTooltip);

  // Add hover events to highlight both tooltip and element
  pinnedTooltip.addEventListener('mouseenter', () => {
    highlightPair(pinnedTooltip, element);
  });
  pinnedTooltip.addEventListener('mouseleave', () => {
    unhighlightPair(pinnedTooltip, element);
  });

  // Add event listeners for pinned tooltip
  setupPinnedTooltipEvents(pinnedTooltip, element);

  // Make header draggable
  const header = pinnedTooltip.querySelector('.ext-tooltip-header');
  if (header) {
    header.style.cursor = 'move';
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
  
  const rect = tooltipElement.getBoundingClientRect();
  dragOffset.x = e.clientX - rect.left;
  dragOffset.y = e.clientY - rect.top;
  
  document.addEventListener('mousemove', onDrag);
  document.addEventListener('mouseup', stopDrag);
  
  tooltipElement.style.opacity = '0.8';
}

function onDrag(e) {
  if (!draggedTooltip) return;
  
  e.preventDefault();
  
  const scrollX = window.scrollX || window.pageXOffset;
  const scrollY = window.scrollY || window.pageYOffset;
  
  const x = e.clientX - dragOffset.x + scrollX;
  const y = e.clientY - dragOffset.y + scrollY;
  
  draggedTooltip.style.left = x + 'px';
  draggedTooltip.style.top = y + 'px';
}

function stopDrag(e) {
  if (draggedTooltip) {
    draggedTooltip.style.opacity = '1';
    draggedTooltip = null;
  }
  
  document.removeEventListener('mousemove', onDrag);
  document.removeEventListener('mouseup', stopDrag);
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
  const borderTop = computed.borderTop;
  const borderRight = computed.borderRight;
  const borderBottom = computed.borderBottom;
  const borderLeft = computed.borderLeft;
  const borderTopWidth = computed.borderTopWidth;
  const borderRightWidth = computed.borderRightWidth;
  const borderBottomWidth = computed.borderBottomWidth;
  const borderLeftWidth = computed.borderLeftWidth;

  const hasTopBorder = borderTopWidth && borderTopWidth !== '0px';
  const hasRightBorder = borderRightWidth && borderRightWidth !== '0px';
  const hasBottomBorder = borderBottomWidth && borderBottomWidth !== '0px';
  const hasLeftBorder = borderLeftWidth && borderLeftWidth !== '0px';

  if (hasTopBorder || hasRightBorder || hasBottomBorder || hasLeftBorder) {
    // Check if all borders are the same
    if (borderTop === borderRight && borderRight === borderBottom && borderBottom === borderLeft) {
      styles['border'] = borderTop;
    } else {
      if (hasTopBorder) styles['border-top'] = borderTop;
      if (hasRightBorder) styles['border-right'] = borderRight;
      if (hasBottomBorder) styles['border-bottom'] = borderBottom;
      if (hasLeftBorder) styles['border-left'] = borderLeft;
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
    html += `<div class="ext-style-row ext-key-style"><span class="ext-style-prop">text</span>:<span class="ext-style-value">"${escapeHtml(textContent)}"</span></div>`;
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
      html += `<div class="ext-style-row ext-key-style"><span class="ext-style-prop">${escapeHtml(prop)}</span>:<span class="ext-color-square" style="background:${value.raw}"></span><span class="ext-style-value">${escapeHtml(value.value)}</span></div>`;
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
    html += `<div class="ext-style-row"><span class="ext-style-prop">${escapeHtml(prop)}</span>:<span class="ext-style-value">${escapeHtml(value)};</span></div>`;
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
        unhighlightTargetElement(targetEl);
      }
      pinnedTooltip.remove();
      pinnedTooltips = pinnedTooltips.filter(t => t !== pinnedTooltip);
    });
  }
}

// Rebuild tooltip content after changes
function rebuildTooltipContent(pinnedTooltip, element) {
  const selector = getElementSelector(element);
  const declaredStyles = getDeclaredStyles(element);
  const keyStyles = getKeyComputedStyles(element);
  const textContent = getTextContent(element);

  pinnedTooltip.innerHTML = buildTooltipContent(selector, declaredStyles, keyStyles, textContent, true);
  setupPinnedTooltipEvents(pinnedTooltip, element);

  // Restore draggable header
  const header = pinnedTooltip.querySelector('.ext-tooltip-header');
  if (header) {
    header.style.cursor = 'move';
    header.addEventListener('mousedown', (e) => startDrag(e, pinnedTooltip));
  }
}

// Update overlay position and tooltip
function updateOverlay(element) {
  if (!overlay || !tooltip) return;

  const rect = element.getBoundingClientRect();
  const scrollX = window.scrollX || window.pageXOffset;
  const scrollY = window.scrollY || window.pageYOffset;

  // Update overlay
  overlay.style.left = (rect.left + scrollX) + 'px';
  overlay.style.top = (rect.top + scrollY) + 'px';
  overlay.style.width = rect.width + 'px';
  overlay.style.height = rect.height + 'px';
  overlay.style.display = 'block';

  // Update tooltip
  const selector = getElementSelector(element);
  const declaredStyles = getDeclaredStyles(element);
  const keyStyles = getKeyComputedStyles(element);
  const textContent = getTextContent(element);

  let tooltipX = rect.left + scrollX;
  let tooltipY = rect.bottom + scrollY + 5;

  // Keep tooltip in viewport
  if (rect.bottom + 200 > window.innerHeight) {
    tooltipY = rect.top + scrollY - 200;
  }

  tooltip.style.left = tooltipX + 'px';
  tooltip.style.top = tooltipY + 'px';
  tooltip.innerHTML = buildTooltipContent(selector, declaredStyles, keyStyles, textContent, false);
  tooltip.style.display = 'block';
}

// Start picker mode
function startPicker() {
  if (pickerActive) return;
  
  pickerActive = true;
  createOverlay();
  document.body.style.cursor = 'crosshair';
  
  // Add event listeners
  document.addEventListener('mousemove', handleMouseMove, true);
  document.addEventListener('click', handleClick, true);
  document.addEventListener('keydown', handleKeyDown, true);
  document.addEventListener('contextmenu', handleContextMenu, true);
}

// Stop picker mode
function stopPicker() {
  if (!pickerActive) return;
  
  pickerActive = false;
  removeOverlay();
  document.body.style.cursor = '';
  currentElement = null;
  
  // Remove event listeners
  document.removeEventListener('mousemove', handleMouseMove, true);
  document.removeEventListener('click', handleClick, true);
  document.removeEventListener('keydown', handleKeyDown, true);
  document.removeEventListener('contextmenu', handleContextMenu, true);
}

// Track currently highlighted pair (for cleanup)
let currentHighlightedTooltip = null;
let currentHighlightedElement = null;

// Handle mouse move
function handleMouseMove(e) {
  if (!pickerActive) return;

  currentElement = e.target;

  // Don't highlight our own overlay/tooltip or any pinned tooltips
  if (currentElement === overlay ||
      currentElement === tooltip ||
      overlay?.contains(currentElement) ||
      tooltip?.contains(currentElement) ||
      currentElement.classList?.contains('ext-picker-tooltip') ||
      currentElement.classList?.contains('ext-tooltip-header') ||
      currentElement.classList?.contains('ext-tooltip-search') ||
      currentElement.classList?.contains('ext-tooltip-styles') ||
      currentElement.closest('.ext-picker-tooltip')) {
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

// Handle click - select element and open in DevTools
function handleClick(e) {
  if (!pickerActive) return;
  
  // Don't process clicks on our own elements
  if (e.target === overlay || 
      e.target === tooltip ||
      e.target.classList?.contains('ext-picker-tooltip') ||
      e.target.classList?.contains('ext-tooltip-header') ||
      e.target.classList?.contains('ext-tooltip-search') ||
      e.target.classList?.contains('ext-tooltip-styles') ||
      e.target.closest('.ext-picker-tooltip')) {
    return;
  }
  
  e.preventDefault();
  e.stopPropagation();
  
  const element = currentElement;
  
  if (element) {
    // Pin the tooltip at current position
    pinTooltip(element);
    
    // Store element globally for inspect() access
    window.__SELECTED_ELEMENT__ = element;
    
    // Flash the selected element
    const originalOutline = element.style.outline;
    element.style.outline = '2px solid #FF6B6B';
    
    setTimeout(() => {
      element.style.outline = originalOutline;
    }, 500);
    
    // Send message to devtools page to call inspect()
    chrome.runtime.sendMessage({
      action: 'inspectElement'
    });
  }
  
  // Don't stop picker - let it continue
}

// Handle keyboard events
function handleKeyDown(e) {
  if (!pickerActive) return;
  
  // Escape key - cancel picker
  if (e.key === 'Escape') {
    e.preventDefault();
    e.stopPropagation();
    stopPicker();
  }
}

// Handle context menu - clear pinned tooltips and inspect
function handleContextMenu(e) {
  if (pickerActive) {
    e.preventDefault();
    e.stopPropagation();
    
    // Clear all pinned tooltips
    clearPinnedTooltips();
    
    // Inspect the current element
    if (currentElement) {
      window.__SELECTED_ELEMENT__ = currentElement;
      
      // Send message to devtools page to call inspect()
      chrome.runtime.sendMessage({
        action: 'inspectElement'
      });
    }
  }
}

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'startPicker') {
    startPicker();
    sendResponse({ success: true });
  }
});

// Allow Ctrl+Shift+C to toggle picker (like DevTools)
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.shiftKey && e.key === 'C') {
    e.preventDefault();
    if (pickerActive) {
      stopPicker();
    } else {
      startPicker();
    }
  }
});
