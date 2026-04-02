"use client"

import {
    Account,
    Address,
    nativeToScVal,
    Operation,
    rpc,
    scValToNative,
    TransactionBuilder,
    xdr,
} from "@stellar/stellar-sdk"
import { SOROBAN_CONFIG, sorobanConfigured } from "@/lib/soroban/config"
import { signSorobanTransaction } from "@/lib/soroban/walletSigner"
import type { SupportedWalletId } from "@/lib/wallet/stellarWallets"
import type { AgentType, OnChainTaskStatus } from "@/types/tasks"

/* ── Types ───────────────────────────────────────────────── */

export type SorobanTaskLifecycleParams = {
    walletAddress: string
    walletProviderId: string | null
    onChainTaskId: bigint
    rewardStroops: bigint
    agentType: AgentType
}

export type SorobanTaskReceipt = {
    contractId: string
    onChainTaskId: string
    rewardStroops: string
    txHash: string
    onChainStatus: OnChainTaskStatus
}

/* ── Helpers ─────────────────────────────────────────────── */

const LOG_PREFIX = "[soroban]"

/**
 * Higher fee ceiling for Soroban contract invocations.
 * prepareTransaction replaces this with the simulated fee, but a higher
 * initial value prevents edge-case failures where 100 stroops is too low
 * for the initial envelope validation.
 */
const SOROBAN_FEE = "1000000" // 0.1 XLM — simulation will set the real fee

function getRpcServer() {
    return new rpc.Server(SOROBAN_CONFIG.rpcUrl)
}

function requireSorobanSupport(walletProviderId: string | null) {
    if (!sorobanConfigured()) {
        throw new Error("Soroban is not configured. Add the contract and RPC environment variables first.")
    }

    if (!walletProviderId || !["freighter", "xbull", "albedo"].includes(walletProviderId)) {
        throw new Error("Use Freighter, xBull, or Albedo to sign Soroban task transactions.")
    }
}

function getNetworkPassphrase() {
    return SOROBAN_CONFIG.networkPassphrase
}

function symbolScVal(value: string) {
    return xdr.ScVal.scvSymbol(value)
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
        window.setTimeout(resolve, ms)
    })
}

/**
 * Attempt to extract a human-readable error from a failed Soroban transaction.
 */
function extractTxError(txResponse: rpc.Api.GetTransactionResponse): string {
    try {
        if ("resultXdr" in txResponse && txResponse.resultXdr) {
            const result = txResponse.resultXdr as unknown
            if (typeof result === "object" && result !== null && "toXDR" in (result as Record<string, unknown>)) {
                return `Result XDR: ${(result as { toXDR: (format: string) => string }).toXDR("base64")}`
            }
            return `Result: ${String(result)}`
        }
    } catch {
        // Couldn't decode — return generic
    }
    return "No detailed error available"
}

/* ── Core: Submit & Poll ─────────────────────────────────── */

export type SubmitResult = {
    txHash: string
    resultXdr: xdr.ScVal | undefined
}

function normalizeOnChainTaskStatus(value: unknown): OnChainTaskStatus | null {
    if (typeof value === "string") {
        const normalized = value.trim().toLowerCase()
        if (
            normalized === "uninitialized" ||
            normalized === "pending" ||
            normalized === "completed" ||
            normalized === "cancelled" ||
            normalized === "failed"
        ) {
            return normalized
        }

        if (normalized === "taskstatus::pending") return "pending"
        if (normalized === "taskstatus::completed") return "completed"
        if (normalized === "taskstatus::cancelled") return "cancelled"
    }

    if (typeof value === "number" || typeof value === "bigint") {
        const numeric = Number(value)
        if (numeric === 0) return "pending"
        if (numeric === 1) return "completed"
        if (numeric === 2) return "cancelled"
    }

    if (value && typeof value === "object") {
        const record = value as Record<string, unknown>

        if ("status" in record) {
            const nested = normalizeOnChainTaskStatus(record.status)
            if (nested) return nested
        }

        const entries = Object.entries(record)
        if (entries.length === 1) {
            const [key, nestedValue] = entries[0]
            const fromKey = normalizeOnChainTaskStatus(key)
            if (fromKey) return fromKey

            const fromValue = normalizeOnChainTaskStatus(nestedValue)
            if (fromValue) return fromValue
        }
    }

    return null
}

