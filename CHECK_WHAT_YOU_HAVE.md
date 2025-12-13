# How to Check What You Currently Have

## Important Distinction

There are **TWO different types of apps** in GitHub:

1. **OAuth Apps** → Located in: Settings → Developer settings → **OAuth Apps**
2. **GitHub Apps** → Located in: Settings → Developer settings → **GitHub Apps**

---

## Step 1: Check What You Have

### Option A: You Have an OAuth App

1. Go to: GitHub → Settings → Developer settings → **OAuth Apps**
2. Do you see your app listed here?
   - ✅ **YES** → You have an **OAuth App** (wrong type)
   - ❌ **NO** → Continue to Option B

**If you have an OAuth App:**
- You need to create a **GitHub App** (different section)
- The OAuth App cannot generate user access tokens (ghu_)
- You'll need to create a new GitHub App

---

### Option B: You Have a GitHub App

1. Go to: GitHub → Settings → Developer settings → **GitHub Apps**
2. Do you see your app listed here?
   - ✅ **YES** → You have a **GitHub App** (correct type!)
   - ❌ **NO** → You need to create one

**If you have a GitHub App:**
- Check if "Request user authorization (OAuth) during installation" is checked
- If YES → You're good! Just need to verify permissions
- If NO → Enable it

---

## Step 2: Verify Your GitHub App Settings

If you already have a GitHub App, check these:

### 1. Check Permissions
- Go to your GitHub App settings
- Scroll to **Repository permissions**
- Verify:
  - ✅ **Contents**: Read-only
  - ✅ **Issues**: Read and write
  - ✅ **Metadata**: Read-only (automatic)

### 2. Check OAuth Authorization
- Scroll to **Identifying and authorizing users**
- Verify:
  - ✅ **Request user authorization (OAuth) during installation** is **CHECKED**
  - ✅ **Callback URL** is set correctly

### 3. Get Your Credentials
- Scroll down to find **Client ID** (NOT App ID)
- Generate a **Client Secret** if you don't have one
- These are what you use for `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`

---

## Step 3: What to Do Based on What You Have

### Scenario 1: You Have an OAuth App (Wrong Type)
**Action:** Create a new GitHub App
- Go to: Developer settings → **GitHub Apps** → New GitHub App
- Follow the migration guide

### Scenario 2: You Have a GitHub App WITHOUT OAuth Enabled
**Action:** Edit your existing GitHub App
- Go to your GitHub App settings
- Check ✅ **Request user authorization (OAuth) during installation**
- Verify permissions are correct
- Save changes

### Scenario 3: You Have a GitHub App WITH OAuth Enabled ✅
**Action:** Just update environment variables
- Get your Client ID and Client Secret from the GitHub App
- Update Vercel environment variables
- Test it!

---

## Quick Test: What Token Type Do You Get?

After logging in, check what type of token you receive:

1. **Token starts with `ghu_`** → ✅ GitHub App user access token (correct!)
2. **Token is random string** → ❌ OAuth App token (wrong type)

You can check this in your database or logs after a user logs in.

---

## Summary

- **OAuth App** ≠ **GitHub App** (they're different!)
- **GitHub App** can have OAuth authorization enabled (the checkbox)
- If you already have a GitHub App with OAuth enabled → Just verify permissions and update credentials
- If you have an OAuth App → Create a new GitHub App
