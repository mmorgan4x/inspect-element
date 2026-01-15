// Listen for messages from content script to inspect elements
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'inspectElement') {
    // Use chrome.devtools.inspectedWindow.eval to execute inspect() in the page context
    // This is the proper way to call inspect() from an extension
    const code = `
      (function() {
        var element = window.__SELECTED_ELEMENT__;
        if (element && typeof inspect === 'function') {
          inspect(element);
          return true;
        }
        return false;
      })()
    `;
    
    chrome.devtools.inspectedWindow.eval(code, (result, isException) => {
      if (isException) {
        console.error('Error inspecting element:', isException);
      }
      sendResponse({ success: !isException, result: result });
    });
    
    return true; // Keep message channel open for async response
  }
});

// Create a connection to keep the devtools page alive
const port = chrome.runtime.connect({ name: 'devtools' });
