# 🚀 YouTube Shorts Uploader & Reel Transformer Engine

A full-stack automation platform featuring a **Chrome Extension**, a **Node.js/Express Backend Engine**, and **GitHub Actions CI/CD Integration**. Automatically download reels from YouTube, Instagram, and TikTok, transform them with FFmpeg filters (to bypass duplicate/copyright detection and re-style content), cross-post to Instagram Reels & YouTube Shorts, and schedule uploads automatically.

---

## ✨ Features

- 🎬 **Multi-Platform Scraping & Uploading:** Scrape and upload YouTube Shorts, Instagram Reels, and TikTok videos seamlessly.
- 🎨 **Reel Transformation Engine (FFmpeg):**
  - 🪞 **Horizontal Mirroring (`hflip`):** Inverts video left-to-right to alter visual hashes.
  - ⚡ **Speed & Frame Rate Shift (1.03x – 1.08x):** Alters playback timing & duration while keeping natural pitch.
  - 🔍 **Micro Zoom & Edge Crop (1% – 10%):** Crops out original borders and scales back to standard 9:16 (1080x1920).
  - 🌈 **Color Matrix Filters:** `cinematic`, `warm`, `cool`, or `contrast` adjustments.
  - 🏷️ **Top Banner Hook Header:** Adds customizable, high-converting banner text over video top (*"WAIT FOR THE END 😱"*).
  - 💧 **Custom Watermarks:** Adds subtle handle/watermark text over output reels.
- ⚡ **Transformation Presets:**
  - `⚡ Quick Anti-Detect`: Horizontal flip + 1.04x speed + 3% crop + cinematic color filter.
  - `🔥 Viral Hook Header`: Flip + 1.03x speed + contrast filter + custom top banner text.
  - `🎨 Branded`: Speed shift + warm color filter + brand handle watermark.
- 📅 **Automated Scheduler:** Queue videos for automated future publication.
- ⚙️ **GitHub Actions CI/CD:**
  - Automated build & packaging of `chrome-extension-youtube-uploader.zip` artifact.
  - Automated cloud video processing runner with pre-configured FFmpeg.

---

## 🛠️ How to Use Reel Transformation

### 1. In the Chrome Extension Popup
1. Open any YouTube Short, Instagram Reel, or TikTok video.
2. Click the **ShortsFlow** extension icon.
3. Check **"✨ Enable Reel Transformation (Anti-Duplicate)"**.
4. Select a **Preset Filter** (`Quick Anti-Detect`, `Viral Hook Header`, or `Branded`).
5. (Optional) Enter custom **Top Hook Banner Text** (e.g. *"This changed everything 🤯"*).
6. Click **Upload** or **Schedule for later**.

### 2. Via Backend API (`POST /api/process`)
Pass `transformOptions` in the JSON request body:

```json
{
  "videoUrl": "https://www.instagram.com/reel/Cxxxxxx/",
  "title": "My Restyled Short",
  "description": "#Shorts #Viral",
  "postToYouTube": true,
  "crossPostToInstagram": true,
  "transformOptions": {
    "preset": "quick_anti_detect",
    "topBannerText": "WAIT FOR THE END 😱",
    "topBannerBgColor": "black@0.8",
    "topBannerTextColor": "yellow"
  }
}
```

---

## ⚙️ GitHub Actions & CI/CD Deployment

Whenever you push to `main` (or run a `workflow_dispatch` manual trigger):

1. **Automated Testing:** Sets up Node.js 20 and native `FFmpeg` on Ubuntu runner to test video transformation modules.
2. **Artifact Packaging:** Zips the `extension/` directory into `chrome-extension-youtube-uploader.zip` and uploads it to your repository's **Actions** tab.
3. **Scheduled Automations:** Runs scheduled cron jobs (every 6 hours) to execute serverless reel processing workflows.

### Downloading the Extension Build from GitHub Actions:
1. Go to your repository on GitHub: `https://github.com/Ramanand-tomar/youtube-chrome-extension-automation`
2. Click on the **Actions** tab.
3. Select the latest workflow run (**Reel Automation & CI/CD Pipeline**).
4. Scroll down to **Artifacts** and download `chrome-extension-build.zip`!

---

## 💻 Local Development Setup

1. **Clone & Install Dependencies:**
   ```bash
   cd backend
   npm install
   ```
2. **Ensure FFmpeg is installed:**
   - Windows: Download FFmpeg and ensure `ffmpeg` is on system PATH.
   - Linux / macOS: `sudo apt install ffmpeg` or `brew install ffmpeg`.
3. **Configure Environment Variables (`backend/.env`):**
   ```env
   PORT=3000
   YOUTUBE_CLIENT_ID=your_client_id
   YOUTUBE_CLIENT_SECRET=your_client_secret
   YOUTUBE_REDIRECT_URI=http://localhost:3000/api/auth/callback
   CLOUDINARY_CLOUD_NAME=your_cloud_name
   CLOUDINARY_API_KEY=your_api_key
   CLOUDINARY_API_SECRET=your_api_secret
   ```
4. **Start the Backend Server:**
   ```bash
   npm start
   ```
5. **Load Chrome Extension:**
   - Open Chrome and navigate to `chrome://extensions`.
   - Enable **Developer Mode**.
   - Click **Load Unpacked** and select the `extension/` directory.

---

## 📁 Repository Structure

```
youtube-chrome-extension-automation/
├── .github/
│   └── workflows/
│       └── deploy-and-transform.yml   ← GitHub Actions CI/CD & Pipeline
├── backend/
│   ├── server.js                     ← Express API server
│   ├── utils/
│   │   ├── videoTransformer.js       ← FFmpeg Transformation Engine
│   │   ├── instagram.js              ← Instagram scraper helper
│   │   ├── tiktok.js                 ← TikTok scraper helper
│   │   ├── scheduler.js              ← Job scheduling logic
│   │   └── quota.js                  ← Upload quota manager
│   ├── package.json
│   └── downloads/                    ← Temporary video download folder
├── extension/
│   ├── manifest.json
│   ├── popup.html                    ← Extension UI with Reel Transformer controls
│   ├── popup.js                      ← Frontend API client
│   ├── background.js
│   └── content.js
└── README.md
```
