// Execra Platform
"use client"

import { buildInitialTaskFeatureState, readStoredTaskFeatureConfig } from "@/lib/taskFeatures"
import { buildOnChainTaskId, withProofFeatureState } from "@/lib/soroban/taskProof"
import {
    cancelEscrowedTask,
    completeEscrowedTask,
    createEscrowedTask,
    fetchPlatformBalance,
    rewardXlmToStroops,
    waitForOnChainTaskStatus,
} from "@/lib/soroban/taskEscrowClient"
import type { AgentType } from "@/types/tasks"

const LOG_PREFIX = "[lifecycle]"

export type PreparedOnChainTask = {
    blockchainPayload: {
        onChainTaskId: string
        rewardStroops: string
        contractId: string
        onChainStatus: "pending"
        createTxHash: string
        featureConfig: ReturnType<typeof readStoredTaskFeatureConfig>
        featureState: ReturnType<typeof buildInitialTaskFeatureState>
    }
    onChainTaskId: string
}

export async function prepareEscrowedTask(params: {
    walletAddress: string
    walletProviderId: string | null
    rewardXlm: string
    agentType: AgentType
}) {
    const onChainTaskId = buildOnChainTaskId(params.agentType)
    const rewardStroops = rewardXlmToStroops(params.rewardXlm)
    const featureConfig = readStoredTaskFeatureConfig()

    console.log(LOG_PREFIX, `Preparing escrowed task: id=${onChainTaskId}, reward=${params.rewardXlm} XLM (${rewardStroops} stroops), agent=${params.agentType}`)

    const platformBalance = await fetchPlatformBalance({ walletAddress: params.walletAddress })
    if (platformBalance < rewardStroops) {
        throw new Error("Your Execra balance is too low. Deposit more XLM to run this agent.")
    }

    const receipt = await createEscrowedTask({
        walletAddress: params.walletAddress,
        walletProviderId: params.walletProviderId,
        onChainTaskId,
        rewardStroops,
        agentType: params.agentType,
        featureConfig,
    })

    window.dispatchEvent(new CustomEvent("execra-platform-balance-changed"))
    console.log(LOG_PREFIX, `Escrow submission accepted. TX: ${receipt.txHash}`)

    return {
        onChainTaskId,
        blockchainPayload: {
            onChainTaskId: receipt.onChainTaskId,
            rewardStroops: receipt.rewardStroops,
            contractId: receipt.contractId,
            onChainStatus: "pending" as const,
            createTxHash: receipt.txHash,
            featureConfig: receipt.featureConfig,
            featureState: receipt.featureState,
        },
    } satisfies PreparedOnChainTask
}

export async function finalizeEscrowedTask(params: {
    taskId: string
    agentType: AgentType
    walletAddress: string
    walletProviderId: string | null
    onChainTaskId: string
    proofPayload: unknown
    blockchainPayload: PreparedOnChainTask["blockchainPayload"]
}): Promise<{ txHash: string }> {
    console.log(LOG_PREFIX, `Finalizing task: dbId=${params.taskId}, chainId=${params.onChainTaskId}`)

    await waitForOnChainTaskStatus({
        taskId: params.onChainTaskId,
        expectedStatus: "pending",
    })

    const proofResponse = await fetch("/api/tasks/submit-proof", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            onChainTaskId: params.onChainTaskId,
            agentType: params.agentType,
            outputResult: params.proofPayload,
        }),
    })
    const proofPayload = await proofResponse.json().catch(() => ({}))
    if (!proofResponse.ok) {
        throw new Error(typeof proofPayload.error === "string" ? proofPayload.error : "Failed to submit task proof on-chain.")
    }

    if (typeof proofPayload.outputHashHex !== "string" || typeof proofPayload.proofTxHash !== "string") {
        throw new Error("Task proof response was incomplete.")
    }

    const featureState = withProofFeatureState(
        { ...params.blockchainPayload.featureState },
        {
            proofHashHex: proofPayload.outputHashHex,
            proofTxHash: proofPayload.proofTxHash,
        }
    )

    const receipt = await completeEscrowedTask({
        walletAddress: params.walletAddress,
        walletProviderId: params.walletProviderId,
        onChainTaskId: params.onChainTaskId,
        featureConfig: params.blockchainPayload.featureConfig,
        featureState,
        payExecutor: false,
        outputHashHex: proofPayload.outputHashHex,
    })

    window.dispatchEvent(new CustomEvent("execra-platform-balance-changed"))
    console.log(LOG_PREFIX, `On-chain completion confirmed. TX: ${receipt.txHash}. Syncing to DB...`)

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
            featureConfig: params.blockchainPayload.featureConfig,
            featureState,
        }),
    })

    if (!syncResponse.ok) {
        const errorBody = await syncResponse.json().catch(() => ({}))
        console.error(LOG_PREFIX, "DB sync failed:", syncResponse.status, errorBody)
    } else {
        console.log(LOG_PREFIX, "DB synced successfully.")
    }

    return { txHash: receipt.txHash }
}

export async function rollbackEscrowedTask(params: {
    walletAddress: string
    walletProviderId: string | null
    onChainTaskId: string
    taskId?: string
    blockchainPayload: PreparedOnChainTask["blockchainPayload"]
}) {
    console.log(LOG_PREFIX, `Rolling back task: chainId=${params.onChainTaskId}`)

    await waitForOnChainTaskStatus({
        taskId: params.onChainTaskId,
        expectedStatus: "pending",
    })

    const receipt = await cancelEscrowedTask({
        walletAddress: params.walletAddress,
        walletProviderId: params.walletProviderId,
        onChainTaskId: params.onChainTaskId,
        featureConfig: params.blockchainPayload.featureConfig,
        featureState: params.blockchainPayload.featureState,
    })

    window.dispatchEvent(new CustomEvent("execra-platform-balance-changed"))
    console.log(LOG_PREFIX, `On-chain cancellation confirmed. TX: ${receipt.txHash}`)

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
                featureConfig: params.blockchainPayload.featureConfig,
                featureState: params.blockchainPayload.featureState,
            }),
        })

        if (!syncResponse.ok) {
            const errorBody = await syncResponse.json().catch(() => ({}))
            console.error(LOG_PREFIX, "DB sync failed on rollback:", syncResponse.status, errorBody)
        } else {
            console.log(LOG_PREFIX, "DB synced (cancelled) successfully.")
        }
    }
}
