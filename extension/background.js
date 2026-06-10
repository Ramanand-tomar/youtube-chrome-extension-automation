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

  chrome.cookies.getAll({ domain: 'youtube.com' }, (cookies) => {
    if (chrome.runtime.lastError) {
      sendResponse({ error: chrome.runtime.lastError.message });
    } else if (!cookies || cookies.length === 0) {
      chrome.cookies.getAll({ url: 'https://www.youtube.com/' }, (fallbackCookies) => {
        if (chrome.runtime.lastError) {
          sendResponse({ error: chrome.runtime.lastError.message });
        } else {
          sendResponse({ cookies: fallbackCookies || [] });
        }
      });
    } else {
      sendResponse({ cookies: cookies });
    }
  });

  return true;
});
