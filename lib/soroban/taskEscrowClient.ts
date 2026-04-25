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
import { buildInitialTaskFeatureState, normalizeTaskFeatureConfig } from "@/lib/taskFeatures"
import type { SupportedWalletId } from "@/lib/wallet/stellarWallets"
import type { AgentType, OnChainTaskStatus, TaskFeatureConfig, TaskFeatureState } from "@/types/tasks"

export type SorobanTaskLifecycleParams = {
    walletAddress: string
    walletProviderId: string | null
    onChainTaskId: bigint
    rewardStroops: bigint
    agentType: AgentType
    featureConfig: TaskFeatureConfig
}

export type SorobanTaskReceipt = {
    contractId: string
    onChainTaskId: string
    rewardStroops: string
    txHash: string
    onChainStatus: OnChainTaskStatus
    featureConfig: TaskFeatureConfig
    featureState: TaskFeatureState
}

const LOG_PREFIX = "[soroban]"

const SOROBAN_FEE = "1000000"

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
        // Ignore decode failure and fall back.
    }

    return "No detailed error available"
}

export type SubmitResult = {
    txHash: string
    resultXdr: xdr.ScVal | undefined
}

function normalizeOnChainTaskStatus(value: unknown): OnChainTaskStatus | null {
    if (typeof value === "string") {
        const normalized = value.trim().toLowerCase()
        if (normalized === "uninitialized" || normalized === "pending" || normalized === "completed" || normalized === "cancelled" || normalized === "failed") {
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
            return normalizeOnChainTaskStatus(key) ?? normalizeOnChainTaskStatus(nestedValue)
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

async function pollTransactionConfirmation(server: rpc.Server, txHash: string, params: { confirmationTaskId?: bigint; expectedTaskStatus?: OnChainTaskStatus }) {
    const pollDelays = [500, 500, 1000, 1000, 1000, 1500, 1500, 1500, 2000, 2000, 2000, 2000, 2500, 2500, 2500, 3000, 3000]
    let elapsed = 0

    console.log(LOG_PREFIX, `Polling for confirmation (tx: ${txHash})...`)
    for (let index = 0; index < pollDelays.length; index += 1) {
        const delay = pollDelays[index]
        await sleep(delay)
        elapsed += delay

        try {
            const txResponse = await server.getTransaction(txHash)

            if (txResponse.status === "SUCCESS") {
                console.log(LOG_PREFIX, `Transaction confirmed after ~${elapsed}ms.`)
                return {
                    txHash,
                    resultXdr: txResponse.returnValue,
                } satisfies SubmitResult
            }

            if (txResponse.status === "FAILED") {
                const detail = extractTxError(txResponse)
                throw new Error(`Soroban transaction failed on-chain (tx: ${txHash}). ${detail}`)
            }
        } catch (pollError: unknown) {
            if (pollError instanceof Error && pollError.message.includes("failed on-chain")) {
                throw pollError
            }

            console.warn(LOG_PREFIX, `Poll #${index + 1} RPC error:`, pollError instanceof Error ? pollError.message : pollError)
        }
    }

    if (params.confirmationTaskId && params.expectedTaskStatus) {
        const reconciled = await reconcileTaskStatus({
            taskId: params.confirmationTaskId,
            expectedStatus: params.expectedTaskStatus,
        })

        if (reconciled === params.expectedTaskStatus) {
            return { txHash, resultXdr: undefined } satisfies SubmitResult
        }
    }

    throw new Error(
        `Transaction not confirmed after ${Math.round(elapsed / 1000)}s. Check Stellar explorer: https://stellar.expert/explorer/testnet/tx/${txHash}`
    )
}

async function submitSignedTransaction(params: {
    server: rpc.Server
    signedXdr: string
    walletAddress: string
    featureConfig: TaskFeatureConfig
}) {
    if (params.featureConfig.feeMode !== "sponsored") {
        return params.server.sendTransaction(TransactionBuilder.fromXDR(params.signedXdr, getNetworkPassphrase()))
    }

    const response = await fetch("/api/soroban/sponsor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            signedTransactionXdr: params.signedXdr,
            walletAddress: params.walletAddress,
            sponsorAddress: params.featureConfig.sponsorAddress,
        }),
    })

    const payload = await response.json().catch(() => ({}))
    if (!response.ok) {
        throw new Error(typeof payload.error === "string" ? payload.error : "Failed to submit sponsored transaction.")
    }

    return {
        status: typeof payload.status === "string" ? payload.status : "PENDING",
        hash: typeof payload.hash === "string" ? payload.hash : "",
        errorResult: undefined,
    }
}

