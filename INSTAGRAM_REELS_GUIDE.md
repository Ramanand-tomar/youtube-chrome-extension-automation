# Instagram Reels to YouTube Shorts Uploader

Complete feature guide for uploading Instagram Reels to YouTube as Shorts.

## Features

✅ **Instagram Reel Detection** - Automatically detects when you visit an Instagram Reel URL
✅ **Auto-Metadata Extraction** - Pulls username, caption, and upload date from Instagram
✅ **Credit Attribution** - Optional automatic credit line with Instagram handle
✅ **Batch Upload** - Upload up to 10 Instagram Reels per day
✅ **Retry Logic** - Auto-retry with exponential backoff (max 3 attempts)
✅ **Rate Limiting** - Automatic delays between downloads to avoid Instagram blocks
✅ **Cookie-Based Auth** - Supports Instagram browser cookies for private/restricted content
✅ **Error Handling** - Comprehensive error messages for common issues
✅ **Duration Validation** - Automatic rejection of videos >60 seconds

## Setup Instructions

### Prerequisites

1. **Node.js** 18+ and npm installed
2. **Python 3** with pip (for yt-dlp)
3. **Docker** (optional, for deployment)
4. **YouTube OAuth credentials** (existing setup)
5. **Cloudinary account** (existing setup)

### Installation

#### Option 1: Docker (Recommended for Production)

```bash
cd backend
docker build -t youtube-shorts-uploader .
docker run -p 3000:3000 \
  -e YOUTUBE_CLIENT_ID=your_id \
  -e YOUTUBE_CLIENT_SECRET=your_secret \
  -e YOUTUBE_REDIRECT_URI=http://localhost:3000/api/auth/callback \
  -e CLOUDINARY_CLOUD_NAME=your_name \
  -e CLOUDINARY_API_KEY=your_key \
  -e CLOUDINARY_API_SECRET=your_secret \
  -e MAX_DAILY_UPLOADS=10 \
  youtube-shorts-uploader
```

#### Option 2: Local Development

```bash
# Install backend dependencies
cd backend
npm install

# Install yt-dlp via pip
pip install yt-dlp

# Create .env file
cp .env.example .env
# Edit .env with your credentials

# Start backend
npm start
```

#### Option 3: Load Extension in Chrome

```bash
1. Open chrome://extensions/
2. Enable "Developer mode" (top right)
3. Click "Load unpacked"
4. Select the `extension/` folder
5. Extension should appear in your toolbar
```

### Instagram Authentication (Cookies)

Instagram blocks automated requests. To download Reels, you need browser cookies:

#### Step 1: Export Cookies from Chrome

Option A: Using a Chrome Extension
- Install "Cookie Editor" extension
- Visit instagram.com and login
- Open "Cookie Editor" → "Export" → Choose "Netscape HTTP Cookie File"
- Save as `cookies.txt`

Option B: Using Browser DevTools (Manual)
- Visit instagram.com and login
- Open DevTools (F12) → Application → Cookies → instagram.com
- Note the cookies (optional, more complex)

#### Step 2: Upload Cookies to Backend

```bash
# Via command line
curl -X POST -F "cookies=@cookies.txt" http://localhost:3000/api/instagram/cookies

# Via API (JavaScript)
const formData = new FormData();
formData.append('cookies', cookieFile);
fetch('http://localhost:3000/api/instagram/cookies', {
  method: 'POST',
  body: formData
});
```

#### Check Cookie Status

```bash
curl http://localhost:3000/api/instagram/cookies/status
# Response: { "hasCookies": true, "message": "Cookies available" }
```

### Usage

#### Single Reel Upload (via Extension)

1. Open an Instagram Reel URL (e.g., `https://www.instagram.com/reel/Xf4ScULHTzk/`)
2. Click the extension icon
3. Review auto-filled caption
4. (Optional) Edit title and description
5. Click "Upload"
6. Watch progress updates
7. Click the YouTube link when done

#### Batch Upload (10 Reels at Once)

