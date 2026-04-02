import { NextResponse } from "next/server"
import { fetchRepoContext } from "@/lib/agents/githubAgentService"
import { AgentExecutionError } from "@/lib/agents/shared"
import { readGitHubAccessToken } from "@/lib/githubAccessToken"
import { createAgentRun, createTask, failTask, updateTask } from "@/lib/services/taskService"
import { upsertUserByWallet } from "@/lib/services/userService"
import { requireWalletAddress } from "@/lib/services/validation"

export async function POST(req: Request) {
    let taskId: string | null = null
    const startedAt = Date.now()

    try {
        const body = await req.json()
        const { owner, repo, ref, walletAddress, blockchain } = body
        const accessToken = readGitHubAccessToken(req)

        if (!accessToken || !owner || !repo) {
            return NextResponse.json({ error: "GitHub access token, owner, and repo are required" }, { status: 400 })
        }

        const normalizedWalletAddress = requireWalletAddress(walletAddress)
        await upsertUserByWallet(normalizedWalletAddress)

        const task = await createTask({
            walletAddress: normalizedWalletAddress,
            agentType: "github",
            inputPrompt: `Index repository ${owner}/${repo}${ref ? ` @ ${ref}` : ""}`,
            status: "pending",
            blockchain,
        })
        taskId = task.id

        const result = await fetchRepoContext({ accessToken, owner, repo, ref })
        await updateTask({
            taskId,
            status: "completed",
            outputResult: result,
            blockchain,
        })
        await createAgentRun(taskId, { stage: "github-index", status: "completed", owner, repo, ref }, Date.now() - startedAt)

        return NextResponse.json({ success: true, taskId, ...result })
    } catch (err: unknown) {
        if (taskId) {
            const message = err instanceof Error ? err.message : "Failed to fetch repo"
            await Promise.allSettled([
                failTask(taskId, message),
                createAgentRun(taskId, { stage: "github-index", status: "failed", message }, Date.now() - startedAt),
            ])
        }

        if (err instanceof AgentExecutionError) {
            return NextResponse.json(
                { error: err.message, code: err.code, details: err.details },
                { status: err.status }
            )
        }

        return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to fetch repo" }, { status: 500 })
    }
}
