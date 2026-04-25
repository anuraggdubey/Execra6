# Security Checklist

This checklist is the repository-backed security proof for the current Excera build.

## Completed

- [x] `.env.local` is ignored by git and used for local secrets only.
- [x] Soroban fee sponsorship requires `SOROBAN_SPONSOR_SECRET`; the sponsor route fails closed when the secret is missing.
- [x] Supabase service-role access is used on the server side through `lib/supabaseServer.ts`, not exposed to the browser bundle.
- [x] Task and wallet inputs are normalized and validated before persistence through `lib/services/validation.ts` and `lib/taskFeatures.ts`.
- [x] Wallet-gated task creation and completion remain signed by supported Stellar wallets only.
- [x] Contract source was simplified to the fee-sponsorship flow actually exposed by the UI, reducing unused approval and delegate logic in the shipped repo.
- [x] `npm run lint` passes.
- [x] `npm run build` passes.

## Manual Ops Checks

- [ ] Rotate any accidentally exposed local development secrets before public sharing.
- [ ] Verify Vercel environment variables are scoped correctly for preview and production.
- [ ] Confirm production RPC and sponsor account balances before demo day.
- [ ] Replace placeholder evidence assets in `ss/` with final screenshots and external proof links.

## Evidence

- Metrics dashboard route: `/dashboard`
- Monitoring status route: `/api/platform-status`
- Contract source: `contracts/task_escrow/src/lib.rs`
- Sponsorship API route: `app/api/soroban/sponsor/route.ts`
