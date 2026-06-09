# YouTube Shorts Uploader

A greenfield Chrome extension project paired with a Node.js/Express backend. The extension sends a YouTube video URL to the backend, which downloads the video, uploads it to Cloudinary, uploads it to YouTube as a Short, and then cleans up temporary assets.

## Prerequisites

- Node.js 18+ installed
- Docker installed for Render deployment
- Google Cloud Console account with YouTube Data API v3 enabled
- Cloudinary account
- `yt-dlp` installed locally for development: `pip install yt-dlp`
- `ffmpeg` installed locally

## YouTube OAuth Setup

1. Open Google Cloud Console and create or select a project.
2. Enable the YouTube Data API v3.
3. Create OAuth 2.0 credentials for a Web application.
4. Add the redirect URI: `https://your-backend.onrender.com/api/auth/callback`.
5. Copy the Client ID and Client Secret into `.env`.

## Cloudinary Setup

1. Create a Cloudinary account.
2. Copy your Cloud name, API key, and API secret.
3. Add them to `.env`.

## Local Development

1. Navigate to the backend folder:
   ```bash
   cd backend
   npm install
   ```
2. Copy `.env.example` to `.env` and set your values.
3. Install `yt-dlp` and `ffmpeg` locally if not already installed.
4. Start the backend:
   ```bash
   npm start
   ```
5. Open `http://localhost:3000/api/auth/youtube` in your browser.
6. Authorize the application and complete the OAuth flow.

## Loading the Extension

1. Open Chrome and go to `chrome://extensions`.
2. Enable Developer mode.
3. Click **Load unpacked**.
4. Select the `extension/` folder.
5. Update the `BACKEND_URL` constant in `extension/popup.js` to `http://localhost:3000` for local testing.
6. Reload the extension.

## Deploying to Render

1. Push the repository to GitHub.
2. Create a new Render Web Service.
3. Choose Docker runtime and point to `backend/Dockerfile`.
4. Set environment variables in Render manually.
5. Update `BACKEND_URL` in `extension/popup.js` to your Render service URL.
6. Reload the extension after deployment.

## Quota Notes

- YouTube API free quota is typically 10,000 units per day.
- Each video upload consumes approximately 1,600 units.
- Expect roughly 6 uploads per day on the free quota.

## Troubleshooting

- `yt-dlp` not found: ensure it is installed and available in PATH.
- `ffmpeg` missing: install `ffmpeg` locally or in the Docker image.
- Token issues: re-run the OAuth flow at `/api/auth/youtube`.
- CORS errors: confirm the frontend is using the correct backend URL.

## Project Structure

```
youtube-shorts-uploader/
├── backend/
│   ├── server.js
│   ├── package.json
│   ├── .env.example
│   ├── Dockerfile
│   ├── render.yaml
│   └── downloads/          ← created at runtime via fs-extra.ensureDir
├── extension/
│   ├── manifest.json
│   ├── popup.html
│   ├── popup.js
│   ├── background.js
│   ├── content.js
│   └── icons/
│       ├── icon16.png
│       ├── icon48.png
│       └── icon128.png
└── README.md
```
