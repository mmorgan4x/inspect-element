// Create context menu when extension is installed
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'pickElement',
    title: 'Pick Element (Inspect Mode)',
    contexts: ['all']
  });
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'pickElement' && tab.id) {
    // Send message to content script to start picker mode
    chrome.tabs.sendMessage(tab.id, {
      action: 'startPicker'
    });
  }
});
