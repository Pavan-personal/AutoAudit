# Deploy Oumi Code Analyzer to Hugging Face Spaces

## 🚀 Quick Deploy Guide

### Step 1: Create Hugging Face Account
1. Go to: https://huggingface.co/join
2. Sign up (free)
3. Verify your email

### Step 2: Create a New Space
1. Go to: https://huggingface.co/spaces
2. Click **"Create new Space"**
3. Fill in:
   - **Space name**: `oumi-code-analyzer` (or your choice)
   - **SDK**: Select **"Docker"**
   - **Hardware**: **CPU Basic** (free, 16GB RAM)
   - **Visibility**: **Public** (required for free tier)
4. Click **"Create Space"**

### Step 3: Upload Your Code
You have two options:

#### Option A: Git Push (Recommended)
1. In your Space, click **"Files and versions"** tab
2. Click **"Add file"** → **"Upload files"**
3. Upload these files from `/oumi` folder:
   - `app.py`
   - `analyzer.py`
   - `requirements.txt`
   - `Dockerfile`
   - `.dockerignore` (optional but recommended)

#### Option B: Connect GitHub (Auto-deploy)
1. In Space settings, connect your GitHub repo
2. Set **Root directory** to: `oumi`
3. Auto-deploys on every push

### Step 4: Set Environment Variables
1. Go to your Space → **Settings** tab
2. Scroll to **"Repository secrets"**
3. Click **"New secret"**
4. Add:
   - **Key**: `OPENAI_API_KEY`
   - **Value**: Your actual OpenAI API key (starts with `sk-`)
5. Click **"Add secret"**

### Step 5: Wait for Build
- Build takes **15-30 minutes** (ML dependencies are large)
- Watch the **"Logs"** tab for progress
- You'll see: "Building..." → "Deploying..." → "Running"

### Step 6: Your API is Live!
Once deployed, your API will be at:
```
https://yourusername-oumi-code-analyzer.hf.space
```

## 📡 API Endpoints

### Health Check
```bash
GET https://your-space.hf.space/health
```

### Root
```bash
GET https://your-space.hf.space/
```

### Analyze Code
```bash
POST https://your-space.hf.space/api/analyze
Content-Type: application/json

{
  "files": [
    {
      "path": "test.py",
      "content": "def hello():\n  print('hi')"
    }
  ],
  "options": {
    "type": ["bugs", "security"],
    "userPrompt": "Focus on production readiness"
  }
}
```

## 🔧 Troubleshooting

### Build Fails
- Check logs for error messages
- Verify `requirements.txt` has all dependencies
- Ensure `Dockerfile` is correct

### Import Errors
- Check `OPENAI_API_KEY` is set in Secrets
- Verify Python version (3.12) in Dockerfile
- Check logs for specific error messages

### Port Issues
- Hugging Face Spaces **requires port 7860**
- Don't use `$PORT` variable
- Fixed port: `7860`

## 📝 Files Required

Make sure these files are in your Space:
- ✅ `Dockerfile` (required)
- ✅ `app.py` (your FastAPI app)
- ✅ `analyzer.py` (your analyzer)
- ✅ `requirements.txt` (dependencies)

## 🎯 Quick Test

After deployment, test with:
```bash
curl https://your-space.hf.space/health
# Should return: {"status":"healthy"}
```

## 💡 Tips

1. **First build takes 20-30 minutes** (installing PyTorch, etc.)
2. **Subsequent builds are faster** (cached layers)
3. **16GB RAM is plenty** for your ML app
4. **Always on** - no sleeping like Render free tier
5. **Public repo required** for free tier

## 🔗 Your API URL Format

```
https://[your-username]-[space-name].hf.space
```

Example:
```
https://pavan-oumi-code-analyzer.hf.space
```

---

**Need help?** Check Hugging Face Spaces docs: https://huggingface.co/docs/hub/spaces
