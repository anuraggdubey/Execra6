import { NextResponse } from "next/server"
import { analyzeRepository } from "@/lib/agents/githubAgentService"
import { AgentExecutionError } from "@/lib/agents/shared"
import { createAgentRun, createTask, failTask, updateTask } from "@/lib/services/taskService"
import { upsertUserByWallet } from "@/lib/services/userService"
import { requireWalletAddress } from "@/lib/services/validation"

export async function POST(req: Request) {
    let taskId: string | null = null
    const startedAt = Date.now()

    try {
        const { owner, repo, context, walletAddress, blockchain } = await req.json()
        if (!context) return NextResponse.json({ error: "Repo context is required" }, { status: 400 })

        const normalizedWalletAddress = requireWalletAddress(walletAddress)
        await upsertUserByWallet(normalizedWalletAddress)

        const task = await createTask({
            walletAddress: normalizedWalletAddress,
            agentType: "github",
            inputPrompt: `Full repository review for ${owner}/${repo}`,
            status: "pending",
            blockchain,
        })
        taskId = task.id

        const analysis = await analyzeRepository({ owner, repo, context })
        await updateTask({
            taskId,
            status: "completed",
            outputResult: { analysis, owner, repo },
            blockchain,
        })
        await createAgentRun(taskId, { stage: "github-review", status: "completed", owner, repo }, Date.now() - startedAt)

        return NextResponse.json({
            success: true,
            taskId,
            analysis,
        })
    } catch (err: unknown) {
        if (taskId) {
            const message = err instanceof Error ? err.message : "Analysis failed"
            await Promise.allSettled([
                failTask(taskId, message),
                createAgentRun(taskId, { stage: "github-review", status: "failed", message }, Date.now() - startedAt),
            ])
        }

        if (err instanceof AgentExecutionError) {
            return NextResponse.json({ error: err.message, code: err.code, details: err.details }, { status: err.status })
        }

        return NextResponse.json({ error: err instanceof Error ? err.message : "Analysis failed" }, { status: 500 })
    }
}
