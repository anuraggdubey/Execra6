import { NextResponse } from "next/server"
import type { EmailTone } from "@/lib/agents/emailAgentService"
import { generateEmailDraft } from "@/lib/agents/emailAgentService"
import { AgentExecutionError } from "@/lib/agents/shared"
import { createAgentRun, createTask, failTask, updateTask } from "@/lib/services/taskService"
import { sendGeneratedEmail } from "@/lib/services/emailService"
import { upsertUserByWallet } from "@/lib/services/userService"
import { requireEmailAddress, requireNonEmptyText, requireWalletAddress } from "@/lib/services/validation"
import type { OnChainTaskStatus } from "@/types/tasks"

export const runtime = "nodejs"
export const maxDuration = 60

type EmailRouteBody = {
    action?: unknown
    senderEmail?: unknown
    receiverEmail?: unknown
    subject?: unknown
    body?: unknown
    context?: unknown
    tone?: unknown
    walletAddress?: unknown
    blockchain?: Record<string, unknown>
}

type EmailRouteAction = "generate" | "send"

type BlockchainPayload = {
    onChainTaskId: string
    rewardStroops: string
    contractId: string
    onChainStatus: OnChainTaskStatus
    createTxHash: string
}

function requireAction(value: unknown): EmailRouteAction {
    if (value === "generate" || value === "send") {
        return value
    }

    throw new AgentExecutionError("INVALID_ACTION", "Action must be generate or send.", 400)
}

function requireEmailTone(value: unknown): EmailTone | undefined {
    if (value === undefined || value === null || value === "") {
        return undefined
    }

    if (value === "formal" || value === "informal" || value === "professional") {
        return value
    }

    throw new AgentExecutionError("INVALID_TONE", "Tone must be formal, informal, or professional.", 400)
}

function requireBlockchainPayload(value: unknown): BlockchainPayload {
    const payload = value as Partial<BlockchainPayload> | undefined

    if (
        !payload ||
        typeof payload.onChainTaskId !== "string" ||
        typeof payload.rewardStroops !== "string" ||
        typeof payload.contractId !== "string" ||
        typeof payload.onChainStatus !== "string" ||
        typeof payload.createTxHash !== "string"
    ) {
        throw new AgentExecutionError(
            "ESCROW_VERIFICATION_FAILED",
            "A confirmed escrow payload is required before the Email Agent can send.",
            403
        )
    }

    return {
        onChainTaskId: payload.onChainTaskId,
        rewardStroops: payload.rewardStroops,
        contractId: payload.contractId,
        onChainStatus: payload.onChainStatus as OnChainTaskStatus,
        createTxHash: payload.createTxHash,
    }
}

export async function POST(req: Request) {
    let taskId: string | null = null
    const startedAt = Date.now()

    try {
        const body = await req.json() as EmailRouteBody
        const action = requireAction(body.action)
        const senderEmail = requireEmailAddress(body.senderEmail, "senderEmail")
        const receiverEmail = requireEmailAddress(body.receiverEmail, "receiverEmail")

        if (action === "generate") {
            const subject = requireNonEmptyText(body.subject, "subject")
            const context = requireNonEmptyText(body.context, "context")
            const tone = requireEmailTone(body.tone)
            const walletAddress = requireWalletAddress(body.walletAddress)
            const blockchain = requireBlockchainPayload(body.blockchain)

            await upsertUserByWallet(walletAddress)

            const task = await createTask({
                walletAddress,
                agentType: "email",
                inputPrompt: `${receiverEmail}: ${subject} | ${context}`,
                status: "pending",
                blockchain,
            })
            taskId = task.id

            const generatedEmail = await generateEmailDraft({
                senderEmail,
                receiverEmail,
                subject,
                context,
                tone,
            })

            await updateTask({
                taskId,
                status: "completed",
                outputResult: {
                    senderEmail,
                    receiverEmail,
                    requestedSubject: subject,
                    tone: tone ?? "professional",
                    generatedEmail,
                    mode: "preview",
                },
                blockchain,
            })
            await createAgentRun(
                taskId,
                { stage: "email-preview", status: "completed", receiverEmail },
                Date.now() - startedAt
            )

            return NextResponse.json({
                success: true,
                taskId,
                generatedEmail,
            })
        }

        const emailSubject = requireNonEmptyText(body.subject, "subject")
        const emailBody = requireNonEmptyText(body.body, "body")

        const delivery = await sendGeneratedEmail({
            senderEmail,
            receiverEmail,
            subject: emailSubject,
            body: emailBody,
        })

        return NextResponse.json({
            success: true,
            generatedEmail: {
                subject: emailSubject,
                body: emailBody,
            },
            delivery,
        })
    } catch (error: unknown) {
        console.error("[email-agent] Error:", error)

        if (taskId) {
            const message = error instanceof Error ? error.message : "Email agent failed"
            await Promise.allSettled([
                failTask(taskId, message),
                createAgentRun(taskId, { stage: "email-delivery", status: "failed", message }, Date.now() - startedAt),
            ])
        }

        if (error instanceof AgentExecutionError) {
            return NextResponse.json(
                { error: error.message, code: error.code, details: error.details },
                { status: error.status }
            )
        }

        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Email agent failed" },
            { status: 500 }
        )
    }
}
