# Verify Your Existing GitHub App

You already have a GitHub App called "AutoAuditAI"! ✅

Now we just need to verify it's configured correctly and get the credentials.

---

## Step 1: Open Your GitHub App Settings

1. Click on **"AutoAuditAI"** (or click the **"Edit"** button)
2. This will open the app settings page

---

## Step 2: Verify OAuth Authorization is Enabled

Scroll down to the section: **"Identifying and authorizing users"**

**Check these settings:**

✅ **Request user authorization (OAuth) during installation** - Should be **CHECKED**

✅ **Callback URL** - Should be: `https://autoauditserver.vercel.app/api/auth/github/callback`

✅ **Expire user authorization tokens** - Optional (can be checked or unchecked)

---

## Step 3: Verify Permissions

Scroll to the **"Permissions"** section:

### Repository permissions:
- ✅ **Contents**: Should be **Read-only** (to read repository files)
- ✅ **Issues**: Should be **Read and write** (to create issues) ⚠️ **IMPORTANT!**
- ✅ **Metadata**: Should be **Read-only** (automatic)

### Account permissions:
- ✅ **Email addresses**: Should be **Read-only** (to get user email)

**If any permissions are missing or wrong, update them and click "Save changes"**

---

## Step 4: Get Your Credentials

Scroll down on the app settings page:

1. **Find "Client ID"** (NOT "App ID")
   - Copy this value
   - This is your `GITHUB_CLIENT_ID`

2. **Generate or View "Client Secret"**
   - If you see "Client secrets" section
   - Click **"Generate a new client secret"** if you don't have one
   - **Copy it immediately** (you can only see it once!)
   - This is your `GITHUB_CLIENT_SECRET`

---

## Step 5: Update Vercel Environment Variables

1. Go to Vercel Dashboard
2. Select your backend project (`autoauditserver`)
3. Go to **Settings** → **Environment Variables**
4. Update these variables:
   - `GITHUB_CLIENT_ID` → Paste your GitHub App's Client ID
   - `GITHUB_CLIENT_SECRET` → Paste your GitHub App's Client Secret
5. Vercel will automatically redeploy

---

## Step 6: Test It!

1. Log out from your app
2. Log back in with GitHub
3. Try creating an issue
4. It should work! ✅

---

## Quick Checklist

- [ ] OAuth authorization is enabled in GitHub App
- [ ] Callback URL is correct
- [ ] Permissions: Issues (Read and write), Contents (Read-only)
- [ ] Copied Client ID from GitHub App
- [ ] Generated/Copied Client Secret from GitHub App
- [ ] Updated Vercel environment variables
- [ ] Tested login and issue creation

---

## If Something is Wrong

### Issue: "Request user authorization" is NOT checked
- **Fix:** Check the box and click "Save changes"

### Issue: Permissions are wrong
- **Fix:** Update permissions (Issues: Read and write, Contents: Read-only) and save

### Issue: Can't find Client ID/Secret
- **Fix:** Scroll down on the app settings page - they're below the permissions section

### Issue: Still getting 403 errors
- **Fix:** Make sure you're using the GitHub App's Client ID/Secret (not OAuth App's)
- **Fix:** Verify the token starts with `ghu_` after logging in (check database or logs)
