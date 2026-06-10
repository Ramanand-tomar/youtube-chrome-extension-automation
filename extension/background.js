chrome.runtime.onInstalled.addListener(() => {
  console.log('YouTube Shorts Uploader installed');
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.action !== 'getYoutubeCookies') {
    return false;
  }

  if (!chrome.cookies || !chrome.cookies.getAll) {
    sendResponse({ error: 'Cookies API unavailable in background.' });
    return true;
  }

  chrome.cookies.getAll({}, (cookies) => {
    if (chrome.runtime.lastError) {
      sendResponse({ error: chrome.runtime.lastError.message });
    } else {
      const filtered = (cookies || []).filter(c => c.domain.includes('youtube.com'));
      sendResponse({ cookies: filtered });
    }
  });

  return true;
});
