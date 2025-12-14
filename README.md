# AutoAudit 🚀

AI-powered GitHub workflow automation that scans codebases, assigns issues intelligently, and reviews PRs automatically.

## Features

- **Deep Codebase Scanning** - Oumi AI analyzes repositories for security vulnerabilities, performance issues, and code quality problems
- **Smart Issue Assignment** - AI analyzes contributor comments and auto-assigns qualified developers
- **AI PR Review** - Merge readiness scoring based on code quality, security, and best practices

## Tech Stack

### Frontend
- React + TypeScript
- Tailwind CSS
- Vite
- GSAP (animations)

### Backend
- Node.js + Express
- PostgreSQL + Prisma ORM
- GitHub OAuth & Webhooks

### AI & Automation
- **Oumi AI** - Deployed on Hugging Face for codebase scanning
- **OpenAI GPT-4o-mini** - Via Vercel AI Gateway for intent analysis
- **Kestra** - Workflow orchestration (Docker + ngrok)

### Deployment
- **Frontend/Backend** - Vercel
- **Database** - Vercel Postgres
- **AI Model** - Hugging Face
- **Workflows** - Docker (local) + ngrok

## How It Works

1. **Scan** - Connect repo → Oumi analyzes codebase → Auto-creates prioritized issues
2. **Assign** - Contributor comments → AI analyzes intent → Auto-assigns if qualified
3. **Review** - PR created → AI scores merge readiness → Confidence-based merging

## Architecture

```
GitHub → Webhooks → Backend (Vercel) → Kestra (Docker)
                  ↓
              Oumi AI (Hugging Face)
                  ↓
         OpenAI (via Vercel AI Gateway)
```

## Setup

### Prerequisites

This project requires several external services. Follow these steps:

#### 1. GitHub App Setup
- Create a GitHub App at `Settings > Developer settings > GitHub Apps`
- Enable webhooks for `issues` and `issue_comment` events
- Note your `Client ID`, `Client Secret`, and `Webhook Secret`

#### 2. Deploy Oumi AI on Hugging Face
- Fork or deploy the Oumi model to Hugging Face Inference API
- Get your Hugging Face API token from account settings

#### 3. Setup Vercel AI Gateway
- Create Vercel AI Gateway at `vercel.com/ai-gateway`
- Add OpenAI as provider and get your gateway URL
- Configure your OpenAI API key in the gateway

#### 4. Run Kestra Locally (Required for Issue Automation)
- Pull Kestra Docker image: `docker run --pull=always -p 8080:8080 kestra/kestra:latest server local`
- Kestra will run on `http://localhost:8080`
- Use ngrok to expose it: `ngrok http 8080`
- Copy the ngrok URL (e.g., `https://abc123.ngrok.io`) for `KESTRA_WEBHOOK_URL`

#### 5. Install & Run Project
1. Clone repo: `git clone https://github.com/Pavan-personal/AutoAudit.git`
2. Install dependencies: `pnpm install`
3. Configure environment variables (see below)
4. Run backend: `pnpm dev` (in `/backend`)
5. Run frontend: `pnpm dev` (in `/ui`)

> ⚠️ **Note:** Full automation requires Kestra (Docker), ngrok, GitHub App, Hugging Face, and Vercel AI Gateway. These are advanced setups but enable the complete workflow.

## Environment Variables

```env
# Backend (.env in /backend)
DATABASE_URL=postgresql://...
GITHUB_CLIENT_ID=your_github_app_client_id
GITHUB_CLIENT_SECRET=your_github_app_client_secret
GITHUB_WEBHOOK_SECRET=your_webhook_secret
JWT_SECRET=your_random_jwt_secret
OUMI_API_KEY=your_huggingface_api_key
KESTRA_WEBHOOK_URL=https://your-ngrok-url.ngrok.io/api/v1/executions/webhook/dev/github-issue-assignment/your_secret
BACKEND_URL=http://localhost:3000

# Frontend (.env in /ui)
VITE_API_URL=http://localhost:3000
```

### Kestra Workflow Setup
1. Access Kestra UI at `http://localhost:8080`
2. Create namespace `dev`
3. Import workflow from `kestra-workflow.yaml`
4. Add secrets in workflow: `OPENAI_API_KEY` and `WEBHOOK_SECRET_KEY`

## Live Demo

Visit [AutoAudit](https://your-domain.vercel.app) to see it in action.

## Contributing

Pull requests welcome! Please check existing issues or create a new one.

## License

MIT

---

Built for developers who value automation 🤖
