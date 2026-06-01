<h1 align="center">Execra</h1>

<p align="center">
  <strong>Wallet-first multi-agent workspace on Stellar & Soroban</strong>
</p>

<p align="center">
  <a href="https://execra6.vercel.app"><img src="https://img.shields.io/badge/Live_App-execra6.vercel.app-6366f1?style=for-the-badge" alt="Live App" /></a>
  <a href="https://drive.google.com/file/d/132Ytp7MAAFrD0tT_ImFpnWWJR07I_voK/view?usp=drive_link"><img src="https://img.shields.io/badge/Demo-Video-111827?style=for-the-badge" alt="Demo Video" /></a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Next.js-16-000?logo=nextdotjs&logoColor=white&style=flat-square" alt="Next.js" />
  <img src="https://img.shields.io/badge/React-19-61dafb?logo=react&logoColor=white&style=flat-square" alt="React" />
  <img src="https://img.shields.io/badge/TypeScript-5-3178c6?logo=typescript&logoColor=white&style=flat-square" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Stellar-SDK-7c3aed?logo=stellar&logoColor=white&style=flat-square" alt="Stellar" />
  <img src="https://img.shields.io/badge/Soroban-Smart_Contracts-1e40af?style=flat-square" alt="Soroban" />
  <img src="https://img.shields.io/badge/Supabase-Backend-3ecf8e?logo=supabase&logoColor=white&style=flat-square" alt="Supabase" />
  <img src="https://img.shields.io/badge/Playwright-Automation-2ead33?logo=playwright&logoColor=white&style=flat-square" alt="Playwright" />
</p>

---

## What is Execra?

Execra is an **escrow-backed AI agent platform** where every task runs through Soroban smart contracts on Stellar Mainnet. Connect your wallet, pick an agent, and execute with on-chain escrow and proof tracking for every action.

The platform is wallet-first: task payments are created from the connected user's wallet, while optional fee sponsorship can be enabled only when a separate sponsor account is configured.

---

## Six Agents, One Surface

| Agent | What it does |
|:---:|:---|
| **GitHub** | Connect repos, index source code, review architecture, and generate focused summaries |
| **Coding** | Generate MVP-ready code artifacts with live preview and downloadable bundles |
| **Document** | Parse PDFs, CSVs, JSON files into concise analysis your team can act on |
| **Email** | Draft and send escrow-backed emails through a configured mailbox |
| **Web Search** | Run live web research with source-backed summaries and related content |
| **Browser** | Control a visible browser session and stream live execution logs |

---

## Platform Features

- Stellar Mainnet escrow for agent tasks through Soroban contracts
- On-chain proof submission and task status sync
- Wallet support for Freighter, xBull, and Albedo
- Supabase-backed users, task history, agent runs, and dashboard metrics
- GitHub OAuth flow for repository analysis
- Live browser automation sessions with streamed progress events
- Generated code previews and downloadable project bundles
- Optional fee sponsorship flow for deployments that choose to subsidize network fees

---

## Mainnet Contracts

| Contract | Address |
|:---|:---|
| Agent Registry | `CAVJ7EW6WBZN6VKU7TVRJYTOL7RZ3DNZC2NQEAWMILLXMIFJ2FRHV2QC` |
| Task Escrow | `CAUTH4R5HX44DS45W24HCZOPUE6LXA3DU6EKQU32IOB6QZ3AKZ4YE43O` |
| Task Proof | `CCBEH4ERGUYIUA44MOFPGZH67LD7MK7KFK6DDZL4FEIR2CPGDXISD3PQ` |
| Native XLM SAC | `CAS3J7GYLGXMF6TDJBBYYSE3HQ6BBSMLNUQ34T6TZMYMW2EVH34XOWMA` |

Network: Stellar Mainnet  
RPC: `https://rpc.lightsail.network`  
Deployer: `GCBUI4DWP2ILEL4QHANJUGE3B5KGEJ2SQIL65I2X44EUXIGL7WJ532WD`

---

## Screenshots

<p align="center">
  <img src="./Screenshots/agents.png" alt="Agent Workspace" width="720" />
  <br/>
  <em>Agent workspace - clean, focused, minimal</em>
</p>

<p align="center">
  <img src="./Screenshots/metricsdash.png" alt="Metrics Dashboard" width="720" />
  <br/>
  <em>Dashboard - platform metrics and task monitoring</em>
</p>

---

## Tech Stack