async function submitContractInvocation(params: {
    walletAddress: string
    walletProviderId: SupportedWalletId | null
    featureConfig: TaskFeatureConfig
    functionName: string
    args: xdr.ScVal[]
    confirmationTaskId?: bigint
    expectedTaskStatus?: OnChainTaskStatus
}): Promise<SubmitResult> {
    const server = getRpcServer()
    const sourceAccount = await server.getAccount(params.walletAddress)
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

    const prepared = await server.prepareTransaction(tx)
    const signedTx = await signSorobanTransaction({
        walletType: params.walletProviderId,
        walletAddress: params.walletAddress,
        transactionXdr: prepared.toXDR(),
        networkPassphrase: getNetworkPassphrase(),
    })

    const sendResult = await submitSignedTransaction({
        server,
        signedXdr: signedTx.toXDR(),
        walletAddress: params.walletAddress,
        featureConfig: params.featureConfig,
    })
    const submitStatus = sendResult.status as string
    const txHash = sendResult.hash

    if (submitStatus !== "PENDING" && submitStatus !== "SUCCESS") {
        const errMsg = sendResult.errorResult?.toString() ?? "Unknown submission error"
        throw new Error(`Transaction rejected (${submitStatus}): ${errMsg}`)
    }

    if (submitStatus === "SUCCESS") {
        return { txHash, resultXdr: undefined }
    }

    return pollTransactionConfirmation(server, txHash, params)
}

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
    const featureConfig = normalizeTaskFeatureConfig(params.featureConfig)
    const featureState = buildInitialTaskFeatureState(featureConfig)

    const receipt = await submitContractInvocation({
        walletAddress: params.walletAddress,
        walletProviderId: params.walletProviderId as SupportedWalletId | null,
        featureConfig,
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

    return {
        contractId: SOROBAN_CONFIG.contractId,
        onChainTaskId: params.onChainTaskId.toString(),
        rewardStroops: params.rewardStroops.toString(),
        txHash: receipt.txHash,
        onChainStatus: "pending",
        featureConfig,
        featureState,
    }
}

export const createTaskOnChain = createEscrowedTask

export async function completeEscrowedTask(params: {
    walletAddress: string
    walletProviderId: string | null
    onChainTaskId: bigint
    featureConfig: TaskFeatureConfig
    featureState: TaskFeatureState
    payExecutor?: boolean
}): Promise<SorobanTaskReceipt> {
    requireSorobanSupport(params.walletProviderId)
    const featureConfig = normalizeTaskFeatureConfig(params.featureConfig)

    const receipt = await submitContractInvocation({
        walletAddress: params.walletAddress,
        walletProviderId: params.walletProviderId as SupportedWalletId | null,
        featureConfig,
        functionName: "complete_task",
        args: [
            nativeToScVal(params.onChainTaskId, { type: "u64" }),
            new Address(params.walletAddress).toScVal(),
            nativeToScVal(Boolean(params.payExecutor), { type: "bool" }),
        ],
        confirmationTaskId: params.onChainTaskId,
        expectedTaskStatus: "completed",
    })

    return {
        contractId: SOROBAN_CONFIG.contractId,
        onChainTaskId: params.onChainTaskId.toString(),
        rewardStroops: "0",
        txHash: receipt.txHash,
        onChainStatus: "completed",
        featureConfig,
        featureState: params.featureState,
    }
}

export const completeTaskOnChain = completeEscrowedTask

export async function cancelEscrowedTask(params: {
    walletAddress: string
    walletProviderId: string | null
    onChainTaskId: bigint
    featureConfig: TaskFeatureConfig
    featureState: TaskFeatureState
}): Promise<SorobanTaskReceipt> {
    requireSorobanSupport(params.walletProviderId)
    const featureConfig = normalizeTaskFeatureConfig(params.featureConfig)

    const receipt = await submitContractInvocation({
        walletAddress: params.walletAddress,
        walletProviderId: params.walletProviderId as SupportedWalletId | null,
        featureConfig,
        functionName: "cancel_task",
        args: [
            nativeToScVal(params.onChainTaskId, { type: "u64" }),
            new Address(params.walletAddress).toScVal(),
        ],
        confirmationTaskId: params.onChainTaskId,
        expectedTaskStatus: "cancelled",
    })

    return {
        contractId: SOROBAN_CONFIG.contractId,
        onChainTaskId: params.onChainTaskId.toString(),
        rewardStroops: "0",
        txHash: receipt.txHash,
        onChainStatus: "cancelled",
        featureConfig,
        featureState: params.featureState,
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