async function reconcileTaskStatus(params: { taskId: bigint; expectedStatus: OnChainTaskStatus }) {
    try {
        const task = await fetchOnChainTask({ taskId: params.taskId })
        const actualStatus = normalizeOnChainTaskStatus(task)
        if (actualStatus === params.expectedStatus) {
            console.warn(LOG_PREFIX, `Recovered ${params.expectedStatus} state directly from contract for task ${params.taskId}.`)
            return actualStatus
        }
    } catch (reconcileError: unknown) {
        console.warn(
            LOG_PREFIX,
            "Could not reconcile task state from contract:",
            reconcileError instanceof Error ? reconcileError.message : reconcileError
        )
    }

    return null
}

async function submitContractInvocation(params: {
    walletAddress: string
    walletProviderId: SupportedWalletId | null
    functionName: string
    args: xdr.ScVal[]
    confirmationTaskId?: bigint
    expectedTaskStatus?: OnChainTaskStatus
}): Promise<SubmitResult> {
    const server = getRpcServer()

    // ── 1. Load source account ──────────────────────────
    console.log(LOG_PREFIX, `Loading account ${params.walletAddress}…`)
    const sourceAccount = await server.getAccount(params.walletAddress)
    console.log(LOG_PREFIX, `Account loaded. Sequence: ${sourceAccount.sequenceNumber()}`)

    // ── 2. Build transaction ────────────────────────────
    const tx = new TransactionBuilder(sourceAccount, {
        fee: SOROBAN_FEE,
        networkPassphrase: getNetworkPassphrase(),
    })
        .addOperation(
            Operation.invokeContractFunction({
                contract: SOROBAN_CONFIG.contractId,
                function: params.functionName,
                args: params.args,
            })
        )
        .setTimeout(60)
        .build()

    console.log(LOG_PREFIX, `Built tx for ${params.functionName}. XDR length: ${tx.toXDR().length}`)

    // ── 3. Simulate (prepare) ───────────────────────────
    let prepared: Awaited<ReturnType<typeof server.prepareTransaction>>
    try {
        prepared = await server.prepareTransaction(tx)
        console.log(LOG_PREFIX, "Simulation/prepare succeeded.")
    } catch (simError: unknown) {
        const detail = simError instanceof Error ? simError.message : String(simError)
        console.error(LOG_PREFIX, "Simulation FAILED:", detail)
        throw new Error(`Soroban simulation failed for ${params.functionName}: ${detail}`)
    }

    // ── 4. Sign via wallet ──────────────────────────────
    console.log(LOG_PREFIX, `Requesting wallet signature (${params.walletProviderId})…`)
    const signedTx = await signSorobanTransaction({
        walletType: params.walletProviderId,
        walletAddress: params.walletAddress,
        transactionXdr: prepared.toXDR(),
        networkPassphrase: getNetworkPassphrase(),
    })
    console.log(LOG_PREFIX, "Transaction signed successfully.")

    // ── 5. Submit to network ────────────────────────────
    console.log(LOG_PREFIX, "Submitting transaction to Soroban RPC…")
    const sendResult = await server.sendTransaction(signedTx)
    const submitStatus = sendResult.status as string
    const txHash = sendResult.hash

    console.log(LOG_PREFIX, `sendTransaction response — status: ${submitStatus}, hash: ${txHash}`)

    if (submitStatus !== "PENDING" && submitStatus !== "SUCCESS") {
        const errMsg = sendResult.errorResult?.toString() ?? "Unknown submission error"
        console.error(LOG_PREFIX, "Transaction REJECTED by RPC:", errMsg)
        throw new Error(`Transaction rejected (${submitStatus}): ${errMsg}`)
    }

    if (submitStatus === "SUCCESS") {
        console.log(LOG_PREFIX, "Transaction confirmed immediately (SUCCESS on submit).")
        return { txHash, resultXdr: undefined }
    }

    // ── 6. Poll for confirmation ────────────────────────
    // 30s total: fast start → gradual backoff
    const pollDelays = [
        500, 500, 1000, 1000, 1000,
        1500, 1500, 1500, 2000, 2000,
        2000, 2000, 2500, 2500, 2500,
        3000, 3000,
    ]
    // Total: ~30s
    let elapsed = 0

    console.log(LOG_PREFIX, `Polling for confirmation (tx: ${txHash})…`)
    for (let i = 0; i < pollDelays.length; i++) {
        const delay = pollDelays[i]
        await sleep(delay)
        elapsed += delay

        try {
            const txResponse = await server.getTransaction(txHash)
            const pollStatus = txResponse.status

            if (pollStatus === "SUCCESS") {
                console.log(LOG_PREFIX, `✓ Transaction CONFIRMED after ~${elapsed}ms (poll #${i + 1})`)
                return {
                    txHash,
                    resultXdr: txResponse.returnValue,
                }
            }

            if (pollStatus === "FAILED") {
                const detail = extractTxError(txResponse)
                console.error(LOG_PREFIX, `✗ Transaction FAILED on-chain after ~${elapsed}ms. ${detail}`)
                throw new Error(`Soroban transaction failed on-chain (tx: ${txHash}). ${detail}`)
            }

            // NOT_FOUND or other → still processing
            console.log(LOG_PREFIX, `Poll #${i + 1} (~${elapsed}ms): status=${pollStatus}, waiting…`)
        } catch (pollError: unknown) {
            // If it's our own thrown error, re-throw
            if (pollError instanceof Error && pollError.message.includes("failed on-chain")) {
                throw pollError
            }
            // RPC network error during poll — log and retry
            console.warn(LOG_PREFIX, `Poll #${i + 1} RPC error:`, pollError instanceof Error ? pollError.message : pollError)
        }
    }

    // Timed out — but tx might still confirm later
    if (params.confirmationTaskId && params.expectedTaskStatus) {
        const reconciledStatus = await reconcileTaskStatus({
            taskId: params.confirmationTaskId,
            expectedStatus: params.expectedTaskStatus,
        })

        if (reconciledStatus === params.expectedTaskStatus) {
            return { txHash, resultXdr: undefined }
        }
    }

    console.error(LOG_PREFIX, `Timed out after ~${elapsed}ms. TX hash: ${txHash}`)
    throw new Error(
        `Transaction not confirmed after ${Math.round(elapsed / 1000)}s. ` +
        `Check Stellar explorer: https://stellar.expert/explorer/testnet/tx/${txHash}`
    )
}

