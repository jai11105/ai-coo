# AI Powered COO

**AI-Powered Business Operations & Decision Intelligence Platform for SMEs**

AI Powered COO is a mobile-first business intelligence platform designed to help small and medium-sized businesses manage daily operations, understand business performance, record transactions through voice, and make informed operational decisions using Meta AI models.

---

## Project Links

- **GitHub Repository:** https://github.com/jai11105/ai-coo
- **YouTube Demo:** https://youtu.be/YXA3hcqSn14
- **Deployment:** No public deployment is required. The application can be cloned and run locally.

## Project Overview

Small businesses often rely on disconnected tools and manual tracking to understand their operations. AI Powered COO brings business management, analytics, voice-based transaction entry, and intelligent decision support together in one platform.

The application combines deterministic business analytics with AI-powered reasoning to help business owners understand performance, identify operational issues, and make informed decisions.

---

## Key Features

### 1. Business Intelligence Dashboard
- Sales, gross profit, expenses and net profit KPIs.
- Interactive charts for business performance.
- Custom date range and predefined date filters.
- Transaction slicers for Sales, Purchases and Expenses.
- Business performance insights.

### 2. Transaction Ledger
- Record sales, purchases and expenses.
- Product-level transaction details.
- Buying cost, selling price and gross profit calculations.
- Centralized transaction history.
- Saved transactions reflected in business analytics.

### 3. Voice-Based Log Entry
- Record business transactions through voice.
- Audio transcription.
- AI-powered structured transaction extraction.
- Review extracted transaction details before saving.
- Saved entries update the ledger and dashboard.

### 4. AI COO Copilot
- Ask business questions using natural language.
- Understand business performance through AI-generated explanations.
- Root Cause Analysis (RCA).
- Executive directives and recommendations.
- Multi-model AI orchestration.
- Voice-based question input.

### 5. AI Promotional Image Generation
- Generate promotional images for business use through Meta AI image generation.

---

## Technology Stack

- Next.js 14
- React 18
- TypeScript
- Tailwind CSS
- Supabase Authentication
- Supabase Database
- Meta AI models
- Baseten inference
- Fireworks inference

---

## Getting Started

The application is not publicly hosted. Evaluators can clone the GitHub repository, configure their own Supabase project and required AI provider credentials, and run the application locally.

### Prerequisites

- Node.js and npm
- Git
- A Supabase account and project
- API credentials for the AI provider integrations you want to evaluate

### Step 1: Clone the repository

```bash
git clone https://github.com/jai11105/ai-coo.git
cd ai-coo
```

### Step 2: Install dependencies

```bash
npm ci
```

### Step 3: Configure environment variables

Create a `.env.local` file in the project root.

Use `.env.example` as the reference for the exact environment variable names required by the application.

Do not commit `.env.local` or private API credentials to GitHub.

---

## Supabase Configuration — Use Your Own Project

The application uses Supabase for authentication and database operations.

Evaluators do not need access to the developer's Supabase project. You can connect your own Supabase project by following these steps.

### 1. Create a Supabase project

1. Visit https://supabase.com/
2. Sign in or create an account.
3. Create a new Supabase project.
4. Choose your project name, database password and region.
5. Wait for the project to finish provisioning.

### 2. Get your Supabase credentials

Open your Supabase project and navigate to **Project Settings → API**.

Copy:

- Project URL
- Publishable Key (or legacy anon key, if applicable)

Add them to your `.env.local` file using the variable names expected by `.env.example`.

Example:

```env
NEXT_PUBLIC_SUPABASE_URL=YOUR_SUPABASE_PROJECT_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_SUPABASE_PUBLISHABLE_OR_ANON_KEY
```

The variable names above are illustrative. Follow the exact names in the repository's `.env.example` if they differ.

**Security:** Never expose your Supabase service-role key or secret key in frontend code, public repositories, or client-side environment variables.

### 3. Configure the database

A new Supabase project does not automatically contain the database structure required by this application.

The application expects compatible:
- Database tables and columns.
- Relationships and constraints.
- Authentication and business-user relationships.
- Row Level Security (RLS) policies.
- Required database functions and other dependencies, where applicable.

