import { NextResponse } from "next/server"
import { AgentExecutionError } from "@/lib/agents/shared"
import { updateTask } from "@/lib/services/taskService"

export async function POST(req: Request) {
    try {
        const {
            taskId,
            onChainTaskId,
            rewardStroops,
            contractId,
            onChainStatus,
            createTxHash,
            completeTxHash,
            cancelTxHash,
            featureConfig,
            featureState,
        } = await req.json()

        const task = await updateTask({
            taskId,
            status: typeof onChainStatus === "string" && onChainStatus === "cancelled" ? "failed" : "completed",
            blockchain: {
                onChainTaskId: onChainTaskId ?? null,
                rewardStroops: rewardStroops ?? null,
                contractId: contractId ?? null,
                onChainStatus: onChainStatus ?? "pending",
                createTxHash: createTxHash ?? null,
                completeTxHash: completeTxHash ?? null,
                cancelTxHash: cancelTxHash ?? null,
                featureConfig: featureConfig ?? undefined,
                featureState: featureState ?? undefined,
            },
        })

        return NextResponse.json({ success: true, task })
    } catch (error: unknown) {
        if (error instanceof AgentExecutionError) {
            return NextResponse.json({ error: error.message, code: error.code, details: error.details }, { status: error.status })
        }

        return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to sync on-chain task state" }, { status: 500 })
    }
}
