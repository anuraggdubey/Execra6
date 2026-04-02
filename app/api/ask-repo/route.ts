import { NextResponse } from "next/server"
import { askRepositoryQuestion } from "@/lib/agents/githubAgentService"
import { AgentExecutionError } from "@/lib/agents/shared"
import { createAgentRun, createTask, failTask, updateTask } from "@/lib/services/taskService"
import { upsertUserByWallet } from "@/lib/services/userService"
import { requireWalletAddress } from "@/lib/services/validation"

export async function POST(req: Request) {
    let taskId: string | null = null
    const startedAt = Date.now()

    try {
        const { owner, repo, question, context, walletAddress, blockchain } = await req.json()
        if (!question || !context) return NextResponse.json({ error: "Question and context required" }, { status: 400 })

        const normalizedWalletAddress = requireWalletAddress(walletAddress)
        await upsertUserByWallet(normalizedWalletAddress)

        const task = await createTask({
            walletAddress: normalizedWalletAddress,
            agentType: "github",
            inputPrompt: `${owner}/${repo}: ${question}`,
            status: "pending",
            blockchain,
        })
        taskId = task.id

        const answer = await askRepositoryQuestion({ owner, repo, question, context })
        await updateTask({
            taskId,
            status: "completed",
            outputResult: { answer, owner, repo },
            blockchain,
        })
        await createAgentRun(taskId, { stage: "github-question", status: "completed", owner, repo }, Date.now() - startedAt)

        return NextResponse.json({
            success: true,
            taskId,
            answer,
        })
    } catch (err: unknown) {
        if (taskId) {
            const message = err instanceof Error ? err.message : "Q&A failed"
            await Promise.allSettled([
                failTask(taskId, message),
                createAgentRun(taskId, { stage: "github-question", status: "failed", message }, Date.now() - startedAt),
            ])
        }

        if (err instanceof AgentExecutionError) {
            return NextResponse.json({ error: err.message, code: err.code, details: err.details }, { status: err.status })
        }

        return NextResponse.json({ error: err instanceof Error ? err.message : "Q&A failed" }, { status: 500 })
    }
}
