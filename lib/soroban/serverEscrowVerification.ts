import {
    Account,
    nativeToScVal,
    Operation,
    rpc,
    scValToNative,
    TransactionBuilder,
    xdr,
} from "@stellar/stellar-sdk"
import { AgentExecutionError } from "@/lib/agents/shared"
import { SOROBAN_CONFIG, sorobanConfigured } from "@/lib/soroban/config"
import type { AgentType, OnChainTaskStatus } from "@/types/tasks"

const SOROBAN_FEE = "1000000"

export type EscrowBlockchainPayload = {
    onChainTaskId: string
    rewardStroops: string
    contractId: string
    onChainStatus: OnChainTaskStatus
    createTxHash: string
}

type NormalizedOnChainTask = {
    taskId: string
    user: string
    agentType: string
    rewardStroops: string
    status: OnChainTaskStatus
}

function getRpcServer() {
    return new rpc.Server(SOROBAN_CONFIG.rpcUrl)
}

function getNetworkPassphrase() {
    return SOROBAN_CONFIG.networkPassphrase
}

function requireEscrowPayload(value: unknown): EscrowBlockchainPayload {
    const payload = value as Partial<EscrowBlockchainPayload> | undefined

    if (
        !payload ||
        typeof payload.onChainTaskId !== "string" ||
        typeof payload.rewardStroops !== "string" ||
        typeof payload.contractId !== "string" ||
        typeof payload.onChainStatus !== "string" ||
        typeof payload.createTxHash !== "string"
    ) {
        throw new AgentExecutionError(
            "ESCROW_VERIFICATION_FAILED",
            "A confirmed escrow payload is required before the agent can run.",
            403
        )
    }

    return {
        onChainTaskId: payload.onChainTaskId,
        rewardStroops: payload.rewardStroops,
        contractId: payload.contractId,
        onChainStatus: payload.onChainStatus as OnChainTaskStatus,
        createTxHash: payload.createTxHash,
    }
}

function normalizeStatus(value: unknown): OnChainTaskStatus | null {
    if (typeof value === "string") {
        const normalized = value.trim().toLowerCase()
        if (normalized === "pending" || normalized === "completed" || normalized === "cancelled" || normalized === "failed") {
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
        const entries = Object.entries(value as Record<string, unknown>)
        if (entries.length === 1) {
            const [key, nested] = entries[0]
            return normalizeStatus(key) ?? normalizeStatus(nested)
        }
    }

    return null
}

function normalizeText(value: unknown): string {
    if (typeof value === "string") return value.trim()
    if (typeof value === "number" || typeof value === "bigint") return String(value)
    return ""
}

function normalizeTask(value: unknown): NormalizedOnChainTask {
    if (!value || typeof value !== "object") {
        throw new AgentExecutionError("ESCROW_VERIFICATION_FAILED", "On-chain escrow task could not be decoded.", 403)
    }

    const task = value as Record<string, unknown>
    const status = normalizeStatus(task.status)
    const user = normalizeText(task.user)
    const agentType = normalizeText(task.agent_type).toLowerCase()
    const rewardStroops = normalizeText(task.reward)
    const taskId = normalizeText(task.task_id)

    if (!status || !user || !agentType || !rewardStroops || !taskId) {
        throw new AgentExecutionError("ESCROW_VERIFICATION_FAILED", "On-chain escrow task is incomplete.", 403)
    }

    return {
        taskId,
        user,
        agentType,
        rewardStroops,
        status,
    }
}

async function fetchOnChainTask(taskId: bigint) {
    if (!sorobanConfigured()) {
        throw new AgentExecutionError(
            "ESCROW_VERIFICATION_FAILED",
            "Soroban is not configured for on-chain escrow verification.",
            500
        )
    }

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
                args: [nativeToScVal(taskId, { type: "u64" })],
            })
        )
        .setTimeout(60)
        .build()

    const simulation = await server.simulateTransaction(tx) as { result?: { retval?: xdr.ScVal } }
    if (!simulation.result?.retval) {
        throw new AgentExecutionError("ESCROW_VERIFICATION_FAILED", "No on-chain escrow task data was returned.", 403)
    }

    return normalizeTask(scValToNative(simulation.result.retval))
}

export async function verifyPendingEscrow(params: {
    walletAddress: string
    agentType: AgentType
    blockchain: unknown
}) {
    const blockchain = requireEscrowPayload(params.blockchain)
    const onChainTask = await fetchOnChainTask(BigInt(blockchain.onChainTaskId))

    if (blockchain.contractId !== SOROBAN_CONFIG.contractId) {
        throw new AgentExecutionError("ESCROW_VERIFICATION_FAILED", "Escrow contract mismatch.", 403)
    }

    if (blockchain.onChainStatus !== "pending" || onChainTask.status !== "pending") {
        throw new AgentExecutionError("ESCROW_VERIFICATION_FAILED", "Escrow payment is not pending on-chain.", 403)
    }

    if (onChainTask.user.toLowerCase() !== params.walletAddress.toLowerCase()) {
        throw new AgentExecutionError("ESCROW_VERIFICATION_FAILED", "Escrow wallet does not match the current user.", 403)
    }

    if (onChainTask.agentType !== params.agentType) {
        throw new AgentExecutionError("ESCROW_VERIFICATION_FAILED", "Escrow agent type does not match this request.", 403)
    }

    if (onChainTask.rewardStroops !== blockchain.rewardStroops) {
        throw new AgentExecutionError("ESCROW_VERIFICATION_FAILED", "Escrow reward does not match the prepared transaction.", 403)
    }

    return {
        transactionVerified: true as const,
        blockchain,
        onChainTask,
    }
}
