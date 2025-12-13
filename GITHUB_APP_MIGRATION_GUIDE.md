# GitHub App Migration Guide

## Overview
This guide will help you migrate from an OAuth App to a GitHub App to enable proper issue creation with user access tokens.

---

## Step 1: Document Your Current OAuth App Credentials

**Before creating the new GitHub App, save your current OAuth App details:**

1. Go to GitHub → Settings → Developer settings → OAuth Apps
2. Find your current OAuth App
3. **Write down these values** (you'll need them temporarily):
   - **Client ID**: `_________________`
   - **Client Secret**: `_________________` (if you have it)
   - **Callback URL**: `_________________`

**Note:** Keep the OAuth App active for now. We'll delete it after confirming the GitHub App works.

---

## Step 2: Create a New GitHub App

1. **Go to GitHub Settings:**
   - Click your profile picture (top right)
   - Click **Settings**
   - In the left sidebar, click **Developer settings**
   - Click **GitHub Apps** (NOT "OAuth Apps")
   - Click **New GitHub App**

2. **Fill in Basic Information:**
   - **GitHub App name**: `AutoAudit` (or your preferred name)
   - **Homepage URL**: `https://autoauditai.vercel.app` (your frontend URL)
   - **User authorization callback URL**: `https://autoauditserver.vercel.app/api/auth/github/callback` (your backend callback URL)
   - **Webhook URL** (optional): `https://autoauditserver.vercel.app/api/webhook/github` (if you're using webhooks)
   - **Webhook secret** (optional): Generate a random string and save it

3. **Configure Permissions:**
   - **Repository permissions:**
     - **Contents**: `Read-only` (to read repository files)
     - **Issues**: `Read and write` (to create issues)
     - **Metadata**: `Read-only` (automatic, required)
   - **Account permissions:**
     - **Email addresses**: `Read-only` (to get user email)

4. **Where can this GitHub App be installed?**
   - Select: **Only on this account** (or **Any account** if you want others to install it)

5. **Click "Create GitHub App"**

---

## Step 3: Get Your GitHub App Credentials

After creating the app, you'll see the app settings page:

1. **Client ID** (different from App ID):
   - Scroll down to find **Client ID**
   - **Copy this value** - this is what you'll use for `GITHUB_CLIENT_ID`

2. **Generate Client Secret:**
   - Scroll to **Client secrets** section
   - Click **Generate a new client secret**
   - **Copy the secret immediately** (you can only see it once!)
   - This is what you'll use for `GITHUB_CLIENT_SECRET`

3. **App ID** (you might need this later):
   - Note the **App ID** number (different from Client ID)
   - You might need this for advanced features

4. **Private Key** (optional, for installation tokens):
   - If you need installation tokens later, click **Generate a private key**
   - Save the `.pem` file securely (you'll only see it once)

---

## Step 4: Update Environment Variables

### For Local Development:

1. Update your `.env` file in the `backend` folder:
   ```env
   GITHUB_CLIENT_ID=your_new_github_app_client_id
   GITHUB_CLIENT_SECRET=your_new_github_app_client_secret
   GITHUB_CALLBACK_URL=https://autoauditserver.vercel.app/api/auth/github/callback
   FRONTEND_URL=https://autoauditai.vercel.app
   ```

### For Vercel Deployment:

1. **Go to Vercel Dashboard:**
   - Navigate to your backend project (`autoauditserver`)
   - Go to **Settings** → **Environment Variables**

2. **Update these variables:**
   - `GITHUB_CLIENT_ID` → Set to your new GitHub App Client ID
   - `GITHUB_CLIENT_SECRET` → Set to your new GitHub App Client Secret
   - `GITHUB_CALLBACK_URL` → Should already be correct
   - `FRONTEND_URL` → Should already be correct

3. **Redeploy:**
   - After updating environment variables, Vercel will automatically redeploy
   - Or manually trigger a redeploy from the Deployments tab

---

## Step 5: Test the Migration

1. **Clear existing sessions:**
   - Users will need to log out and log back in
   - This will generate new tokens using the GitHub App

2. **Test login:**
   - Go to your frontend
   - Click "Login with GitHub"
   - Complete the authorization flow
   - You should see a different authorization screen (GitHub App instead of OAuth App)

3. **Test issue creation:**
   - Navigate to a repository
   - Select files and analyze
   - Try creating a GitHub issue
   - It should work now! ✅

---

## Step 6: Handle Existing Users (Optional)

**Existing users with OAuth tokens:**
- They will need to log out and log back in to get new GitHub App user access tokens
- The code supports both token types, so existing tokens will work temporarily
- But for issue creation, they need the new GitHub App tokens

**You can either:**
- Let users naturally re-authenticate when they use the app
- Or add a notice in the UI prompting users to re-authenticate

---

## Step 7: Clean Up Old OAuth App (After Testing)

**Only after confirming everything works:**

1. Go to GitHub → Settings → Developer settings → OAuth Apps
2. Find your old OAuth App
3. Click on it
4. Scroll to the bottom
5. Click **Delete OAuth App**
6. Confirm deletion

**Note:** This will invalidate any existing OAuth tokens, so make sure all users have re-authenticated first.

---

## Troubleshooting

### Issue: "Resource not accessible by integration"
- **Solution:** Make sure you're using the GitHub App's Client ID/Secret, not the OAuth App's
- **Solution:** Check that the GitHub App has "Issues: Read and write" permission

### Issue: Token doesn't start with "ghu_"
- **Solution:** You might still be using OAuth App credentials. Double-check your environment variables.

### Issue: Users can't see repositories
- **Solution:** Make sure the GitHub App has "Contents: Read-only" permission
- **Solution:** Users need to authorize the app on their account

### Issue: Callback URL mismatch
- **Solution:** The callback URL in GitHub App settings must exactly match `GITHUB_CALLBACK_URL` environment variable

---

## Key Differences: OAuth App vs GitHub App

| Feature | OAuth App | GitHub App |
|---------|-----------|------------|
| **Token Type** | OAuth token | User access token (ghu_) |
| **Authentication** | `token TOKEN` | `Bearer TOKEN` |
| **Permissions** | Scopes (broad) | Fine-grained permissions |
| **Token Format** | Random string | Starts with `ghu_` |
| **Issue Creation** | Requires `repo` scope | Requires `Issues: Write` permission |
| **Better Security** | ❌ | ✅ (fine-grained permissions) |

---

## Summary Checklist

- [ ] Documented old OAuth App credentials
- [ ] Created new GitHub App
- [ ] Configured permissions (Issues: Write, Contents: Read)
- [ ] Copied Client ID and Client Secret
- [ ] Updated environment variables in Vercel
- [ ] Redeployed backend
- [ ] Tested login flow
- [ ] Tested issue creation
- [ ] (Optional) Deleted old OAuth App

---

## Need Help?

If you encounter issues:
1. Check Vercel logs for errors
2. Verify environment variables are set correctly
3. Make sure the GitHub App has the correct permissions
4. Ensure callback URLs match exactly
