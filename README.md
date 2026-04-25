# Excera

Excera is a wallet-first multi-agent workspace built on `Next.js`, `Supabase`, and `Soroban / Stellar`. It lets users connect a Stellar wallet, launch focused AI workflows, persist task history, and track escrow-backed execution state on-chain.

## Live App

[Live URL](https://execra6-ai.vercel.app)

## Demo Video

[Video Demo](https://drive.google.com/file/d/1xzH0Tx3HaGSin6YHpRl7Sm_yznTDdXzo/view?usp=drive_link)

## What It Does

Excera currently includes:

- `GitHub Agent` for repository indexing, code Q&A, and review workflows
- `Coding Agent` for generating project files and preview-ready outputs
- `Document Agent` for analyzing PDFs, spreadsheets, CSV, JSON, and text files
- `Web Search Agent` for source-backed web lookup and summarization
- `Browser Automation Agent` for visible browser tasks with structured final output
- `Email Agent` for drafting email responses from a prompt
- wallet-based identity using supported Stellar wallets
- Soroban escrow tracking for task creation, completion, and cancellation
- fee-sponsored Soroban submissions using a sponsor-side fee bump API
- Supabase-backed users, tasks, agent runs, and activity history

## Stack

- `Next.js 16`
- `React 19`
- `TypeScript`
- `Supabase`
- `OpenRouter / OpenAI-compatible LLM access`
- `Soroban / Stellar SDK`
- `Freighter`, `xBull`, and `Albedo` wallet support
- `Playwright` for browser automation

## CI

GitHub Actions runs a `CI` workflow for pull requests and for pushes to `main` and `master`.

It validates the repo with:

- `npm ci`
- `npm run lint`
- `npm run build`

## User Feedback

We collected feedback from 20+ testnet users.

- [View Feedback Sheet](https://docs.google.com/spreadsheets/d/1m6TaHdlt-Aq-8KD_0iVJUwQH0wSc6tWdmSN2C3pYl3Q/edit?usp=sharing)
- [Submit Feedback](https://forms.gle/qXJ3EdkhUz9A95eN9)

## Stellar And Soroban Deployment

This project is configured for `Stellar Testnet`.

### Network

- Network: `testnet`
- RPC URL: `https://soroban-testnet.stellar.org`
- Network Passphrase: `Test SDF Network ; September 2015`
- Explorer base: `https://stellar.expert/explorer/testnet`

### Deployed Contract

- Soroban Contract ID: `CASPLHL5TXZWA5PAFXPXN2CXVCVOGIC3ET56W44A5OJWHYZ43H2S6FK5`
- Native XLM Stellar Asset Contract ID: `CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC`
- Contract package path: [`contracts/task_escrow`](./contracts/task_escrow)

### Contract Functions

- `init(admin, token_contract)`
- `set_executor(executor, allowed)`
- `is_executor(executor)`
- `create_task(task_id, user, agent_type, reward)`
- `complete_task(task_id, caller, pay_executor)`
- `cancel_task(task_id, caller)`
- `get_task(task_id)`
- `get_admin()`
- `get_token()`

## Environment Variables

Create `.env.local` and add the values your environment needs.

### Required App Variables

```env
OPENAI_API_KEY=your_model_provider_key
OPENROUTER_MODEL=openai/gpt-4o-mini
APP_URL=http://localhost:3001
```

### GitHub OAuth

```env
GITHUB_CLIENT_ID=your_github_client_id
GITHUB_CLIENT_SECRET=your_github_client_secret
GITHUB_OAUTH_CALLBACK_URL=http://localhost:3001/api/auth/github/callback
```

### Supabase

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_publishable_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
LEGACY_IMPORT_WALLET_ADDRESS=legacy-local-import
```

### Soroban / Stellar Testnet

```env
NEXT_PUBLIC_SOROBAN_CONTRACT_ID=your_deployed_contract_id
NEXT_PUBLIC_SOROBAN_NETWORK=testnet
NEXT_PUBLIC_SOROBAN_RPC_URL=https://soroban-testnet.stellar.org
NEXT_PUBLIC_SOROBAN_NETWORK_PASSPHRASE=Test SDF Network ; September 2015
NEXT_PUBLIC_STELLAR_XLM_SAC_ID=your_testnet_xlm_sac_id
SOROBAN_SPONSOR_SECRET=your_fee_sponsor_secret_key
```

### Email And Search Integrations

```env
EMAIL_USER=your_email_address
EMAIL_PASS=your_email_app_password
EMAIL_FROM=your_email_address
SERPAPI_API_KEY=your_serpapi_key
YOUTUBE_DATA_API_KEY=your_youtube_data_api_key
```

## Minimal Setup

1. Install dependencies.

```bash
npm install
```

2. Create `.env.local` with your app, GitHub, Supabase, Soroban, and optional email/search values.

3. Run the Supabase schema from [`supabase/schema.sql`](./supabase/schema.sql).

4. If your database was created before Soroban fields were added, also run [`supabase/soroban_migration.sql`](./supabase/soroban_migration.sql).

5. Run any optional feature migrations you need:

```text
supabase/browser_agent_migration.sql
supabase/email_agent_migration.sql
supabase/web_search_agent_migration.sql
supabase/task_features_migration.sql
```

6. Start the app.

```bash
npm run dev
```

7. Open `http://localhost:3001`.

## Useful Scripts

```bash
npm run dev
npm run build
npm run start
npm run lint
npm run import:legacy-projects
```

## Wallet Flow

- connect a supported Stellar wallet
- create an escrowed task on Soroban before agent work starts
- run the selected agent workflow
- sign the final completion transaction
- review task history and on-chain status in the app

## Advanced Contract Features

The Soroban escrow flow keeps one advanced extension:

- `Fee Sponsorship`: new task transactions can use the `/api/soroban/sponsor` route to wrap user-signed contract calls in a sponsor-paid fee bump

### What You Need To Do

1. Run `supabase/task_features_migration.sql`.
2. Open `/settings`.
3. Change `Fee Mode` to `Sponsored Fee Bump`.
4. Optionally add the public sponsor wallet address for display.
5. Press `Save`.
6. Run any agent task from `/agents` with a connected Stellar wallet.

### Current Local Setup Status

- Contract redeployed on Stellar testnet
- `.env.local` updated with `NEXT_PUBLIC_SOROBAN_CONTRACT_ID=CASPLHL5TXZWA5PAFXPXN2CXVCVOGIC3ET56W44A5OJWHYZ43H2S6FK5`
- `.env.local` updated with `SOROBAN_SPONSOR_SECRET` for sponsor fee bumps

### Fee Sponsorship Flow

1. Connect `Freighter`, `xBull`, or `Albedo`.
2. Open [`/settings`](./app/settings/page.tsx) and save `Sponsored Fee Bump`.
3. Start a task from [`/agents`](./app/agents/page.tsx).
4. The app prepares the Soroban transaction client-side.
5. If sponsorship is enabled, the signed XDR is posted to `/api/soroban/sponsor`.
6. The sponsor account wraps the transaction in a fee bump and submits it to Stellar testnet.
7. Task history in `/activity` and `/dashboard` shows whether the saved task config used sponsored fees.

## Submission Proof

### Metrics Dashboard

- [Link dashboard](https://execra6-ai.vercel.app/dashboard)
- Screenshot: (./Screenshot/metricsdash.png)

### Monitoring Dashboard

- [Link Monitor](https://execra6-ai.vercel.app/api/platform-status)
- Screenshot: (./Screenshot/monitordash.png)

### Security Checklist

- Link: [`docs/security-checklist.md`](./docs/security-checklist.md)

### Community Contribution

- Link placeholder: `https://twitter.com/your-handle/status/your-post-id`

### Advanced Feature

- Feature: `Fee Sponsorship`
- Description: user-signed Soroban transactions can be relayed through `/api/soroban/sponsor`, where the configured sponsor account pays the fee bump.
- Proof of implementation:
  - UI configuration: [`app/settings/page.tsx`](./app/settings/page.tsx)
  - Feature state normalization: [`lib/taskFeatures.ts`](./lib/taskFeatures.ts)
  - Sponsorship submit route: [`app/api/soroban/sponsor/route.ts`](./app/api/soroban/sponsor/route.ts)
  - On-chain task flow: [`lib/soroban/taskEscrowClient.ts`](./lib/soroban/taskEscrowClient.ts)
  - Monitoring view: [`app/dashboard/page.tsx`](./app/dashboard/page.tsx)

## Architecture

Excera is structured as a wallet-first multi-agent system where the UI, API routes, agent services, persistence layer, and smart contract each have a focused responsibility.

### System View

```text
User
  ->
Next.js UI
  ->
API Routes
  ->
Agent Services + Wallet/Soroban Logic
  ->
Supabase + Soroban Contract
```

### Execution Flow

1. A user connects a Stellar wallet in the frontend.
2. The app prepares an escrow transaction and verifies it on-chain.
3. The selected agent route validates input and coordinates the run.
4. The agent service calls tools, LLM helpers, or browser/document integrations.
5. Task and run data are persisted in Supabase.
6. The final status is reflected in the activity feed and on-chain task state.

## Project Structure

Below is the main project layout with the important folders and files you will work with most often.

```text
Execra6/
├─ .github/
│  └─ workflows/
│     └─ ci.yml
├─ app/
│  ├─ activity/
│  │  └─ page.tsx
│  ├─ agents/
│  │  └─ page.tsx
│  ├─ api/
│  │  ├─ agent/
│  │  │  ├─ browser/
│  │  │  ├─ email/
│  │  │  └─ web-search/
│  │  ├─ analyze-document/
│  │  ├─ analyze-repo/
│  │  ├─ ask-repo/
│  │  ├─ auth/
│  │  ├─ browser-automation/
│  │  ├─ coding-images/
│  │  ├─ connect-github/
│  │  ├─ createAgent/
│  │  ├─ download/
│  │  ├─ fetch-repo/
│  │  ├─ generate-email/
│  │  ├─ payout/
│  │  ├─ platform-status/
│  │  ├─ preview/
│  │  ├─ run-coding-agent/
│  │  ├─ runAgent/
│  │  ├─ send-email/
│  │  ├─ tasks/
│  │  ├─ users/
│  │  └─ web-search/
│  ├─ dashboard/
│  │  └─ page.tsx
│  ├─ preview/
│  │  └─ [id]/
│  ├─ settings/
│  │  └─ page.tsx
│  ├─ favicon.ico
│  ├─ globals.css
│  ├─ layout.tsx
│  └─ page.tsx
├─ components/
│  ├─ agents/
│  │  ├─ BrowserAgent.tsx
│  │  ├─ EmailAgent.tsx
│  │  ├─ GitHubAgent.tsx
│  │  └─ WebSearchAgent.tsx
│  ├─ auth/
│  ├─ dashboard/
│  ├─ layout/
│  │  ├─ AppShell.tsx
│  │  └─ TopNavbar.tsx
│  ├─ wallet/
│  │  └─ ConnectWalletButton.tsx
│  ├─ ThemeProvider.tsx
│  ├─ ThemeToggle.tsx
│  └─ WorkspaceOnboarding.tsx
├─ contracts/
│  └─ task_escrow/
│     ├─ src/
│     ├─ test_snapshots/
│     ├─ Cargo.toml
│     └─ README.md
├─ lib/
│  ├─ agents/
│  │  ├─ browserAgentService.ts
│  │  ├─ codingAgentService.ts
│  │  ├─ documentAgentService.ts
│  │  ├─ emailAgentService.ts
│  │  ├─ githubAgentService.ts
│  │  ├─ shared.ts
│  │  └─ webSearchAgentService.ts
│  ├─ llm/
│  │  └─ openrouter.ts
│  ├─ services/
│  │  ├─ automationPlanner.ts
│  │  ├─ browserService.ts
│  │  ├─ browserSessionStore.ts
│  │  ├─ emailService.ts
│  │  ├─ searchService.ts
│  │  ├─ taskService.ts
│  │  ├─ userService.ts
│  │  ├─ validation.ts
│  │  └─ videoService.ts
│  ├─ soroban/
│  │  ├─ config.ts
│  │  ├─ serverEscrowVerification.ts
│  │  ├─ taskEscrowAbi.ts
│  │  ├─ taskEscrowClient.ts
│  │  ├─ taskLifecycle.ts
│  │  └─ walletSigner.ts
│  ├─ tools/
│  │  ├─ fileTool.ts
│  │  ├─ githubTool.ts
│  │  └─ previewTool.ts
│  ├─ wallet/
│  │  ├─ githubSession.ts
│  │  └─ stellarWallets.ts
│  ├─ AgentContext.tsx
│  ├─ WalletContext.tsx
│  ├─ githubAuth.ts
│  ├─ githubAccessToken.ts
│  ├─ supabaseClient.ts
│  ├─ supabaseServer.ts
│  └─ useHasMounted.ts
├─ projects/
│  └─ project-*/
├─ public/
│  ├─ browser-agent/
│  └─ *.svg
├─ scripts/
│  └─ importLegacyProjects.mjs
├─ supabase/
│  ├─ README.md
│  ├─ browser_agent_migration.sql
│  ├─ email_agent_migration.sql
│  ├─ schema.sql
│  ├─ soroban_migration.sql
│  └─ web_search_agent_migration.sql
├─ types/
│  ├─ agent.ts
│  └─ tasks.ts
├─ next.config.ts
├─ package.json
├─ server.mjs
├─ tsconfig.json
└─ README.md
```

## License

`MIT`
