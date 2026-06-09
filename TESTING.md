# End-to-End Testing Guide

## Happy Path

1. Start the backend with `npm start` inside `backend/`.
2. Complete the OAuth authorization via `/api/auth/youtube`.
3. Load the Chrome extension from the `extension/` folder.
4. Open a YouTube watch or Shorts page.
5. Click **Upload Short**.
6. Confirm progress updates through downloading, Cloudinary upload, YouTube upload, cleanup, and completion.
7. Verify the returned YouTube link opens the uploaded video.
8. Confirm temporary files are removed from `backend/downloads/`.
9. Verify the Cloudinary asset is deleted after the upload process.

## Error Scenarios

- Invalid URL: open a non-YouTube page and verify the extension shows an error.
- Missing credentials: start the backend without `.env` values and verify proper error reporting.
- Network interruption: disable the network during the upload and confirm the error step returns a useful message.
- API quota exceeded: if quota is exceeded, verify the error is captured and the cleanup step still runs.

## Validation

- No console errors in the extension popup.
- The backend returns NDJSON events as progress updates.
- `tokens.json` is created on successful OAuth.
- `downloads/` directory remains clean after each run.
- `cloudinary` temp assets are removed within 24 hours by cron.
