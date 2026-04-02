# Supabase Setup

Run the SQL in [schema.sql](./schema.sql) inside the Supabase SQL Editor before starting the app or importing legacy coding outputs.

## Environment Variables

Add these to `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_publishable_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
LEGACY_IMPORT_WALLET_ADDRESS=legacy-local-import
```

## Supabase Dashboard Steps

1. Open your Supabase project.
2. Go to `SQL Editor`.
3. Paste the contents of [schema.sql](./schema.sql).
4. Run the SQL once.

This creates:
- `users`
- `tasks`
- `agent_runs`

If you already ran the earlier schema before Soroban fields were added, also run:

```sql
-- file: supabase/soroban_migration.sql
```

It also enables RLS with deny-by-default policies, so direct public table access is blocked and the app server uses the service role key.

## Import Existing Local Coding Outputs

After the schema exists, run:

```bash
npm run import:legacy-projects
```

This imports every folder in `projects/` into the `tasks` table as a completed `coding` task.

## Optional

If you want the imported legacy projects to belong to a real wallet identity instead of `legacy-local-import`, change:

```env
LEGACY_IMPORT_WALLET_ADDRESS=your_wallet_address_here
```

Then rerun:

```bash
npm run import:legacy-projects
```

## Soroban Setup

After you deploy the Soroban contract, add:

```env
NEXT_PUBLIC_SOROBAN_RPC_URL=https://soroban-testnet.stellar.org
NEXT_PUBLIC_SOROBAN_NETWORK_PASSPHRASE=Test SDF Network ; September 2015
NEXT_PUBLIC_SOROBAN_CONTRACT_ID=your_deployed_contract_id
NEXT_PUBLIC_STELLAR_XLM_SAC_ID=your_testnet_xlm_sac_id
```

The contract package lives in:

```text
contracts/task_escrow
```
