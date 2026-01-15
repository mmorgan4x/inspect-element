# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Chrome Extension (Manifest V3) called "Element Picker" that provides DevTools-like element inspection with draggable, pinnable tooltips and customizable CSS style display.

## Development

### Loading the Extension

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top right)
3. Click "Load unpacked"
4. Select the `element-picker` folder

After making changes, click the refresh icon on the extension card at `chrome://extensions/` to reload.

### No Build System

This is a vanilla JavaScript project with no build step, bundler, or package manager. Edit files directly and reload the extension to test.

## Architecture

### File Structure

All source files are in the `element-picker/` directory:

- **manifest.json** - Extension configuration (Manifest V3)
- **background.js** - Service worker handling context menu creation and click events
- **picker.js** - Main content script with all picker logic (injected into every page)
- **picker.css** - Styles for overlay and tooltip UI components
- **devtools.html/devtools.js** - DevTools panel for `inspect()` integration

### Key Concepts

**Content Script Injection**: The picker runs as a content script injected at `document_start` on all URLs. It creates overlay elements on-demand when picker mode activates.

**Message Flow**:
- Context menu click → background.js sends `startPicker` message → picker.js activates
- Element click → picker.js sends `inspectElement` message → devtools.js calls `inspect()`

**State Management**: Picker state is managed via module-level variables in picker.js:
- `pickerActive` - whether picker mode is on
- `pinnedTooltips` - array of pinned tooltip DOM elements
- `tooltipVisibleStyles` - Map of tooltip ID to Set of visible style names

**Tooltip System**: Each pinned tooltip gets a unique ID (timestamp-based) and maintains its own list of which CSS properties to display. Tooltips are draggable via mouse events on the header.

### CSS Property Detection

The `getNonDefaultStyles()` function compares element's computed styles against a freshly-created element with `all: initial` to show only non-default values. Inline styles with `!important` are specially marked.

### Z-Index Strategy

All picker UI elements use `z-index: 2147483647` (max 32-bit signed int) to appear above page content.
