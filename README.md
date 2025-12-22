Note: This isn’t a README.  
It’s a build log, the journey of creating AutoAudit from zero, the roadblocks I hit, and the learnings that came with them.

# AutoAudit

AI-powered GitHub workflow automation that scans codebases, assigns issues intelligently, and reviews PRs automatically.

### Links
- [Oumi Model](https://pavannnnnnn-autoaudi-ai-oumi.hf.space)
- [autoaudit](https://autoauditai.vercel.app)
- [Backend with Vercel AI gateway support](https://autoauditserver.vercel.app/health)
- For kestra used docker container locally also took `ngrok` support

<br />

<img width="1470" alt="Screenshot 2025-12-14 at 10 37 06 PM" src="https://github.com/user-attachments/assets/2b7f722e-45fe-4a21-a554-efb2ae639548" />

### Issue automation live and codescan and github issue creation demo

[![Watch the demo](https://cdn.dribbble.com/userupload/21508690/file/original-bc94311cd15a4e840f4b57bddc73375c.gif)](https://drive.google.com/file/d/1UhYFBKqvOoQ2d9AnHQUuFtwaQyzjBnDt/view?usp=sharing)

#### Watch the above video to see the live demo of Kestra agent automatically whether asking for explanation about the approach to resolve issue or assigning issues to users based on their comments. This also covers the Codebase scan of the user's github repo and listing potential issues on UI, and after single click from dashboard creates github issues directly in their github repo.

### Getting Merge Readiness Score of a Pull request demo

[![Watch the demo](https://cdn.dribbble.com/userupload/21508690/file/original-bc94311cd15a4e840f4b57bddc73375c.gif)](https://drive.google.com/file/d/1Ztdi-Sxh4Iyfxa3g8nOabmQJjzSBnNJo/view)

## Features

- **Deep Codebase Scanning** - Oumi AI analyzes repositories for security vulnerabilities, performance issues, and code quality problems
- **Smart Issue Assignment** - AI analyzes contributor comments and auto-assigns qualified developers
- **AI PR Review** - Merge readiness scoring based on code quality, security, and best practices

### Overview of each feature

<img width="1470" height="956" alt="Screenshot 2025-12-14 at 11 13 00 PM" src="https://github.com/user-attachments/assets/866d1665-3cae-4aa0-b1a2-acdbfa00a837" />

### Flow of each feature

<img width="1470" height="956" alt="Screenshot 2025-12-14 at 11 13 19 PM" src="https://github.com/user-attachments/assets/1b3a096e-c2ab-4db4-875b-bf4bb9f0903e" />

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
<img width="1470" height="956" alt="Screenshot 2025-12-14 at 11 17 14 PM" src="https://github.com/user-attachments/assets/1761209d-fe3a-4ab7-88a3-0b077d1e5c26" />

### AI & Automation
- **Oumi AI** - Deployed on Hugging Face for codebase scanning
- **OpenAI GPT-4o-mini** - Via Vercel AI Gateway for intent analysis
- **Kestra** - Workflow orchestration (Docker + ngrok)

### Deployment
- **Frontend/Backend** - Vercel
- **Database** - Vercel Postgres
- **AI Model** - Hugging Face
- **Workflows** - Docker (local) + ngrok

### Dashboard

<img width="1470" height="956" alt="Screenshot 2025-12-14 at 10 45 33 PM" src="https://github.com/user-attachments/assets/827d3dc7-4d8e-45a6-ad11-60630b6fc8f0" />

### Manosor Grid 

<img width="1470" height="956" alt="Screenshot 2025-12-14 at 10 45 26 PM" src="https://github.com/user-attachments/assets/7eaa8b05-9cce-4f66-88f4-b1b9718ce327" />

## How It Works

1. **Scan** - Connect repo → Oumi analyzes codebase → Auto-creates prioritized issues
2. **Assign** - Contributor comments → AI analyzes intent → Auto-assigns if qualified
3. **Review** - PR created → AI scores merge readiness → Confidence-based merging

### All issues page

<img width="1470" height="956" alt="Screenshot 2025-12-14 at 10 50 41 PM" src="https://github.com/user-attachments/assets/905d7dc8-f2cc-4795-a3fd-630529c26454" />

### Clicking on Automate issue

<img width="1385" height="799" alt="Screenshot 2025-12-14 at 8 25 25 PM" src="https://github.com/user-attachments/assets/c10581f1-f008-4957-a841-744003af3dba" />

### Issue is Automated

<img width="1470" height="956" alt="Screenshot 2025-12-14 at 10 50 58 PM" src="https://github.com/user-attachments/assets/1fd37055-00a8-443e-9ed7-12a0c9fbd123" />

### Live example of automated Issue assignment (for automated issues only)

<img width="1470" height="956" alt="Screenshot 2025-12-14 at 10 50 14 PM" src="https://github.com/user-attachments/assets/56b02c39-e6d8-43bf-996f-ab0563d9c7a6" />

#### As seen above, the Kestra AI agent initially rejected a casual issue assignment request and asked for a clearer explanation. Once the user shared a solid approach in the comments, the issue was automatically assigned.

### Live example 2 (here user causually asked to assign him the issue, Kestra AI agent rejected!!!)

<img width="1470" height="956" alt="Screenshot 2025-12-14 at 10 49 33 PM" src="https://github.com/user-attachments/assets/7e7671da-368b-4825-b70e-a168b7898cee" />

### He again commented casually without mentioning his way to approach the issue, Kestra AI agent rejected!!!

<img width="1470" height="956" alt="Screenshot 2025-12-14 at 10 49 42 PM" src="https://github.com/user-attachments/assets/ddeee00c-597a-428f-aa76-0b9a0120cea1" />

### Third time user gave a valid approach to resolve the issue, Kestra AI agent now accepted and assigned!!!

<img width="1470" height="956" alt="Screenshot 2025-12-14 at 10 49 47 PM" src="https://github.com/user-attachments/assets/3cec0cb5-66f4-4996-84bd-40c623b3fb5b" />

### For more examples please refer this repo's issues itself and also these links as well

- https://github.com/Pavan-personal/WalletBuddy/issues/8
- https://github.com/Pavan-personal/WalletBuddy/issues/7
- https://github.com/Pavan-personal/WalletBuddy/issues/3

### Code review by Oumi (select upto 5 files)

<img width="1470" height="956" alt="Screenshot 2025-12-14 at 10 45 50 PM" src="https://github.com/user-attachments/assets/02c03c11-84e2-43b5-a44f-f15336696f40" />

### Select Files

<img width="1470" height="956" alt="Screenshot 2025-12-14 at 10 47 06 PM" src="https://github.com/user-attachments/assets/afa63c94-efd0-4fc8-98e8-5b27b670b3e8" />

### Oumi inference API giving list of issues as response

<img width="1470" height="956" alt="Screenshot 2025-12-14 at 10 50 32 PM" src="https://github.com/user-attachments/assets/b87f8b18-9814-4b93-982f-36f845074c27" />

### Complete codebase scan

<img width="1470" height="956" alt="Screenshot 2025-12-15 at 12 40 03 AM" src="https://github.com/user-attachments/assets/7f13011b-11a0-488a-8192-746723fbcabf" />

### PR Analysis page

<img width="1470" height="956" alt="Screenshot 2025-12-14 at 10 51 10 PM" src="https://github.com/user-attachments/assets/ee8a0228-6081-4420-9d70-24ab06f1c7ad" />

### Merge Readiness Score

<img width="1470" height="956" alt="Screenshot 2025-12-14 at 10 51 43 PM" src="https://github.com/user-attachments/assets/09a4610a-c673-454a-b62d-d33462f095f9" />

## Architecture

```
GitHub → Webhooks → Backend (Vercel) → Kestra (Docker)
                  ↓
              Oumi AI (Hugging Face)
                  ↓
         OpenAI (via Vercel AI Gateway)
```

## The Hardwork behind this product

### Hugging Face deploy instance of Oumi Inference API 

<img width="1470" height="956" alt="Screenshot 2025-12-14 at 8 19 49 PM" src="https://github.com/user-attachments/assets/a07a3cd4-8f9e-45e5-9b56-972e08b80f75" />

#### initially spent sleepless night on Railways site and fixed build errors and got out of memory issues later got to know about hugging face :)

### Vercel AI Gateway setup

<img width="1470" alt="Screenshot 2025-12-14 at 11 27 14 PM" src="https://github.com/user-attachments/assets/47f95f33-8186-4d68-9c04-26f2243b6ff0" />

### Billings and log history

<img width="1464" height="832" alt="Screenshot 2025-12-14 at 8 19 37 PM" src="https://github.com/user-attachments/assets/4d77f666-40a7-49b2-ae17-d28f97b28e24" />

### Vercel logs story

<img width="1470" height="956" alt="Screenshot 2025-12-14 at 8 22 01 PM" src="https://github.com/user-attachments/assets/a05caeaf-2fae-437f-956e-ea44f79d6242" />

#### To verify a GitHub App, HTTPS endpoints are required. During development we usually rely on localhost, so I tried port forwarding using tools like ngrok or Pinggy. However, these forwarded URLs sometimes trigger GitHub’s caution page, causing CORS issues. Since GitHub’s CORS can’t be modified, I ended up testing using deployed URLs only, pushing code and debugging via production logs. It was tough, but definitely an unforgettable experience.

### Kestra setup story (starting with running docker and ngrok instances)
<img width="1470" height="956" alt="Screenshot 2025-12-14 at 8 22 35 PM" src="https://github.com/user-attachments/assets/36387d93-6fd7-408a-af90-bc5e23da8db2" />

### Kestra flow using Kestra AI agent running 

<img width="1470" height="956" alt="Screenshot 2025-12-14 at 8 20 08 PM" src="https://github.com/user-attachments/assets/4d8e64c6-89a9-44c9-9b38-f32221394a3a" />

### Kestra snaps

<img width="1470" height="956" alt="Screenshot 2025-12-14 at 8 58 24 PM" src="https://github.com/user-attachments/assets/efc922c5-8967-4dca-8df3-c398f58e9896" />

### Some more Kestra snaps

<img width="1470" height="956" alt="Screenshot 2025-12-15 at 1 42 23 AM" src="https://github.com/user-attachments/assets/823756d3-082c-4f7c-8eaf-41c7b240112f" />

#### I initially faced multiple issues while deploying Kestra. Railway ran into memory limits, AWS Free Tier had long verification delays, and Oracle Cloud required a credit card. I finally used a Docker-based setup. Since the deployed URLs weren’t compatible, I used ngrok for port forwarding. This works locally, but anyone else testing it will need their own Kestra + ngrok setup.

### NeonDB setup

<img width="1470" height="956" alt="Screenshot 2025-12-14 at 10 58 57 PM" src="https://github.com/user-attachments/assets/31bdc88b-33e3-4de6-85e3-307dfc8f5a1f" />

### CodeRabbit Issue discussions

<img width="1470" height="956" alt="Screenshot 2025-12-14 at 10 46 39 PM" src="https://github.com/user-attachments/assets/7f3323b8-ac02-4364-a963-893d3bf69361" />

### CodeRabbit PR reviews

<img width="1470" alt="Screenshot 2025-12-15 at 12 49 57 AM" src="https://github.com/user-attachments/assets/f463f513-029c-4385-a98f-4d528f998578" />

## Setup for open source devs

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

Visit [AutoAudit](https://autoauditai.vercel.app) to see it in action.

Built for developers who value automation 🤖
