import { NextResponse } from "next/server"
import { AgentExecutionError } from "@/lib/agents/shared"
import { runWebSearchAgent } from "@/lib/agents/webSearchAgentService"
import { verifyPendingEscrow } from "@/lib/soroban/serverEscrowVerification"
import { createAgentRun, createTask, failTask, updateTask } from "@/lib/services/taskService"
import { upsertUserByWallet } from "@/lib/services/userService"
import { requireNonEmptyText, requireWalletAddress } from "@/lib/services/validation"
import type { SearchDepth } from "@/lib/services/searchService"

export const runtime = "nodejs"
export const maxDuration = 60

type WebSearchRouteBody = {
    query?: unknown
    depth?: unknown
    includeVideos?: unknown
    walletAddress?: unknown
    blockchain?: unknown
}

function requireDepth(value: unknown): SearchDepth {
    if (value === undefined || value === null || value === "") {
        return "basic"
    }

    if (value === "basic" || value === "detailed") {
        return value
    }

    throw new AgentExecutionError("INVALID_DEPTH", "Depth must be basic or detailed.", 400)
}

function requireIncludeVideos(value: unknown) {
    if (value === undefined) return false
    if (typeof value !== "boolean") {
        throw new AgentExecutionError("INVALID_INPUT", "includeVideos must be a boolean.", 400)
    }

    return value
}

export async function POST(req: Request) {
    let taskId: string | null = null
    const startedAt = Date.now()

    try {
        const body = await req.json() as WebSearchRouteBody
        const query = requireNonEmptyText(body.query, "query")
        const depth = requireDepth(body.depth)
        const includeVideos = requireIncludeVideos(body.includeVideos)
        const walletAddress = requireWalletAddress(body.walletAddress)

        await upsertUserByWallet(walletAddress)
        const verification = await verifyPendingEscrow({
            walletAddress,
            agentType: "search",
            blockchain: body.blockchain,
        })

        const task = await createTask({
            walletAddress,
            agentType: "search",
            inputPrompt: query,
            status: "pending",
            blockchain: verification.blockchain,
        })
        taskId = task.id

        const result = await runWebSearchAgent({
            query,
            depth,
            includeVideos,
        })

        await updateTask({
            taskId,
            status: "completed",
            outputResult: result,
            blockchain: verification.blockchain,
        })
        await createAgentRun(
            taskId,
            {
                stage: "web-search",
                status: "completed",
                query,
                depth,
                includeVideos,
                resultCount: result.results.length,
                videoCount: result.videos.length,
            },
            Date.now() - startedAt
        )

        return NextResponse.json({
            success: true,
            taskId,
            transactionVerified: true,
            ...result,
        })
    } catch (error: unknown) {
        console.error("[web-search-agent] Error:", error)

        if (taskId) {
            const message = error instanceof Error ? error.message : "Web search failed"
            await Promise.allSettled([
                failTask(taskId, message),
                createAgentRun(taskId, { stage: "web-search", status: "failed", message }, Date.now() - startedAt),
            ])
        }

        if (error instanceof AgentExecutionError) {
            return NextResponse.json(
                { error: error.message, code: error.code, details: error.details },
                { status: error.status }
            )
        }

        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Web search failed" },
            { status: 500 }
        )
    }
}