```
Frontend       Next.js 16 / React 19 / TypeScript 5
Styling        Tailwind CSS 4 / Custom design tokens
Backend        Supabase / Next.js API routes / Express
Blockchain     Soroban smart contracts / Stellar SDK 14
AI Engine      OpenRouter / OpenAI-compatible models
Automation     Playwright server-side Chromium
Contracts      Rust: agent_registry / task_escrow / task_proof
```

---

## Quick Start

```bash
# Clone
git clone https://github.com/anuraggdubey/Execra6.git
cd Execra6

# Install
npm install

# Configure environment
# Fill in Supabase, AI/search, GitHub OAuth, email, and Stellar Mainnet keys

# Run
npm run dev
```

Open [http://localhost:3001](http://localhost:3001) and connect a Stellar Mainnet wallet.

---

## Advanced Feature - Fee Sponsorship

> User-signed Soroban transactions can be wrapped in a sponsor-paid fee bump and submitted to Stellar Mainnet when a sponsor account is configured.

**How it works:**

```
User signs tx -> POST /api/soroban/sponsor -> Sponsor wraps in fee bump -> Submitted to mainnet
```

**Key files:**

| File | Purpose |
|:---|:---|
| [`app/settings/page.tsx`](./app/settings/page.tsx) | UI toggle for fee sponsorship |
| [`lib/taskFeatures.ts`](./lib/taskFeatures.ts) | Feature flag normalization |
| [`app/api/soroban/sponsor/route.ts`](./app/api/soroban/sponsor/route.ts) | Sponsor relay endpoint |
| [`lib/soroban/taskEscrowClient.ts`](./lib/soroban/taskEscrowClient.ts) | Soroban client integration |
| [`app/dashboard/page.tsx`](./app/dashboard/page.tsx) | Sponsorship metrics |

---

## Project Structure

```
Execra6/
├── .github/workflows/     CI pipeline
├── app/
│   ├── agents/            Agent workspace
│   ├── activity/          Execution history
│   ├── dashboard/         Metrics and monitoring
│   ├── settings/          Fee sponsorship config
│   └── api/               Backend routes
├── components/
│   ├── agents/            Agent-specific UI
│   ├── landing/           Landing page sections
│   ├── layout/            Navbar, shell, logo
│   ├── wallet/            Wallet connection
│   └── workspace/         Shared workspace UI
├── contracts/
│   ├── agent_registry/    Soroban registry contract
│   ├── task_escrow/       Soroban escrow contract
│   └── task_proof/        Soroban proof contract
├── lib/
│   ├── soroban/           On-chain integration
│   └── wallet/            Wallet providers and session
├── supabase/              Schema and migrations
└── types/                 Shared TypeScript types
```

---

## CI Pipeline

GitHub Actions runs on PRs and pushes to `main`:

```
npm ci -> npm run lint -> npm run build -> cargo test (contracts/task_escrow)
```

---

## User Guide

| Step | Action |
|:---:|:---|
| **1** | Open the [live app](https://execra6.vercel.app) and connect a Stellar wallet |
| **2** | Open `/agents` and run any agent task |
| **3** | Review execution history in `/activity` |
| **4** | Check `/dashboard` for metrics and on-chain proof |
| **5** | Use `/settings` only if fee sponsorship is configured for the deployment |

---

## User Feedback

Tested with **30+ early users**.

<p>
  <a href="https://docs.google.com/spreadsheets/d/1m6TaHdlt-Aq-8KD_0iVJUwQH0wSc6tWdmSN2C3pYl3Q/edit?usp=sharing"><img src="https://img.shields.io/badge/Feedback_Sheet-Google_Sheets-34a853?style=for-the-badge" alt="Feedback" /></a>
  <a href="https://stellar.expert/explorer/public"><img src="https://img.shields.io/badge/Explorer-Stellar_Expert-7c3aed?style=for-the-badge" alt="Explorer" /></a>
</p>

---

## Community

<p>
  <a href="https://x.com/anuraggdubeyy/status/2048052847737184593?s=20"><img src="https://img.shields.io/badge/Post-@anuraggdubeyy-000?logo=x&logoColor=white&style=for-the-badge" alt="Twitter" /></a>
</p>

<p align="center">
  <img src="./Screenshots/xpost.png" alt="Community Post" width="520" />
</p>

---

## Security

- [Completed Security Checklist](./docs/security-checklist.md)

---

## Deployment Note

The browser agent runs Playwright on the server. Chromium is installed at build time via the `postinstall` script:

```bash
node scripts/installPlaywrightBrowsers.mjs
# Sets PLAYWRIGHT_BROWSERS_PATH=0 and installs Chromium
```

---

<p align="center">
  <sub>Built on Stellar / Powered by Soroban smart contracts</sub>
</p>