/* ── Public API ──────────────────────────────────────────── */

export function rewardXlmToStroops(rewardXlm: string) {
    const trimmed = rewardXlm.trim()
    if (!trimmed || Number(trimmed) <= 0) {
        throw new Error("Reward must be greater than 0 XLM")
    }

    const [whole = "0", fraction = ""] = trimmed.split(".")
    const normalizedFraction = `${fraction}0000000`.slice(0, 7)
    return BigInt(whole) * 10_000_000n + BigInt(normalizedFraction)
}

export async function createEscrowedTask(params: SorobanTaskLifecycleParams): Promise<SorobanTaskReceipt> {
    requireSorobanSupport(params.walletProviderId)
    console.log(LOG_PREFIX, `Creating escrowed task: id=${params.onChainTaskId}, reward=${params.rewardStroops} stroops, agent=${params.agentType}`)

    const receipt = await submitContractInvocation({
        walletAddress: params.walletAddress,
        walletProviderId: params.walletProviderId as SupportedWalletId | null,
        functionName: "create_task",
        args: [
            nativeToScVal(params.onChainTaskId, { type: "u64" }),
            new Address(params.walletAddress).toScVal(),
            symbolScVal(params.agentType),
            nativeToScVal(params.rewardStroops, { type: "i128" }),
        ],
        confirmationTaskId: params.onChainTaskId,
        expectedTaskStatus: "pending",
    })

    console.log(LOG_PREFIX, `✓ Escrow created. TX: ${receipt.txHash}`)
    return {
        contractId: SOROBAN_CONFIG.contractId,
        onChainTaskId: params.onChainTaskId.toString(),
        rewardStroops: params.rewardStroops.toString(),
        txHash: receipt.txHash,
        onChainStatus: "pending",
    }
}

