# Deployment Checklist - Instagram Reels Feature

## 📋 Pre-Deployment

### Code Review
- [ ] All new files follow existing code style
- [ ] No hardcoded credentials in code
- [ ] Error messages are user-friendly
- [ ] All imports are correct and packages installed
- [ ] No console.log spam (only meaningful logs)
- [ ] Try-catch blocks handle all async operations

### Testing
- [ ] Backend starts without errors: `npm start`
- [ ] Extension loads in Chrome: `chrome://extensions`
- [ ] YouTube Short upload still works (regression test)
- [ ] Extension shows on Instagram reel pages
- [ ] Cookies can be uploaded and verified
- [ ] Single reel uploads successfully
- [ ] Batch upload processes multiple reels
- [ ] Quota increments after upload
- [ ] Quota resets after midnight UTC
- [ ] Error messages display correctly

### Dependencies
- [ ] All new packages installed: `npm install`
- [ ] Package-lock.json updated
- [ ] Docker builds successfully: `docker build -t test .`
- [ ] yt-dlp available in Docker image

---

## 🔒 Security Checklist

- [ ] No credentials in code comments
- [ ] `.gitignore` includes `/cookies` and `/quota` directories
- [ ] `backend/cookies/` is not tracked in git
- [ ] Environment variables documented in `.env.example`
- [ ] File upload endpoint validates file size (1MB limit)
- [ ] Downloaded reels deleted after upload
- [ ] Cloudinary temp files auto-delete after 24 hours
- [ ] No CORS issues (extension can reach backend)
- [ ] HTTPS enforced in production (not http://)

---

## 📦 Deployment Steps (Local → Render)

### Step 1: Prepare Repository
```bash
# Ensure git is clean
git status

# Add .gitignore updates
echo "
backend/cookies/
backend/quota/
" >> .gitignore

# Commit all changes
git add .
git commit -m "feat: Add Instagram Reels support"
git push origin main
```

### Step 2: Update Render Environment Variables
In Render dashboard for your service:

```
YOUTUBE_CLIENT_ID=your_existing_id
YOUTUBE_CLIENT_SECRET=your_existing_secret
YOUTUBE_REDIRECT_URI=https://your-render-app.onrender.com/api/auth/callback
CLOUDINARY_CLOUD_NAME=your_existing_name
CLOUDINARY_API_KEY=your_existing_key
CLOUDINARY_API_SECRET=your_existing_secret
MAX_DAILY_UPLOADS=10
```

### Step 3: Redeploy on Render
```bash
# Push to trigger auto-deploy (if connected to GitHub)
# OR manually redeploy in Render dashboard:
# Dashboard → Select service → Manual Deploy
```

### Step 4: Verify Deployment
```bash
# Check if backend is running
curl https://your-render-app.onrender.com/api/health

# Check quota endpoint
curl https://your-render-app.onrender.com/api/quota

# Should respond with JSON (no "Login required" errors yet)
```

### Step 5: Upload Instagram Cookies
```bash
# Export cookies from Chrome (see INSTAGRAM_REELS_GUIDE.md)
# Upload to production backend
curl -X POST -F "cookies=@cookies.txt" \
  https://your-render-app.onrender.com/api/instagram/cookies

# Verify
curl https://your-render-app.onrender.com/api/instagram/cookies/status
```

### Step 6: Update Extension Backend URL
In `extension/popup.js`, update BACKEND_URL:

```javascript
// OLD:
const BACKEND_URL = 'http://localhost:3000';

// NEW:
const BACKEND_URL = 'https://your-render-app.onrender.com';
```

Then reload extension in `chrome://extensions/`

### Step 7: Test in Production
1. Visit Instagram reel URL on production website
2. Click extension icon
3. Try single upload
4. Verify YouTube video created
5. Check quota: `curl https://your-render-app.onrender.com/api/quota`

---

## 🚨 Rollback Plan (If Issues)

### Issue: Backend crashes on deploy
```bash
# Option 1: Check Render logs
# Render Dashboard → Select service → Logs tab

# Option 2: Revert to previous version
git revert HEAD
git push origin main
# Render will redeploy previous commit
```

### Issue: Extension not loading
```bash
# Option 1: Reload extension
chrome://extensions/ → Find extension → Reload

# Option 2: Clear cache and reload
# Close and reopen Chrome
```

### Issue: Cookies not working
```bash
# Re-export and upload fresh cookies
curl -X POST -F "cookies=@cookies.txt" https://your-render-app.onrender.com/api/instagram/cookies
```

---

## 📊 Post-Deployment Monitoring

### Daily Checks
- [ ] Backend health: `/api/health` returns `{ status: 'ok' }`
- [ ] Extension working on YouTube pages
- [ ] Extension working on Instagram pages
- [ ] At least 1 test upload successful

### Weekly Checks
- [ ] Quota tracking accurate
- [ ] No orphaned Cloudinary files
- [ ] No large log files accumulating
- [ ] Error messages appear in logs

### Monthly Checks
- [ ] Cookies still working (or refresh)
- [ ] YouTube API quota not exceeded
- [ ] Cloudinary storage usage acceptable
- [ ] No outstanding error patterns

---

## 📝 Documentation Updates

- [ ] Update main README with Instagram feature
- [ ] Add screenshots to guide (optional)
- [ ] Update deployment instructions if needed
- [ ] Create user guide for end-users
- [ ] Add troubleshooting section to main docs

---

## 🎯 Completion Checklist

- [ ] All tests passing locally
- [ ] All files committed and pushed
- [ ] Render deployment successful
- [ ] Production backend responding
- [ ] Extension updated with production URL
- [ ] Instagram cookies uploaded to production
- [ ] Single reel test upload successful
- [ ] Batch upload tested
- [ ] Quota system working
- [ ] All documentation complete
- [ ] Team notified of new feature

---

## 📞 Support Resources

If issues arise:

1. **Extension not showing on Instagram**: Clear manifest cache, reload extension
2. **Cookies expired**: Re-export from Chrome and re-upload
3. **Rate limited**: Wait 15 minutes, automatic retry built-in
4. **Backend down**: Check Render logs, rollback if needed
5. **YouTube upload failed**: Check YouTube quota/API key

See **INSTAGRAM_REELS_GUIDE.md** for full troubleshooting.

---

## 🎉 Success Criteria

✅ Feature is deployed when:
- ✅ Backend responds to all 5 new endpoints
- ✅ Extension loads on Instagram pages
- ✅ At least 1 Instagram reel uploaded to YouTube
- ✅ Quota tracking working
- ✅ No errors in production logs
- ✅ Documentation complete
- ✅ Team trained on new endpoints

