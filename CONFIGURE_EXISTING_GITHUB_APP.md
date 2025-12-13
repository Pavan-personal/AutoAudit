# Configure Your Existing GitHub App

## ✅ Good News!
You already have a **GitHub App** named "AutoAuditAI" - this is the **correct type**! You do NOT need to create an OAuth App.

---

## Step 1: Open Your GitHub App Settings

1. Go to: GitHub → Settings → Developer settings → **GitHub Apps**
2. Click on **"AutoAuditAI"** (or click the **"Edit"** button)
3. You'll see the app configuration page

---

## Step 2: Verify OAuth Authorization is Enabled

Scroll down to the section: **"Identifying and authorizing users"**

**Check these settings:**

1. ✅ **"Request user authorization (OAuth) during installation"** 
   - This MUST be **CHECKED** ✅
   - If it's not checked, check it now and save

2. ✅ **"Callback URL"**
   - Should be: `https://autoauditserver.vercel.app/api/auth/github/callback`
   - Or your backend callback URL
   - Make sure it matches your `GITHUB_CALLBACK_URL` environment variable

3. ✅ **"Expire user authorization tokens"** (optional)
   - You can leave this unchecked for now
   - If checked, tokens expire after 8 hours and you'll need refresh tokens

---

## Step 3: Verify Permissions

Scroll to the **"Permissions"** section:

### Repository Permissions:
- ✅ **Contents**: `Read-only` (to read repository files)
- ✅ **Issues**: `Read and write` (to create issues) ← **CRITICAL!**
- ✅ **Metadata**: `Read-only` (automatic, always enabled)

### Account Permissions:
- ✅ **Email addresses**: `Read-only` (to get user email)

**If any of these are missing or wrong:**
1. Update the permissions
2. Click **"Save changes"** at the bottom
3. Users will need to re-authorize after permission changes

---

## Step 4: Get Your Client ID and Client Secret

Scroll down on the app settings page:

1. **Find "Client ID"** (NOT "App ID")
   - It's a long number/string
   - **Copy this value** - this is your `GITHUB_CLIENT_ID`

2. **Find "Client secrets"** section
   - If you see "Generate a new client secret" button:
     - Click it
     - **Copy the secret immediately** (you can only see it once!)
     - This is your `GITHUB_CLIENT_SECRET`
   - If you already have one and don't remember it:
     - You'll need to generate a new one
     - The old one will stop working after you generate a new one

---

## Step 5: Update Environment Variables in Vercel

1. Go to **Vercel Dashboard**
2. Select your **backend project** (`autoauditserver`)
3. Go to **Settings** → **Environment Variables**

4. **Update these variables:**
   - `GITHUB_CLIENT_ID` → Paste your GitHub App's Client ID
   - `GITHUB_CLIENT_SECRET` → Paste your GitHub App's Client Secret
   - `GITHUB_CALLBACK_URL` → Should be: `https://autoauditserver.vercel.app/api/auth/github/callback`
   - `FRONTEND_URL` → Should be: `https://autoauditai.vercel.app`

5. **Save** the environment variables

6. **Redeploy:**
   - Vercel will auto-redeploy, or
   - Go to **Deployments** tab and click **"Redeploy"**

---

## Step 6: Test It!

1. **Log out** from your app (if logged in)
2. **Log back in** with GitHub
3. You should see a different authorization screen (GitHub App authorization)
4. After login, try creating an issue
5. It should work! ✅

---

## How to Verify It's Working

After a user logs in, check the token type:

1. **Check your database** - look at the `githubToken` field in the `User` table
2. **Token should start with `ghu_`** → ✅ GitHub App user access token (correct!)
3. **If token is random string** → ❌ Still using OAuth App (wrong)

Or check your backend logs - you should see tokens starting with `ghu_` after login.

---

## Troubleshooting

### Issue: Still getting "Resource not accessible by integration"
- **Check:** Make sure "Issues: Read and write" permission is set
- **Check:** Users need to re-authorize after permission changes
- **Check:** Make sure you're using the GitHub App's Client ID/Secret, not an OAuth App's

### Issue: Token doesn't start with "ghu_"
- **Check:** Make sure "Request user authorization (OAuth) during installation" is checked
- **Check:** Make sure you're using GitHub App credentials, not OAuth App credentials
- **Solution:** Log out and log back in to get a new token

### Issue: Callback URL mismatch
- **Check:** The callback URL in GitHub App settings must exactly match `GITHUB_CALLBACK_URL`
- **Check:** No trailing slashes, exact match required

---

## Summary

✅ You have a GitHub App (correct!)
❌ You do NOT need an OAuth App
✅ Just configure your existing GitHub App:
   - Enable OAuth authorization
   - Set correct permissions (Issues: Write)
   - Get Client ID and Secret
   - Update Vercel environment variables
   - Test it!

---

## Quick Checklist

- [ ] Opened GitHub App "AutoAuditAI" settings
- [ ] Verified "Request user authorization (OAuth)" is checked
- [ ] Verified Callback URL is correct
- [ ] Verified permissions: Issues (Write), Contents (Read)
- [ ] Copied Client ID
- [ ] Generated and copied Client Secret
- [ ] Updated Vercel environment variables
- [ ] Redeployed backend
- [ ] Tested login
- [ ] Verified token starts with `ghu_`
- [ ] Tested issue creation
