import nodemailer from "nodemailer"
import { AgentExecutionError } from "@/lib/agents/shared"

export type SendEmailInput = {
    senderEmail: string
    receiverEmail: string
    subject: string
    body: string
}

let cachedTransporter: nodemailer.Transporter | null = null

function requireEnv(name: "EMAIL_USER" | "EMAIL_PASS" | "EMAIL_FROM") {
    const value = process.env[name]?.trim()
    if (!value) {
        throw new AgentExecutionError("EMAIL_CONFIG_MISSING", `${name} is not configured.`, 500)
    }

    return value
}

function getTransporter() {
    if (cachedTransporter) {
        return cachedTransporter
    }

    cachedTransporter = nodemailer.createTransport({
        service: "gmail",
        auth: {
            user: requireEnv("EMAIL_USER"),
            pass: requireEnv("EMAIL_PASS"),
        },
    })

    return cachedTransporter
}

export async function sendGeneratedEmail(input: SendEmailInput) {
    const fromAddress = requireEnv("EMAIL_FROM")
    const transporter = getTransporter()

    try {
        const info = await transporter.sendMail({
            from: fromAddress,
            to: input.receiverEmail,
            replyTo: input.senderEmail,
            subject: input.subject,
            text: input.body,
        })

        return {
            messageId: info.messageId,
            accepted: info.accepted,
            rejected: info.rejected,
            from: fromAddress,
        }
    } catch (error) {
        throw new AgentExecutionError(
            "EMAIL_SEND_FAILED",
            error instanceof Error ? error.message : "Failed to send email.",
            502
        )
    }
}
