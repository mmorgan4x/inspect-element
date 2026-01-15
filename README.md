# Element Picker Chrome Extension

A Chrome extension that mimics the DevTools element picker (Ctrl+Shift+C) functionality with draggable, pinnable tooltips and customizable style inspection.

## Features

- **Interactive Element Picker Mode**: Visual overlay that highlights elements as you hover
- **Pinnable & Draggable Tooltips**: Click elements to pin tooltips, drag them by the header
- **Customizable Style Display**: Show only the CSS properties you want to see
- **Add/Remove Styles**: Use typeahead to add properties, remove with × button
- **Default Common Styles**: Shows display, position, width, height, margin, padding, background-color, color, font-size, font-weight, border by default
- **DevTools Integration**: Right-click to inspect current element and clear all tooltips
- **Right-Click Activation**: Start picker mode from any right-click context menu
- **Keyboard Shortcut**: Use Ctrl+Shift+C to toggle picker mode (just like DevTools!)

## Installation

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" using the toggle in the top right
3. Click "Load unpacked"
4. Select the folder containing these extension files
5. The extension is now installed!

## Usage

### Starting Picker Mode

**Method 1: Right-Click Menu**
1. Right-click anywhere on a webpage
2. Select "Pick Element (Inspect Mode)" from the context menu

**Method 2: Keyboard Shortcut**
1. Press Ctrl+Shift+C (or Cmd+Shift+C on Mac)

### Using the Picker

- **Hover**: Move mouse over elements to see them highlighted with a tooltip
- **Click**: Pin a tooltip for that element (tooltip stays on screen)
- **Drag**: Click and drag the tooltip header to move it around
- **Right-Click**: Inspect current element in DevTools and clear all pinned tooltips
- **Escape**: Exit picker mode

### Pinned Tooltip Controls

Each pinned tooltip has interactive controls:

- **Drag Header**: Click and drag the header to reposition the tooltip
- **+ Button**: Toggle styles panel on/off
- **× Button** (top right): Close this tooltip
- **Add Style Input**: Type a CSS property name to add it to the list
  - Uses typeahead/autocomplete with all available properties
  - Press Enter to add the property
- **× Button** (per style): Remove that property from the display

### Style Management

- **Default Styles**: Tooltips initially show these common properties:
  - display, position, width, height
  - margin, padding
  - background-color, color
  - font-size, font-weight, border

- **Add Styles**: Type in the input field to see suggestions, press Enter to add
- **Remove Styles**: Click the × button next to any style to remove it
- **Persistent**: Each tooltip maintains its own list of visible styles
- **Semicolons**: All style values end with a semicolon (e.g., `color: red;`)

### DevTools Integration

- **Right-click** while in picker mode to:
  - Inspect the currently hovered element in DevTools
  - Clear all pinned tooltips
- Element is automatically selected in the Elements panel using `inspect()`

## Features Detail

### Tooltip Display
- Shows element selector (tag, id, or classes)
- Shows element dimensions (width × height)
- Initially compact, expandable to show styles
- Draggable by clicking and dragging the header
- Can be positioned anywhere on the page

### Styles Panel
- Shows only the CSS properties you've selected
- Displays property names in cyan, values in orange
- Each value ends with a semicolon
- Scrollable for long lists
- Add button for each property to remove it

## Keyboard Shortcuts

- **Ctrl+Shift+C** (Cmd+Shift+C on Mac) - Toggle element picker mode
- **Escape** - Exit picker mode
- **Right-Click** - Inspect element + clear tooltips
- **Enter** (in add input) - Add typed property to list

## Files

- `manifest.json` - Extension configuration
- `background.js` - Service worker that manages the context menu
- `picker.js` - Content script that implements the element picker
- `picker.css` - Styles for the picker overlay and tooltips
- `devtools.html` - DevTools page for inspect() integration
- `devtools.js` - Script that calls inspect() from DevTools context
- `icon16.png`, `icon48.png`, `icon128.png` - Extension icons

## Notes

- Tooltips can be dragged by their header to any position
- Multiple tooltips can be pinned simultaneously
- Each tooltip maintains its own list of visible styles
- Hover and click interactions ignore pinned tooltips
- The picker overlay uses high z-index (2147483647) to appear above all page content
- Cursor changes to crosshair when picker mode is active
- Works on all websites
- Only displays styles that differ from browser defaults
- Inline styles are shown with !important indicators
- **DevTools must be open** for the `inspect()` function to work
