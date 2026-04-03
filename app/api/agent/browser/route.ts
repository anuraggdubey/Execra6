import { NextResponse } from "next/server"
import { AgentExecutionError } from "@/lib/agents/shared"
import { runBrowserAgent } from "@/lib/agents/browserAgentService"
import { createBrowserSession } from "@/lib/services/browserSessionStore"
import { createAgentRun, createTask, failTask, updateTask } from "@/lib/services/taskService"
import { upsertUserByWallet } from "@/lib/services/userService"
import { requireNonEmptyText, requireWalletAddress } from "@/lib/services/validation"
import { verifyPendingEscrow } from "@/lib/soroban/serverEscrowVerification"

export const runtime = "nodejs"
export const maxDuration = 300

type BrowserRouteBody = {
    instruction?: unknown
    sessionId?: unknown
    walletAddress?: unknown
    blockchain?: unknown
}

function requireSessionId(value: unknown) {
    if (typeof value !== "string" || !value.trim()) {
        throw new AgentExecutionError("INVALID_INPUT", "sessionId is required.", 400)
    }

    return value.trim()
}

export async function POST(req: Request) {
    let taskId: string | null = null
    const startedAt = Date.now()

    try {
        const body = await req.json() as BrowserRouteBody
        const instruction = requireNonEmptyText(body.instruction, "instruction")
        const sessionId = requireSessionId(body.sessionId)
        const walletAddress = requireWalletAddress(body.walletAddress)

        createBrowserSession(sessionId)
        await upsertUserByWallet(walletAddress)

        const verification = await verifyPendingEscrow({
            walletAddress,
            agentType: "browser",
            blockchain: body.blockchain,
        })

        const task = await createTask({
            walletAddress,
            agentType: "browser",
            inputPrompt: instruction,
            status: "pending",
            blockchain: verification.blockchain,
        })
        taskId = task.id

        const result = await runBrowserAgent({
            sessionId,
            instruction,
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
                stage: "browser-automation",
                status: "completed",
                sessionId,
                stepsExecuted: result.stepsExecuted.length,
            },
            Date.now() - startedAt
        )

        return NextResponse.json({
            success: true,
            taskId,
            sessionId,
            transactionVerified: true,
            ...result,
        })
    } catch (error: unknown) {
        console.error("[browser-agent] Error:", error)

        if (taskId) {
            const message = error instanceof Error ? error.message : "Browser automation failed"
            await Promise.allSettled([
                failTask(taskId, message),
                createAgentRun(taskId, { stage: "browser-automation", status: "failed", message }, Date.now() - startedAt),
            ])
        }

        if (error instanceof AgentExecutionError) {
            return NextResponse.json(
                { error: error.message, code: error.code, details: error.details },
                { status: error.status }
            )
        }

        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Browser automation failed" },
            { status: 500 }
        )
    }
}
