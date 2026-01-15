// Element picker state
let pickerActive = false;
let currentElement = null;
let overlay = null;
let tooltip = null;
let pinnedTooltips = [];
let tooltipStylesVisible = false;
let tooltipSearchQuery = '';
let draggedTooltip = null;
let dragOffset = { x: 0, y: 0 };

// Default visible styles - common ones
const DEFAULT_VISIBLE_STYLES = [
  'display', 'position', 'width', 'height',
  'margin', 'padding', 'background-color', 'color',
  'font-size', 'font-weight', 'border'
];

// Store visible styles per tooltip
const tooltipVisibleStyles = new Map();

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
  pinnedTooltips.forEach(t => t.remove());
  pinnedTooltips = [];
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

// Get all non-default computed styles
function getNonDefaultStyles(element) {
  const computed = window.getComputedStyle(element);
  const nonDefaultStyles = {};
  
  // Create a temporary element of the same type to compare against defaults
  const tempElement = document.createElement(element.tagName);
  tempElement.style.cssText = 'all: initial;';
  
  // Temporarily add to DOM to get computed styles
  tempElement.style.position = 'absolute';
  tempElement.style.visibility = 'hidden';
  tempElement.style.pointerEvents = 'none';
  document.body.appendChild(tempElement);
  const defaultComputed = window.getComputedStyle(tempElement);
  
  // Compare all CSS properties
  for (let i = 0; i < computed.length; i++) {
    const prop = computed[i];
    const value = computed.getPropertyValue(prop);
    const defaultValue = defaultComputed.getPropertyValue(prop);
    
    // Only include if value differs from default
    if (value !== defaultValue) {
      nonDefaultStyles[prop] = value;
    }
  }
  
  // Also check inline styles explicitly
  if (element.style.cssText) {
    for (let i = 0; i < element.style.length; i++) {
      const prop = element.style[i];
      const value = element.style.getPropertyValue(prop);
      const priority = element.style.getPropertyPriority(prop);
      
      nonDefaultStyles[prop] = priority ? `${value} !important` : value;
    }
  }
  
  document.body.removeChild(tempElement);
  return nonDefaultStyles;
}

// Pin tooltip at current position
function pinTooltip(element) {
  if (!tooltip) return;
  
  const rect = element.getBoundingClientRect();
  const scrollX = window.scrollX || window.pageXOffset;
  const scrollY = window.scrollY || window.pageYOffset;
  const selector = getElementSelector(element);
  const size = `${Math.round(rect.width)} × ${Math.round(rect.height)}`;
  
  // Clone the tooltip for pinning
  const pinnedTooltip = document.createElement('div');
  pinnedTooltip.className = 'ext-picker-tooltip ext-picker-tooltip-pinned';
  
  let tooltipX = rect.left + scrollX;
  let tooltipY = rect.top + scrollY - 30;
  
  if (tooltipY < scrollY) {
    tooltipY = rect.bottom + scrollY + 5;
  }
  
  pinnedTooltip.style.left = tooltipX + 'px';
  pinnedTooltip.style.top = tooltipY + 'px';
  
  // Initialize visible styles for this tooltip with defaults
  const tooltipId = Date.now();
  pinnedTooltip.dataset.tooltipId = tooltipId;
  tooltipVisibleStyles.set(tooltipId, new Set(DEFAULT_VISIBLE_STYLES));
  
  // Build tooltip content
  const allStyles = getNonDefaultStyles(element);
  const visibleStyles = getVisibleStylesForTooltip(tooltipId, allStyles);
  
  pinnedTooltip.innerHTML = buildTooltipContent(selector, size, allStyles, visibleStyles, true, element, tooltipId);
  
  document.documentElement.appendChild(pinnedTooltip);
  pinnedTooltips.push(pinnedTooltip);
  
  // Add event listeners for pinned tooltip
  setupPinnedTooltipEvents(pinnedTooltip, element, tooltipId);
  
  // Make header draggable
  const header = pinnedTooltip.querySelector('.ext-tooltip-header');
  if (header) {
    header.style.cursor = 'move';
    header.addEventListener('mousedown', (e) => startDrag(e, pinnedTooltip));
  }
}

