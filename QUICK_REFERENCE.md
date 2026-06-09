# Quick Reference - Instagram Reels Commands

## 1️⃣ Setup Commands

### Install Dependencies
```bash
cd backend
npm install
```

### Export Instagram Cookies
```bash
# Using cookie manager extension is easiest - see INSTAGRAM_REELS_GUIDE.md for details
```

### Upload Cookies to Backend
```bash
curl -X POST -F "cookies=@cookies.txt" http://localhost:3000/api/instagram/cookies
```

### Start Backend Server
```bash
npm start
# Should output: "Backend listening on port 3000"
```

### Load Extension in Chrome
```
1. chrome://extensions/
2. Turn on "Developer mode" (top right)
3. "Load unpacked"
4. Select chrome-extension-youtube/extension folder
```

---

## 2️⃣ API Commands

### Check if Cookies Installed
```bash
curl http://localhost:3000/api/instagram/cookies/status

# Response:
# {"hasCookies":true,"message":"Cookies available"}
```

### Check Daily Quota
```bash
curl http://localhost:3000/api/quota

# Response:
# {"current":3,"max":10,"remaining":7,"resetDate":"2026-06-09"}
```

### Single Reel Upload (Batch Format)
```bash
curl -X POST http://localhost:3000/api/process-batch \
  -H "Content-Type: application/json" \
  -d '{
    "urls": ["https://www.instagram.com/reel/Xf4ScULHTzk/"],
    "defaultCredit": true,
    "globalTitle": "My Title"
  }'
```

### Batch Upload (Multiple Reels)
```bash
curl -X POST http://localhost:3000/api/process-batch \
  -H "Content-Type: application/json" \
  -d '{
    "urls": [
      "https://www.instagram.com/reel/Xf4ScULHTzk/",
      "https://www.instagram.com/reel/Xf4ScULHTzl/",
      "https://www.instagram.com/reel/Xf4ScULHTzm/"
    ],
    "defaultCredit": true
  }'
```

### Delete Cookies
```bash
curl -X DELETE http://localhost:3000/api/instagram/cookies
```

---

## 3️⃣ JavaScript/Fetch Examples

### Single Upload
```javascript
const response = await fetch('http://localhost:3000/api/process-batch', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    urls: ['https://www.instagram.com/reel/Xf4ScULHTzk/'],
    defaultCredit: true,
    globalTitle: 'Optional Title'
  })
});

const reader = response.body.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  
  const chunk = decoder.decode(value);
  const lines = chunk.split('\n');
  
  for (const line of lines) {
    if (line.trim()) {
      const event = JSON.parse(line);
      console.log(event); // Progress updates
    }
  }
}
```

### Upload Cookies (File)
```javascript
const formData = new FormData();
formData.append('cookies', cookieFile); // <input type="file">

const response = await fetch('http://localhost:3000/api/instagram/cookies', {
  method: 'POST',
  body: formData
});

const result = await response.json();
console.log(result); // { success: true, message: '...' }
```

### Get Quota Status
```javascript
const response = await fetch('http://localhost:3000/api/quota');
const quota = await response.json();

console.log(`${quota.current}/${quota.max} uploads used (${quota.remaining} remaining)`);
```

---

## 4️⃣ Environment Variables (.env)

```env
# YouTube
YOUTUBE_CLIENT_ID=xxx
YOUTUBE_CLIENT_SECRET=xxx
YOUTUBE_REDIRECT_URI=http://localhost:3000/api/auth/callback

# Cloudinary
CLOUDINARY_CLOUD_NAME=xxx
CLOUDINARY_API_KEY=xxx
CLOUDINARY_API_SECRET=xxx

# Server
PORT=3000

# Instagram
MAX_DAILY_UPLOADS=10
```

---

## 5️⃣ Useful Debugging

### Check Node Process
```bash
# MacOS/Linux
lsof -i :3000

# Windows
netstat -ano | findstr :3000
```

### Kill Process on Port 3000
```bash
# MacOS/Linux
kill -9 <PID>

# Windows
taskkill /PID <PID> /F
```

### Clear Quota (Reset Today's Count)
```javascript
// In backend/utils/quota.js - for testing only
await quota.resetQuota(); // Deletes today's count
```

### Check Backend Logs
```bash
# Look for errors in terminal output when running "npm start"
# Detailed error messages should appear there
```

### Test Instagram Metadata Extraction
```bash
# Direct yt-dlp test (if installed)
yt-dlp --dump-json https://www.instagram.com/reel/Xf4ScULHTzk/ | head -20
```

---

## 6️⃣ Common Issues & Fixes

### Issue: "Login required: Please upload cookies.txt"
```bash
# Fix: Upload cookies
curl -X POST -F "cookies=@cookies.txt" http://localhost:3000/api/instagram/cookies
```

### Issue: "Daily quota exceeded"
```bash
# Fix: Check remaining quota
curl http://localhost:3000/api/quota

# Or wait until next day (midnight UTC)
```

### Issue: "Video duration exceeds 60 seconds"
```bash
# Fix: Use a different reel that's ≤60 seconds
# Or trim the reel manually in Instagram
```

### Issue: Extension not showing on Instagram page
```bash
# Fix: Reload extension
# chrome://extensions/ → Find extension → Reload button
```

### Issue: Backend won't start
```bash
# Fix: Check dependencies
npm install

# Check port not in use
netstat -ano | findstr :3000

# Check Node version
node --version  # Should be 18+
```

---

## 7️⃣ File Locations

| Item | Location |
|------|----------|
| Extension | `extension/` |
| Backend | `backend/` |
| Instagram Cookies | `backend/cookies/instagram.txt` |
| Quota Data | `backend/quota/daily-uploads.json` |
| Downloaded Videos | `backend/downloads/` (auto-deleted) |
| Guide | `INSTAGRAM_REELS_GUIDE.md` |
| Implementation | `IMPLEMENTATION_SUMMARY.md` |

---

## 8️⃣ Useful Links

- Instagram Cookie Export: See INSTAGRAM_REELS_GUIDE.md § "Instagram Authentication"
- API Reference: See INSTAGRAM_REELS_GUIDE.md § "API Reference"
- Troubleshooting: See INSTAGRAM_REELS_GUIDE.md § "Troubleshooting"
- yt-dlp Docs: https://github.com/yt-dlp/yt-dlp
- Chrome Extension Dev: https://developer.chrome.com/docs/extensions/

