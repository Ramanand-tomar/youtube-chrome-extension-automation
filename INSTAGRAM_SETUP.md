# Environment Variables Documentation

## Backend Configuration (.env)

```env
# YouTube OAuth Configuration
YOUTUBE_CLIENT_ID=your_youtube_client_id
YOUTUBE_CLIENT_SECRET=your_youtube_client_secret
YOUTUBE_REDIRECT_URI=http://localhost:3000/api/auth/callback

# Cloudinary Configuration
CLOUDINARY_CLOUD_NAME=your_cloudinary_name
CLOUDINARY_API_KEY=your_cloudinary_key
CLOUDINARY_API_SECRET=your_cloudinary_secret

# Server Configuration
PORT=3000

# Daily Upload Quota (Max Instagram Reels per day)
MAX_DAILY_UPLOADS=10
```

## Instagram Reels Configuration

### Authentication Method 1: Browser Cookies (Recommended)
1. Export cookies from Chrome using a cookie manager extension
2. Save as `cookies.txt`
3. Upload via the extension or via API endpoint:
   ```bash
   curl -X POST -F "cookies=@cookies.txt" http://localhost:3000/api/instagram/cookies
   ```

### Authentication Method 2: App Password
- Set up a separate Instagram App on Facebook Developers
- Follow yt-dlp Instagram documentation for app credentials

## API Endpoints

### YouTube Shorts
- `POST /api/process` - Upload single YouTube Short
- `GET /api/auth/youtube` - Get YouTube OAuth URL
- `GET /api/auth/callback` - YouTube OAuth callback

### Instagram Reels
- `POST /api/process-batch` - Batch upload Instagram Reels (sequential)
- `GET /api/instagram/cookies/status` - Check cookies status
- `POST /api/instagram/cookies` - Upload cookies file
- `DELETE /api/instagram/cookies` - Delete cookies

### Quota Management
- `GET /api/quota` - Get current daily quota status

## Notes

- Instagram rate limiting: Automatic delays (2-5s) between downloads
- Daily quota resets at midnight UTC
- Cloudinary temporary files auto-delete after 24 hours
- All downloaded videos deleted after successful upload
- Cookies stored in `/backend/cookies/` (not in version control)