Apply the database schema, migrations and RLS setup required by the application using the SQL setup files provided in the repository.

Use the same schema expected by the application. Simply connecting an empty Supabase project is not sufficient.

### 4. Create an authentication user

Users from the developer's Supabase project are not automatically transferred to another Supabase project.

In your own Supabase project:

1. Open Authentication → Users.
2. Create a test user.
3. Complete any required business/profile and membership setup according to the application's database structure.
4. Use the new user's credentials to sign in.

### 5. Restart the application

After configuring `.env.local`, run:

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

Sign in using the test account created in your own Supabase project.

---

## AI Architecture & Model Orchestration

The application uses Meta AI models for its runtime AI capabilities. Baseten and Fireworks act as inference providers hosting Meta models.

### Model and Provider Mapping

| Provider | Model | Responsibility |
|---|---|---|
| Meta API | Muse Spark Standard (`muse-spark-1.3`) | Primary COO reasoning and final response composition |
| Meta API | Muse Spark 1.3-Contributor (`muse-spark-1.3-contributor`) | Log Entry structured transaction extraction only |
| Meta API | Muse Voice Transcribe 1.0 | Audio transcription for Log Entry and Copilot voice questions |
| Meta API | Muse Image 1.0 (`muse-image-1.0`) | AI promotional image generation |
| Baseten | `meta-models/muse-spark-open-1026` | Specialist analysis, RCA, priorities, recommendations, reports, what-if analysis and peak-hour analysis |
| Fireworks | `accounts/fireworks/models/muse-spark-open` | Fallback answer model |

### AI Orchestration Approach

- Deterministic analytics and business evidence are prepared by the application.
- AI models interpret business context and generate explanations and recommendations.
- Specialized workflows handle transaction extraction and business analysis.
- Application-side orchestration manages provider selection and fallback behavior.
- Fireworks is configured as a fallback inference provider for the answer-generation workflow.

### Evaluating AI Provider Integrations

This repository does not include private developer API keys.

Evaluators who want to test provider integrations should configure their own authorized API credentials using the exact environment variable names in `.env.example`.

**Meta API**
- No developer Meta API key is provided in this submission.
- Configure your own authorized Meta API credentials if you want to test Meta-hosted model functionality.

**Baseten**
- Configure your own authorized Baseten credentials to evaluate the specialist-analysis workflows.

**Fireworks**
- Configure your own Fireworks API key to evaluate the fallback integration.
- The application uses its configured fallback logic to route eligible answer-generation failures to the Fireworks model.
- Having a Fireworks key configured does not mean every request will use Fireworks; fallback depends on the primary provider's execution outcome and the application's fallback conditions.

Provider availability, account access and API usage are subject to each provider's terms and requirements.

**Security:** Keep all provider API keys in `.env.local` or secure server-side environment variables. Never commit private API keys to GitHub.

---

## Environment Variable Reference

The `.env.example` file is the reference for the application's environment configuration.

It identifies the variable names required by the application without exposing private credentials.

Before running the application:

1. Review `.env.example`.
2. Create `.env.local`.
3. Add your own Supabase credentials.
4. Add the authorized AI provider credentials required for the workflows you want to evaluate.
5. Keep `.env.local` private and out of version control.

---

## Hackathon Evaluation

Evaluators can:

1. Review the complete source code through the GitHub repository.
2. Watch the YouTube demonstration.
3. Clone the application and run it locally.
4. Connect their own Supabase project using the documented configuration.
5. Configure their own authorized AI provider credentials to evaluate the integrations and fallback orchestration.
6. Explore the dashboard, ledger, voice-based transaction entry, AI COO Copilot and other application features.

A permanent public application deployment is not required for this submission.

## Future Scope

- Multi-tenant business onboarding.
- Expanded business intelligence and forecasting.
- WhatsApp and Telegram-based business interaction.
- Advanced operational automation.

## Acknowledgements

Built for the Meta AI hackathon using Meta AI models and supporting inference infrastructure.

## License

Add the applicable license before redistribution.