// Get visible styles for a specific tooltip
function getVisibleStylesForTooltip(tooltipId, allStyles) {
  const visibleStyleNames = tooltipVisibleStyles.get(tooltipId) || new Set(DEFAULT_VISIBLE_STYLES);
  const visible = {};
  
  for (const styleName of visibleStyleNames) {
    if (allStyles[styleName] !== undefined) {
      visible[styleName] = allStyles[styleName];
    }
  }
  
  return visible;
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
function buildTooltipContent(selector, size, allStyles, visibleStyles, isPinned, element, tooltipId) {
  const styleCount = Object.keys(visibleStyles).length;
  
  let html = `
    <div class="ext-tooltip-header">
      <span class="ext-tooltip-selector">${escapeHtml(selector)}</span>
      <span class="ext-tooltip-size">${size}</span>
  `;
  
  if (isPinned) {
    html += `
      <button class="ext-tooltip-btn ext-tooltip-toggle-styles" title="Toggle styles">
        ${tooltipStylesVisible ? '−' : '+'}
      </button>
      <button class="ext-tooltip-btn ext-tooltip-close" title="Close">×</button>
    `;
  }
  
  html += `</div>`;
  
  if (isPinned && tooltipStylesVisible) {
    // Add style search/typeahead
    html += `
      <div class="ext-tooltip-add-style">
        <input type="text" class="ext-tooltip-add-input" placeholder="Add style property..." list="style-suggestions-${tooltipId}">
        <datalist id="style-suggestions-${tooltipId}">
    `;
    
    // Add all available styles as suggestions (excluding already visible ones)
    const visibleStyleNames = tooltipVisibleStyles.get(tooltipId) || new Set();
    for (const prop of Object.keys(allStyles).sort()) {
      if (!visibleStyleNames.has(prop)) {
        html += `<option value="${escapeHtml(prop)}">`;
      }
    }
    
    html += `
        </datalist>
      </div>
      <div class="ext-tooltip-styles">
    `;
    
    if (styleCount > 0) {
      html += formatStylesForTooltip(visibleStyles, tooltipId);
    } else {
      html += '<div class="ext-no-styles">No styles selected</div>';
    }
    
    html += `</div>`;
  }
  
  return html;
}

// Escape HTML
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Format styles for tooltip display
function formatStylesForTooltip(styles, tooltipId) {
  let html = '';
  for (const [prop, value] of Object.entries(styles)) {
    html += `<div class="ext-style-row">
      <span class="ext-style-prop">${escapeHtml(prop)}</span>: 
      <span class="ext-style-value">${escapeHtml(value)}</span>;
      <button class="ext-style-remove" data-prop="${escapeHtml(prop)}" title="Remove">×</button>
    </div>`;
  }
  return html;
}

// Setup event listeners for pinned tooltip
function setupPinnedTooltipEvents(pinnedTooltip, element, tooltipId) {
  // Close button
  const closeBtn = pinnedTooltip.querySelector('.ext-tooltip-close');
  if (closeBtn) {
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      pinnedTooltip.remove();
      pinnedTooltips = pinnedTooltips.filter(t => t !== pinnedTooltip);
      tooltipVisibleStyles.delete(tooltipId);
    });
  }
  
  // Toggle styles button
  const toggleBtn = pinnedTooltip.querySelector('.ext-tooltip-toggle-styles');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      tooltipStylesVisible = !tooltipStylesVisible;
      
      rebuildTooltipContent(pinnedTooltip, element, tooltipId);
    });
  }
  
  // Add style input
  const addInput = pinnedTooltip.querySelector('.ext-tooltip-add-input');
  if (addInput) {
    addInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        
        const styleName = addInput.value.trim();
        if (styleName) {
          const visibleStyles = tooltipVisibleStyles.get(tooltipId);
          if (visibleStyles) {
            visibleStyles.add(styleName);
            addInput.value = '';
            rebuildTooltipContent(pinnedTooltip, element, tooltipId);
          }
        }
      }
    });
    
    addInput.addEventListener('click', (e) => {
      e.stopPropagation();
    });
  }
  
  // Remove style buttons
  const removeButtons = pinnedTooltip.querySelectorAll('.ext-style-remove');
  removeButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      
      const prop = btn.dataset.prop;
      const visibleStyles = tooltipVisibleStyles.get(tooltipId);
      if (visibleStyles && prop) {
        visibleStyles.delete(prop);
        rebuildTooltipContent(pinnedTooltip, element, tooltipId);
      }
    });
  });
}

// Rebuild tooltip content after changes
function rebuildTooltipContent(pinnedTooltip, element, tooltipId) {
  const selector = getElementSelector(element);
  const rect = element.getBoundingClientRect();
  const size = `${Math.round(rect.width)} × ${Math.round(rect.height)}`;
  const allStyles = getNonDefaultStyles(element);
  const visibleStyles = getVisibleStylesForTooltip(tooltipId, allStyles);
  
  pinnedTooltip.innerHTML = buildTooltipContent(selector, size, allStyles, visibleStyles, true, element, tooltipId);
  setupPinnedTooltipEvents(pinnedTooltip, element, tooltipId);
  
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
  const size = `${Math.round(rect.width)} × ${Math.round(rect.height)}`;
  
  let tooltipX = rect.left + scrollX;
  let tooltipY = rect.top + scrollY - 30;
  
  // Keep tooltip in viewport
  if (tooltipY < scrollY) {
    tooltipY = rect.bottom + scrollY + 5;
  }
  
  tooltip.style.left = tooltipX + 'px';
  tooltip.style.top = tooltipY + 'px';
  tooltip.innerHTML = buildTooltipContent(selector, size, {}, {}, false, element, null);
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
    return;
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
