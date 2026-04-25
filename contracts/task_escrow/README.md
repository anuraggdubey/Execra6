# Task Escrow Soroban Contract

This contract escrows native Stellar value through the Stellar Asset Contract (SAC) for XLM and tracks task lifecycle on-chain.

## Current Testnet Deployment

- Contract ID: `CA6MESAPUDXH4AJJY45WRYWBX4EIQL7XOY3XKC3WZZXCNIDGGHSC2GKB`
- Admin / executor used for deployment validation: `GDBUNBHJO2R4B3KDAGDBQXC2ZCUCZTIMAAATA4OUOCBQQ3LUETFZHR3V`
- Native XLM SAC ID: `CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC`

## Public Functions

- `init(admin, token_contract)`
- `set_executor(executor, allowed)`
- `is_executor(executor)`
- `create_task(task_id, user, agent_type, reward)`
- `complete_task(task_id, caller, pay_executor)`
- `cancel_task(task_id, caller)`
- `get_task(task_id)`
- `get_admin()`
- `get_token()`

## Agent Types

The contract is agent-agnostic on-chain. `create_task` accepts `agent_type: Symbol`, so the same escrow contract supports `github`, `coding`, `document`, `email`, `search`, and future agent identifiers without changing the ABI.

## Soroban CLI Flow

Build and optimize:

```bash
stellar contract build --package task_escrow --out-dir target
```

Get the native XLM Stellar Asset Contract id on testnet:

```bash
stellar contract id asset --asset native --network testnet
```

Deploy to testnet:

```bash
stellar contract deploy \
  --wasm target/wasm32v1-none/release/task_escrow.wasm \
  --source your-testnet-identity \
  --network testnet
```

Initialize:

```bash
stellar contract invoke \
  --id YOUR_CONTRACT_ID \
  --source your-testnet-identity \
  --network testnet \
  -- init \
  --admin YOUR_ADMIN_ADDRESS \
  --token_contract YOUR_XLM_SAC_ID
```

Register an executor:

```bash
stellar contract invoke \
  --id YOUR_CONTRACT_ID \
  --source your-testnet-identity \
  --network testnet \
  -- set_executor \
  --executor YOUR_EXECUTOR_ADDRESS \
  --allowed true
```

Verify:

```bash
stellar contract invoke --id YOUR_CONTRACT_ID --source your-testnet-identity --network testnet -- get_admin
stellar contract invoke --id YOUR_CONTRACT_ID --source your-testnet-identity --network testnet -- get_token
```

## Frontend Env Vars

Add these after deployment:

```env
NEXT_PUBLIC_SOROBAN_RPC_URL=https://soroban-testnet.stellar.org
NEXT_PUBLIC_SOROBAN_NETWORK=testnet
NEXT_PUBLIC_SOROBAN_NETWORK_PASSPHRASE=Test SDF Network ; September 2015
NEXT_PUBLIC_SOROBAN_CONTRACT_ID=your_deployed_contract_id
NEXT_PUBLIC_STELLAR_XLM_SAC_ID=your_testnet_xlm_sac_id
```

## ABI Shape

The frontend uses the ABI metadata in [`lib/soroban/taskEscrowAbi.ts`](../../lib/soroban/taskEscrowAbi.ts).