```javascript
// JavaScript
const urls = [
  'https://www.instagram.com/reel/Xf4ScULHTzk/',
  'https://www.instagram.com/reel/Xf4ScULHTzl/',
  // ... up to 10
];

const response = await fetch('http://localhost:3000/api/process-batch', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    urls,
    defaultCredit: true, // Include @username credit
    globalTitle: 'Custom Title', // Optional: use same title for all
    globalDescription: 'Custom Description', // Optional
  }),
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
      console.log(event); // { step, message, reel, total, status }
    }
  }
}
```

```bash
# Curl
curl -X POST http://localhost:3000/api/process-batch \
  -H "Content-Type: application/json" \
  -d '{
    "urls": [
      "https://www.instagram.com/reel/Xf4ScULHTzk/",
      "https://www.instagram.com/reel/Xf4ScULHTzl/"
    ],
    "defaultCredit": true,
    "globalTitle": "Best Instagram Reels"
  }'
```

#### Check Daily Quota

```bash
curl http://localhost:3000/api/quota

# Response:
# {
#   "current": 3,
#   "max": 10,
#   "remaining": 7,
#   "resetDate": "2026-06-09"
# }
```

## Video Title & Description Format

### Default Title
- Uses Instagram Reel caption (first 100 characters)
- Can be overridden by user

### Default Description

With Credit (enabled by default):
```
[Original Instagram Caption]

🔄 Originally posted on Instagram by @username
📅 Date: 09/06/2026
#Shorts #InstagramReels
```

Without Credit:
```
[Original Instagram Caption]

#Shorts
```

## Error Handling

| Error | Cause | Solution |
|-------|-------|----------|
| `Login required: Please upload cookies.txt` | No cookies on server | Export cookies from Chrome, upload via API or extension settings |
| `Rate limited: Instagram blocked the request. Please wait 15 minutes and retry.` | Too many requests | Wait 15 minutes, then retry |
| `Reel not found or deleted.` | Video no longer exists | Use a different Reel URL |
| `Daily quota exceeded. Remaining uploads: 2` | Exceeded 10 uploads/day | Wait until midnight UTC for reset |
| `Video duration (75s) exceeds 60 seconds limit` | Video too long for YouTube Shorts | Trim to ≤60 seconds and re-upload |

## Daily Quota System

- **Limit**: 10 Instagram Reels per day (configurable via `MAX_DAILY_UPLOADS`)
- **Reset**: Midnight UTC
- **Tracking**: Stored in `/backend/quota/daily-uploads.json`
- **Batch**: If batch has 8 URLs and quota is 10, only 10 are allowed, not all 8

Example quota file:
```json
{
  "2026-06-09": 5,
  "2026-06-08": 10,
  "2026-06-07": 8
}
```

## Rate Limiting & Anti-Detection

- **Automatic delays**: 2-5 seconds between downloads
- **Retry backoff**: 1s, 2s, 4s (exponential)
- **Sequential processing**: Only 1 download at a time
- **Cookie rotation**: Consider rotating cookies if still blocked

## API Reference

### POST /api/process-batch
Process multiple Instagram Reels.

**Request:**
```json
{
  "urls": ["https://www.instagram.com/reel/XXX/", "..."],
  "defaultCredit": true,
  "globalTitle": "Optional custom title",
  "globalDescription": "Optional custom description"
}
```

**Response:** (Streaming NDJSON)
```json
{"step":"init","message":"Starting batch processing of 2 reel(s)","total":2}
{"step":"batch-processing","reel":1,"total":2,"status":"starting","message":"Processing reel 1/2: ..."}
{"step":"batch-processing","reel":1,"total":2,"status":"processing","message":"Reel 1: Extracting metadata..."}
{"step":"batch-processing","reel":1,"total":2,"status":"success","message":"Reel 1 uploaded successfully"}
{"step":"complete","message":"Batch processing complete. Success: 1, Failures: 0","success":1,"failures":0,"quota":{...}}
```

### GET /api/instagram/cookies/status
Check if Instagram cookies are available.

**Response:**
```json
{
  "hasCookies": true,
  "message": "Cookies available"
}
```

