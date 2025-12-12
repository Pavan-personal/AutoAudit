# Oumi Code Analysis API

FastAPI service for analyzing code files and detecting bugs, security issues, and other problems.

## Deployed Endpoint

**API URL:** `https://pavannnnnnn-autoaudi-ai-oumi.hf.space/api/analyze`

## Request Payload

```json
{
  "files": [
    {
      "path": "example.py",
      "content": "def calculate():\n    return 10 / 0"
    }
  ],
  "options": {
    "type": ["bugs", "security"],
    "userPrompt": "Check for division by zero errors"
  }
}
```

**Fields:**
- `files`: Array of file objects with `path` (string) and `content` (string)
- `options.type`: Array of analysis types - `["bugs"]`, `["security"]`, `["linting"]`, etc. (optional, defaults to `["bugs"]`)
- `options.userPrompt`: Custom instruction for analysis (optional)

## Response Format

```json
{
  "summary": {
    "total_files": 1,
    "total_issues": 2,
    "files_with_issues": 1,
    "powered_by": "Oumi Inference Engine"
  },
  "results": [
    {
      "file": "example.py",
      "status": "success",
      "issues": [
        {
          "title": "Division by Zero: example.py",
          "body": "## File\n`example.py`\n\n## Priority\n**HIGH**\n\n## Type\nbugs\n\n---\n\nLine 2: Division by zero error...",
          "tags": []
        }
      ],
      "powered_by": "Oumi Inference Engine",
      "model": "gpt-4o-mini"
    }
  ]
}
```

## Run Locally with Docker

1. **Set environment variable:**
   ```bash
   export OPENAI_API_KEY="your-api-key-here"
   ```

2. **Build Docker image:**
   ```bash
   docker build -t oumi-api .
   ```

3. **Run container:**
   ```bash
   docker run -p 7860:7860 -e OPENAI_API_KEY=$OPENAI_API_KEY oumi-api
   ```

4. **Test the API:**
   ```bash
   curl -X POST http://localhost:7860/api/analyze \
     -H "Content-Type: application/json" \
     -d '{"files": [{"path": "test.py", "content": "x = 1/0"}]}'
   ```

API will be available at `http://localhost:7860`
