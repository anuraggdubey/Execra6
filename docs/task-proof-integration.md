# Task Proof Backend Integration

## Offchain Integration Flow

1. Agent finishes executing the task and produces raw output.
2. Backend serializes the exact user-facing output string or file content.
3. Backend computes a SHA-256 hash:

```js
import crypto from "node:crypto"

const outputHashHex = crypto.createHash("sha256").update(outputString).digest("hex")
```

4. Backend converts the 32-byte hex digest into Soroban `BytesN<32>` input.
5. Backend submits the proof on testnet first:

```text
task_proof.submit_proof(caller, task_id, output_hash, agent_id)
```

6. Only after proof submission succeeds, backend completes escrow:

```text
task_escrow.complete_task(task_id, caller, pay_executor, output_hash)
```

7. `task_escrow` checks `task_proof.proof_exists(task_id)` before payment release.
8. `task_escrow` releases payment and then calls `task_proof.verify_proof(task_id, output_hash)`.
9. Frontend can fetch `task_proof.get_proof(task_id)` and display the verified hash.
10. User can independently hash their received output and compare it to the on-chain `output_hash`.

## Important Notes

- The backend must hash the final canonical output, not an intermediate JSON shape.
- Any change to whitespace, formatting, or serialization changes the SHA-256 hash.
- If proof submission fails, do not call `complete_task`.
- If `complete_task` fails with `ProofRequired`, the backend must re-check whether proof submission succeeded on-chain.