### POST /api/instagram/cookies
Upload Instagram cookies file.

**Request:** (multipart/form-data)
- File: `cookies` (cookies.txt)

**Response:**
```json
{
  "success": true,
  "message": "Instagram cookies uploaded and saved successfully"
}
```

### DELETE /api/instagram/cookies
Delete stored Instagram cookies.

**Response:**
```json
{
  "success": true,
  "message": "Instagram cookies deleted"
}
```

### GET /api/quota
Get current daily quota status.

**Response:**
```json
{
  "current": 3,
  "max": 10,
  "remaining": 7,
  "resetDate": "2026-06-09"
}
```

## Troubleshooting

### Issue: "Login required" error

**Cause**: yt-dlp can't access Instagram without cookies  
**Solution**:
1. Ensure you're logged into instagram.com
2. Export cookies to `cookies.txt`
3. Upload via API: `curl -X POST -F "cookies=@cookies.txt" http://localhost:3000/api/instagram/cookies`
4. Verify: `curl http://localhost:3000/api/instagram/cookies/status`

### Issue: Extension not showing on Instagram

**Cause**: Instagram domain not in manifest permissions  
**Solution**:
1. Check manifest.json has `"https://www.instagram.com/*"` in `host_permissions`
2. Reload extension in chrome://extensions/
3. Visit instagram.com/reel/* page

### Issue: Video duration exceeds 60 seconds

**Cause**: Instagram Reel is longer than YouTube Shorts limit  
**Solution**:
1. Manually trim the video to ≤60 seconds
2. Re-upload the trimmed version

### Issue: Rate limited by Instagram

**Cause**: Too many downloads in short time  
**Solution**:
1. Automatic delays (2-5s) are in place
2. If still blocked, wait 15 minutes
3. Consider uploading fewer reels per session

## Deployment to Render

Update `render.yaml`:
```yaml
services:
  - type: web
    name: youtube-shorts-backend
    runtime: node
    buildCommand: npm ci --omit=dev
    startCommand: node server.js
    envVars:
      - key: YOUTUBE_CLIENT_ID
        scope: build,runtime
      - key: YOUTUBE_CLIENT_SECRET
        scope: runtime
      - key: CLOUDINARY_CLOUD_NAME
        scope: build,runtime
      - key: CLOUDINARY_API_KEY
        scope: runtime
      - key: CLOUDINARY_API_SECRET
        scope: runtime
      - key: MAX_DAILY_UPLOADS
        value: "10"
```

## Security Considerations

⚠️ **Important**:
- ✅ Cookies stored in `/backend/cookies/` (not committed to git)
- ✅ No hardcoded credentials
- ✅ API keys in environment variables only
- ✅ Downloaded files deleted after upload
- ⚠️ Rotate Instagram cookies periodically (Instagram may revoke)
- ⚠️ Use HTTPS in production (not http://)

## Performance Metrics

- **Download time**: 30-120 seconds (depends on video length & quality)
- **Cloudinary upload**: 10-30 seconds
- **YouTube upload**: 30-60 seconds
- **Total per reel**: 2-4 minutes
- **Batch of 10**: ~30-40 minutes (with automatic delays)

## FAQ

**Q: Can I upload more than 10 reels per day?**  
A: Edit `MAX_DAILY_UPLOADS` in `.env` (e.g., `MAX_DAILY_UPLOADS=20`)

**Q: Do I need to upload cookies every time?**  
A: No, cookies are stored on the server. Upload once and they persist.

**Q: What if the backend crashes during batch upload?**  
A: Processed reels are already uploaded. Failed reels in the batch will need to be re-submitted.

**Q: Can I delete a reel after uploading?**  
A: Yes, from YouTube Studio. Instagram credit line can't be edited from extension.

**Q: What's the max reel duration?**  
A: 60 seconds (YouTube Shorts limit). Longer reels are rejected.

**Q: Do cookies expire?**  
A: Instagram may revoke them periodically. If you get "Login required" again, re-upload fresh cookies.

