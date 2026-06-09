chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message && message.action === 'getVideoInfo') {
    // YouTube detection
    if (window.location.hostname.includes('youtube.com')) {
      const title = document.title || 'YouTube Video';
      const url = window.location.href;

      sendResponse({
        title,
        url,
        platform: 'youtube',
      });
    }
    // Instagram Reel detection
    else if (window.location.hostname.includes('instagram.com') && (window.location.pathname.includes('/reel/') || window.location.pathname.includes('/reels/'))) {
      const getInstagramCaption = () => {
        // 1. Check standard _a9zs class (often comments/caption on desktop)
        try {
          const a9zs = document.querySelector('span._a9zs, div._a9zs');
          if (a9zs && a9zs.textContent.trim()) {
            return a9zs.textContent.trim();
          }
        } catch (e) {}

        // 2. Try the original data-testid selector
        try {
          const testIdElement = document.querySelector('[data-testid="post-caption"]');
          if (testIdElement && testIdElement.innerText) {
            return testIdElement.innerText.trim();
          }
        } catch (e) {}

        // 3. Search around Follow button (video overlay layout)
        try {
          const followEl = Array.from(document.querySelectorAll('button, span, div, a')).find(el => {
            const txt = el.textContent.trim();
            return txt === 'Follow' || txt === 'Following';
          });
          if (followEl) {
            let current = followEl.parentElement;
            for (let i = 0; i < 6 && current; i++) {
              const leafElements = Array.from(current.querySelectorAll('span, div, h1'));
              
              const ignoredUsernames = new Set();
              const usernameLinks = Array.from(current.querySelectorAll('a[href^="/"]')).filter(a => {
                const href = a.getAttribute('href');
                return href && href.length > 2 && !href.includes('/reels/') && !href.includes('/p/') && !href.includes('/explore/');
              });
              usernameLinks.forEach(a => {
                const txt = a.textContent.trim();
                if (txt) ignoredUsernames.add(txt.toLowerCase());
              });

              for (const el of leafElements) {
                if (el.children.length === 0) {
                  const txt = el.textContent.trim();
                  if (txt && txt.length > 10 && !ignoredUsernames.has(txt.toLowerCase()) && txt !== 'Follow' && txt !== 'Following' && !txt.includes('original audio') && !txt.includes('Audio')) {
                    return txt;
                  }
                }
              }
              current = current.parentElement;
            }
          }
        } catch (e) {}

        // 4. Search around profile links in the DOM (general layout)
        try {
          const links = Array.from(document.querySelectorAll('a'));
          const profileLinks = links.filter(a => {
            const href = a.getAttribute('href');
            if (!href) return false;
            return /^\/[a-zA-Z0-9_.]+\/?$/.test(href) && 
                   href !== '/explore/' && 
                   href !== '/reels/' && 
                   href !== '/direct/' && 
                   href !== '/emails/' &&
                   href !== '/';
          });

          const globalIgnoredUsernames = new Set();
          profileLinks.forEach(a => {
            const txt = a.textContent.trim();
            if (txt) globalIgnoredUsernames.add(txt.toLowerCase());
          });

          for (const link of profileLinks) {
            const username = link.textContent.trim();
            if (!username) continue;

            let current = link.parentElement;
            for (let i = 0; i < 4 && current; i++) {
              const leafElements = Array.from(current.querySelectorAll('span, div, h1'));
              for (const el of leafElements) {
                if (el.children.length === 0) {
                  const txt = el.textContent.trim();
                  if (txt && txt.length > 15 && !globalIgnoredUsernames.has(txt.toLowerCase()) && txt !== 'Follow' && txt !== 'Following' && !txt.includes('original audio') && !txt.includes('Audio')) {
                    return txt;
                  }
                }
              }
              current = current.parentElement;
            }
          }
        } catch (e) {}

        // 5. Try parsing the page title (look for quotes)
        try {
          const title = document.title;
          if (title) {
            const match = title.match(/["'“‘]([^"'”’]+)["'”’]/);
            if (match && match[1]) {
              return match[1].trim();
            }
          }
        } catch (e) {}

        // 6. Try parsing the meta description
        try {
          const metaDesc = document.querySelector('meta[property="og:description"], meta[name="description"]');
          if (metaDesc) {
            const descContent = metaDesc.getAttribute('content');
            if (descContent) {
              const metaMatch = descContent.match(/on\s+Instagram\s*:\s*["'“‘](.*)["'”’]/i);
              if (metaMatch && metaMatch[1]) {
                return metaMatch[1].trim();
              }
            }
          }
        } catch (e) {}

        // 7. Try finding h1 element directly
        try {
          const h1 = document.querySelector('h1');
          if (h1) {
            const userLink = h1.querySelector('a');
            if (userLink) {
              const username = userLink.textContent.trim();
              const fullText = h1.textContent.trim();
              if (username && fullText.startsWith(username)) {
                const parsed = fullText.substring(username.length).trim();
                if (parsed) return parsed;
              }
            }
            const h1Text = h1.textContent.trim();
            if (h1Text) return h1Text;
          }
        } catch (e) {}

        return 'Instagram Reel';
      };

      const caption = getInstagramCaption();

      sendResponse({
        title: caption.substring(0, 100),
        url: window.location.href,
        platform: 'instagram',
        caption: caption,
      });
    } else {
      sendResponse({
        title: null,
        url: window.location.href,
        platform: null,
      });
    }
  }
});
