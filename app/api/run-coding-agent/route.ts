import { NextResponse } from "next/server"
import { runCodingAgent } from "@/lib/agents/codingAgentService"
import { AgentExecutionError } from "@/lib/agents/shared"
import { createAgentRun, createTask, failTask, updateTask } from "@/lib/services/taskService"
import { upsertUserByWallet } from "@/lib/services/userService"
import { requireWalletAddress } from "@/lib/services/validation"
import { previewTool } from "@/lib/tools/previewTool"

export const maxDuration = 60

export async function POST(req: Request) {
    let taskId: string | null = null
    const startedAt = Date.now()

    try {
        const body = await req.json()
        const { prompt, language, walletAddress, blockchain } = body

        if (!prompt || typeof prompt !== "string") {
            return NextResponse.json({ error: "Prompt is required" }, { status: 400 })
        }

        const normalizedWalletAddress = requireWalletAddress(walletAddress)
        await upsertUserByWallet(normalizedWalletAddress)

        const task = await createTask({
            walletAddress: normalizedWalletAddress,
            agentType: "coding",
            inputPrompt: prompt,
            status: "pending",
            blockchain,
        })
        taskId = task.id

        const result = await runCodingAgent(prompt, typeof language === "string" ? language : undefined)
        const outputResult =
            result.files
                ? {
                    kind: "project",
                    files: {
                        "index.html": result.files.html,
                        "style.css": result.files.css,
                        "script.js": result.files.js,
                    },
                    previewEntry: "index.html",
                }
                : {
                    kind: "single-file",
                    filename: result.singleFile?.filename ?? "main.txt",
                    language: result.singleFile?.language ?? result.language,
                    code: result.singleFile?.code ?? "",
                }

        await updateTask({
            taskId,
            status: "completed",
            outputResult,
            blockchain,
        })
        await createAgentRun(taskId, { stage: "coding-generation", status: "completed" }, Date.now() - startedAt)

        return NextResponse.json({
            success: true,
            projectId: taskId,
            taskId,
            files: result.files,
            singleFile: result.singleFile,
            raw: result.raw,
            preview: result.files ? previewTool(taskId) : null,
            language: result.language,
        })
    } catch (error: unknown) {
        console.error("[run-coding-agent] Error:", error)

        if (taskId) {
            const message = error instanceof Error ? error.message : "Internal server error"
            await Promise.allSettled([
                failTask(taskId, message),
                createAgentRun(taskId, { stage: "coding-generation", status: "failed", message }, Date.now() - startedAt),
            ])
        }

        if (error instanceof AgentExecutionError) {
            return NextResponse.json(
                { error: error.message, code: error.code, details: error.details },
                { status: error.status }
            )
        }

        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Internal server error" },
            { status: 500 }
        )
    }
}
