"use client"

import { cancelEscrowedTask, completeEscrowedTask, createEscrowedTask, rewardXlmToStroops } from "@/lib/soroban/taskEscrowClient"
import type { AgentType } from "@/types/tasks"

const LOG_PREFIX = "[lifecycle]"

export type PreparedOnChainTask = {
    blockchainPayload: {
        onChainTaskId: string
        rewardStroops: string
        contractId: string
        onChainStatus: "pending"
        createTxHash: string
    }
    onChainTaskId: bigint
}

export async function prepareEscrowedTask(params: {
    walletAddress: string
    walletProviderId: string | null
    rewardXlm: string
    agentType: AgentType
}) {
    const onChainTaskId = BigInt(Date.now())
    const rewardStroops = rewardXlmToStroops(params.rewardXlm)

    console.log(LOG_PREFIX, `Preparing escrowed task: id=${onChainTaskId}, reward=${params.rewardXlm} XLM (${rewardStroops} stroops), agent=${params.agentType}`)

    const receipt = await createEscrowedTask({
        walletAddress: params.walletAddress,
        walletProviderId: params.walletProviderId,
        onChainTaskId,
        rewardStroops,
        agentType: params.agentType,
    })

    console.log(LOG_PREFIX, `✓ Escrow prepared. TX: ${receipt.txHash}`)

    return {
        onChainTaskId,
        blockchainPayload: {
            onChainTaskId: receipt.onChainTaskId,
            rewardStroops: receipt.rewardStroops,
            contractId: receipt.contractId,
            onChainStatus: "pending" as const,
            createTxHash: receipt.txHash,
        },
    } satisfies PreparedOnChainTask
}

export async function finalizeEscrowedTask(params: {
    taskId: string
    walletAddress: string
    walletProviderId: string | null
    onChainTaskId: bigint
    blockchainPayload: PreparedOnChainTask["blockchainPayload"]
}): Promise<{ txHash: string }> {
    console.log(LOG_PREFIX, `Finalizing task: dbId=${params.taskId}, chainId=${params.onChainTaskId}`)

    const receipt = await completeEscrowedTask({
        walletAddress: params.walletAddress,
        walletProviderId: params.walletProviderId,
        onChainTaskId: params.onChainTaskId,
        payExecutor: false,
    })

    console.log(LOG_PREFIX, `✓ On-chain completion confirmed. TX: ${receipt.txHash}. Syncing to DB…`)

    const syncResponse = await fetch("/api/tasks/onchain-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            taskId: params.taskId,
            onChainTaskId: params.blockchainPayload.onChainTaskId,
            rewardStroops: params.blockchainPayload.rewardStroops,
            contractId: params.blockchainPayload.contractId,
            onChainStatus: "completed",
            createTxHash: params.blockchainPayload.createTxHash,
            completeTxHash: receipt.txHash,
        }),
    })

    if (!syncResponse.ok) {
        const errorBody = await syncResponse.json().catch(() => ({}))
        console.error(LOG_PREFIX, "DB sync failed:", syncResponse.status, errorBody)
        // Don't throw — the on-chain tx succeeded, DB will catch up
    } else {
        console.log(LOG_PREFIX, "✓ DB synced successfully.")
    }

    return { txHash: receipt.txHash }
}

export async function rollbackEscrowedTask(params: {
    walletAddress: string
    walletProviderId: string | null
    onChainTaskId: bigint
    taskId?: string
    blockchainPayload: PreparedOnChainTask["blockchainPayload"]
}) {
    console.log(LOG_PREFIX, `Rolling back task: chainId=${params.onChainTaskId}`)

    const receipt = await cancelEscrowedTask({
        walletAddress: params.walletAddress,
        walletProviderId: params.walletProviderId,
        onChainTaskId: params.onChainTaskId,
    })

    console.log(LOG_PREFIX, `✓ On-chain cancellation confirmed. TX: ${receipt.txHash}`)

    if (params.taskId) {
        const syncResponse = await fetch("/api/tasks/onchain-sync", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                taskId: params.taskId,
                onChainTaskId: params.blockchainPayload.onChainTaskId,
                rewardStroops: params.blockchainPayload.rewardStroops,
                contractId: params.blockchainPayload.contractId,
                onChainStatus: "cancelled",
                createTxHash: params.blockchainPayload.createTxHash,
                cancelTxHash: receipt.txHash,
            }),
        })

        if (!syncResponse.ok) {
            const errorBody = await syncResponse.json().catch(() => ({}))
            console.error(LOG_PREFIX, "DB sync failed on rollback:", syncResponse.status, errorBody)
        } else {
            console.log(LOG_PREFIX, "✓ DB synced (cancelled) successfully.")
        }
    }
}
