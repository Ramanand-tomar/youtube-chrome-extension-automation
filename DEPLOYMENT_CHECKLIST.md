# Deployed Production Deployment Guide (Render)

This guide provides step-by-step instructions to deploy the YouTube Shorts Uploader backend service on Render using Docker and configure the Chrome extension to interact with it.

---

## 📋 Table of Contents
1. [Prerequisites](#1-prerequisites)
2. [Step 1: Commit and Push Code to GitHub](#step-1-commit-and-push-code-to-github)
3. [Step 2: Deploy to Render](#step-2-deploy-to-render)
4. [Step 3: Set Environment Variables](#step-3-set-environment-variables)
5. [Step 4: Authenticate YouTube OAuth in Production](#step-4-authenticate-youtube-oauth-in-production)
6. [Step 5: Upload Instagram Cookies](#step-5-upload-instagram-cookies)
7. [Step 6: Configure and Reload Extension](#step-6-configure-and-reload-extension)
8. [🔍 Verification & Monitoring](#-verification--monitoring)

---

## 1. Prerequisites
- A **GitHub** account and a repository for this project.
- A **Render** account (Render is used to host the Dockerized Node.js backend).
- A Google Cloud Platform (GCP) Project with the **YouTube Data API v3** enabled and OAuth credentials configured.
- A Cloudinary account for temporary video transcoding and storage.

---

## Step 1: Commit and Push Code to GitHub

1. Confirm that files/directories containing local secrets, local tokens, or large downloaded files are excluded from Git. Your `.gitignore` should contain:
   ```text
   node_modules/
   backend/.env
   backend/downloads/
   backend/cookies/
   backend/quota/
   backend/schedule/
   backend/tokens.json
   ```
2. Commit and push the project files to your GitHub repository:
   ```bash
   git add .
   git commit -m "feat: Add scheduling engine, glassmorphism UI, and deployment configs"
   git push origin main
   ```

---

## Step 2: Deploy to Render

Render will build and run the backend automatically using the Dockerfile configuration.

1. Log in to the [Render Dashboard](https://dashboard.render.com/).
2. Click **New +** and select **Web Service**.
3. Connect your GitHub repository.
4. Set the following settings:
   - **Name**: `youtube-shorts-uploader`
   - **Region**: Choose the region closest to you.
   - **Branch**: `main`
   - **Runtime**: `Docker`
   - **DockerfilePath**: `backend/Dockerfile`
   - **Instance Type**: `Free` (or custom paid tier)

---

## Step 3: Set Environment Variables

In the **Environment** tab of your Render Web Service, add the following environment variables:

| Key | Value | Description |
| :--- | :--- | :--- |
| `NODE_ENV` | `production` | Enables production mode settings. |
| `PORT` | `3000` | The port the server binds to inside the container. |
| `YOUTUBE_CLIENT_ID` | `your_youtube_client_id` | OAuth 2.0 Client ID from GCP. |
| `YOUTUBE_CLIENT_SECRET` | `your_youtube_client_secret` | OAuth 2.0 Client Secret from GCP. |
| `YOUTUBE_REDIRECT_URI` | `https://your-service.onrender.com/api/auth/callback` | Redirect URI (must be added in GCP Console under Authorized Redirect URIs). |
| `CLOUDINARY_CLOUD_NAME` | `your_cloudinary_cloud_name` | Cloudinary name. |
| `CLOUDINARY_API_KEY` | `your_cloudinary_api_key` | Cloudinary API Key. |
| `CLOUDINARY_API_SECRET` | `your_cloudinary_api_secret` | Cloudinary API Secret. |
| `SESSION_SECRET` | `your_random_session_secret` | Secure string for express session storage. |
| `MAX_DAILY_UPLOADS` | `10` | Daily limit allowed (optional, default is 10). |

Click **Save Changes**. This will trigger a redeploy of your service.

---

## Step 4: Authenticate YouTube OAuth in Production

Since Render's free tier uses ephemeral storage, credentials must be authenticated upon initial deployment.

1. Ensure the URL `https://your-service.onrender.com/api/auth/callback` is listed under **Authorized redirect URIs** in your GCP credentials page.
2. Visit the authentication endpoint:
   `https://your-service.onrender.com/api/auth/youtube`
3. Log in with your Google account that owns the target YouTube Channel.
4. Accept permissions. You will be redirected to the success page indicating that tokens have been saved.

---

## Step 5: Upload Instagram Cookies

To enable downloading and scheduling of Instagram Reels, upload your local Instagram cookies to the production server.

1. Install a Chrome extension such as **Get cookies.txt LOCALLY** or **EditThisCookie**.
2. Go to Instagram, log in, and export your cookies in **Netscape format** as `cookies.txt`.
3. Open a terminal and run `curl` to upload the cookies file to the production server:
   ```bash
   curl -X POST -F "cookies=@cookies.txt" https://your-service.onrender.com/api/instagram/cookies
   ```
4. Verify cookie presence by checking:
   `https://your-service.onrender.com/api/instagram/cookies/status`
   *(It should respond with `{ "hasCookies": true, "message": "Cookies available" }`)*

---

## Step 6: Configure and Reload Extension

1. Open [popup.js](file:///c:/Users/raman/OneDrive/Desktop/interesting-projects/youtube-automation/chrome-extension-youtube/extension/popup.js).
2. Change the `BACKEND_URL` on line 1 to your production Render URL:
   ```javascript
   const BACKEND_URL = 'https://your-service.onrender.com';
   ```
3. Open Google Chrome and go to `chrome://extensions/`.
4. Locate the **YouTube Shorts Uploader** extension.
5. Click the **Reload** (circular arrow) button to apply the new URL configurations.

---

## 🔍 Verification & Monitoring

### Health Check
Visit `https://your-service.onrender.com/api/health` to confirm the backend is up. It should return status `ok` and the current timestamp.

### Scheduled Job Check
You can test scheduling via the extension panel or using the following PowerShell command:
```powershell
Invoke-RestMethod -Uri "https://your-service.onrender.com/api/schedule" -Method Post -ContentType "application/json" -Body '{"videoUrl":"https://www.instagram.com/reel/C-example","title":"Prod Test Schedule","scheduledAt":"2026-06-15T12:00:00.000Z","platform":"instagram"}'
```
You can then view the scheduled list via `https://your-service.onrender.com/api/schedule`.