export const createTaskOnChain = createEscrowedTask

export async function completeEscrowedTask(params: {
    walletAddress: string
    walletProviderId: string | null
    onChainTaskId: bigint
    payExecutor?: boolean
}): Promise<SorobanTaskReceipt> {
    requireSorobanSupport(params.walletProviderId)
    console.log(LOG_PREFIX, `Completing task: id=${params.onChainTaskId}, payExecutor=${params.payExecutor ?? false}`)

    const receipt = await submitContractInvocation({
        walletAddress: params.walletAddress,
        walletProviderId: params.walletProviderId as SupportedWalletId | null,
        functionName: "complete_task",
        args: [
            nativeToScVal(params.onChainTaskId, { type: "u64" }),
            new Address(params.walletAddress).toScVal(),
            nativeToScVal(Boolean(params.payExecutor), { type: "bool" }),
        ],
        confirmationTaskId: params.onChainTaskId,
        expectedTaskStatus: "completed",
    })

    console.log(LOG_PREFIX, `✓ Task completed on-chain. TX: ${receipt.txHash}`)
    return {
        contractId: SOROBAN_CONFIG.contractId,
        onChainTaskId: params.onChainTaskId.toString(),
        rewardStroops: "0",
        txHash: receipt.txHash,
        onChainStatus: "completed",
    }
}

export const completeTaskOnChain = completeEscrowedTask

export async function cancelEscrowedTask(params: {
    walletAddress: string
    walletProviderId: string | null
    onChainTaskId: bigint
}): Promise<SorobanTaskReceipt> {
    requireSorobanSupport(params.walletProviderId)
    console.log(LOG_PREFIX, `Cancelling task: id=${params.onChainTaskId}`)

    const receipt = await submitContractInvocation({
        walletAddress: params.walletAddress,
        walletProviderId: params.walletProviderId as SupportedWalletId | null,
        functionName: "cancel_task",
        args: [
            nativeToScVal(params.onChainTaskId, { type: "u64" }),
            new Address(params.walletAddress).toScVal(),
        ],
        confirmationTaskId: params.onChainTaskId,
        expectedTaskStatus: "cancelled",
    })

    console.log(LOG_PREFIX, `✓ Task cancelled on-chain. TX: ${receipt.txHash}`)
    return {
        contractId: SOROBAN_CONFIG.contractId,
        onChainTaskId: params.onChainTaskId.toString(),
        rewardStroops: "0",
        txHash: receipt.txHash,
        onChainStatus: "cancelled",
    }
}

export const cancelTaskOnChain = cancelEscrowedTask

export async function fetchOnChainTask(params: { taskId: bigint }) {
    const server = getRpcServer()
    const sourceAccount = new Account("GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF", "0")
    const tx = new TransactionBuilder(sourceAccount, {
        fee: SOROBAN_FEE,
        networkPassphrase: getNetworkPassphrase(),
    })
        .addOperation(
            Operation.invokeContractFunction({
                contract: SOROBAN_CONFIG.contractId,
                function: "get_task",
                args: [nativeToScVal(params.taskId, { type: "u64" })],
            })
        )
        .setTimeout(60)
        .build()

    const simulation = await server.simulateTransaction(tx) as { result?: { retval?: xdr.ScVal } }
    if (!simulation.result?.retval) {
        throw new Error("No task data returned from contract")
    }

    return scValToNative(simulation.result.retval)
}
