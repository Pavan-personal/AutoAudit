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

1. Clone repo: `git clone https://github.com/Pavan-personal/AutoAudit.git`
2. Install dependencies: `pnpm install`
3. Configure environment variables (see `.env.example`)
4. Run backend: `pnpm dev` (in `/backend`)
5. Run frontend: `pnpm dev` (in `/ui`)

## Environment Variables

```env
# Backend
DATABASE_URL=
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
JWT_SECRET=
OUMI_API_KEY=
KESTRA_WEBHOOK_URL=

# Frontend
VITE_API_URL=
```

## Live Demo

Visit [AutoAudit](https://your-domain.vercel.app) to see it in action.

## Contributing

Pull requests welcome! Please check existing issues or create a new one.

## License

MIT

---

Built for developers who value automation 🤖
