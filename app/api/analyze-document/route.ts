import { NextResponse } from "next/server"
import { analyzeDocument } from "@/lib/agents/documentAgentService"
import { AgentExecutionError } from "@/lib/agents/shared"
import { createAgentRun, createTask, failTask, updateTask } from "@/lib/services/taskService"
import { upsertUserByWallet } from "@/lib/services/userService"
import { requireWalletAddress } from "@/lib/services/validation"

export const runtime = "nodejs"
export const maxDuration = 60

export async function POST(req: Request) {
    let taskId: string | null = null
    const startedAt = Date.now()

    try {
        const formData = await req.formData()
        const file = formData.get("file")
        const question = formData.get("question")
        const walletAddress = formData.get("walletAddress")
        const blockchain = (() => {
            const raw = formData.get("blockchain")
            if (typeof raw !== "string" || !raw.trim()) return undefined
            try {
                return JSON.parse(raw) as Record<string, unknown>
            } catch {
                return undefined
            }
        })()

        if (!(file instanceof File)) {
            return NextResponse.json({ error: "A document file is required." }, { status: 400 })
        }

        const normalizedWalletAddress = requireWalletAddress(walletAddress)
        await upsertUserByWallet(normalizedWalletAddress)

        const task = await createTask({
            walletAddress: normalizedWalletAddress,
            agentType: "document",
            inputPrompt: typeof question === "string" && question.trim()
                ? `${file.name}: ${question.trim()}`
                : `Analyze document ${file.name}`,
            status: "pending",
            blockchain,
        })
        taskId = task.id

        const buffer = Buffer.from(await file.arrayBuffer())
        const result = await analyzeDocument({
            fileName: file.name,
            mimeType: file.type,
            buffer,
            question: typeof question === "string" ? question : undefined,
        })

        await updateTask({
            taskId,
            status: "completed",
            outputResult: result,
            blockchain,
        })
        await createAgentRun(taskId, { stage: "document-analysis", status: "completed", fileName: file.name }, Date.now() - startedAt)

        return NextResponse.json({
            success: true,
            taskId,
            ...result,
        })
    } catch (error: unknown) {
        console.error("[analyze-document] Error:", error)

        if (taskId) {
            const message = error instanceof Error ? error.message : "Document analysis failed"
            await Promise.allSettled([
                failTask(taskId, message),
                createAgentRun(taskId, { stage: "document-analysis", status: "failed", message }, Date.now() - startedAt),
            ])
        }

        if (error instanceof AgentExecutionError) {
            return NextResponse.json(
                { error: error.message, code: error.code, details: error.details },
                { status: error.status }
            )
        }

        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Document analysis failed" },
            { status: 500 }
        )
    }
}
