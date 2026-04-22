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

- Soroban Contract ID: `CDXU5JFTCBO4AKPI2TVQ2BGC352IYXMOIIGPRYXGK247HHMOALKBLJUP`
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

## Folder And File Responsibilities

### `app/`

This contains the App Router pages, layouts, and API routes.

- `app/page.tsx`: landing page
- `app/agents/page.tsx`: main multi-agent workspace
- `app/activity/page.tsx`: task history and activity feed
- `app/settings/page.tsx`: wallet and account settings
- `app/api/*`: server routes for agents, GitHub auth, task persistence, downloads, previews, and utility endpoints

### `components/`

Reusable UI components for each agent and shared layout.

- `components/agents/*`: frontend panels for browser, email, GitHub, and web search agents
- `components/layout/*`: app shell and navigation
- `components/wallet/*`: wallet connect UI

### `lib/agents/`

Core orchestration for each agent.

- `githubAgentService.ts`: repo analysis and GitHub workflows
- `codingAgentService.ts`: generated project output and preview handling
- `documentAgentService.ts`: document parsing and analysis
- `emailAgentService.ts`: email drafting
- `webSearchAgentService.ts`: search and summarization
- `browserAgentService.ts`: browser task planning and structured output formatting

### `lib/services/`

Shared backend services used by routes and agents.

- `automationPlanner.ts`: turns browser instructions into safe browser steps
- `browserService.ts`: Playwright execution for browser automation
- `browserSessionStore.ts`: browser session state and live event streaming
- `taskService.ts`: task CRUD and lifecycle persistence
- `userService.ts`: wallet-user persistence
- `searchService.ts` and `videoService.ts`: search and video lookup helpers
- `validation.ts`: shared input validation

### `lib/soroban/`

Soroban and Stellar integration layer.

- escrow verification
- contract client setup
- task lifecycle helpers
- wallet signing support

### `lib/wallet/`

Wallet integration and session helpers for supported Stellar wallets.

### `contracts/task_escrow/`

Rust smart contract source for the Soroban escrow flow.

### `supabase/`

Database schema, migrations, and setup docs.

### `projects/`

Generated local project outputs from the coding agent. These can be imported into Supabase with `npm run import:legacy-projects`.

### Root Files

- `package.json`: scripts and dependencies
- `server.mjs`: custom Next.js server entrypoint
- `next.config.ts`: Next.js config
- `tsconfig.json`: TypeScript config
- `eslint.config.mjs`: lint config

## Notes

- This repo currently targets `Stellar Testnet`, not mainnet.
- Do not commit real secrets into `.env.local`.
- The Soroban escrow flow depends on a supported wallet being connected when both create and complete signatures are requested.
- The `public/browser-agent/` directory may contain old screenshots from previous browser-agent runs even though screenshots are no longer part of the normal output flow.

## License

`MIT`
