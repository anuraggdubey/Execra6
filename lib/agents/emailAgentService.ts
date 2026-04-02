import { completeWithOpenRouter } from "@/lib/llm/openrouter"
import { AgentExecutionError, createLlmError } from "@/lib/agents/shared"

export type EmailTone = "formal" | "informal" | "professional"

export type EmailAgentInput = {
    senderEmail: string
    receiverEmail: string
    subject: string
    context: string
    tone?: EmailTone
}

export type GeneratedEmail = {
    subject: string
    body: string
}

const EMAIL_AGENT_SYSTEM_PROMPT = `You write polished outbound emails.

Return output in exactly this format:
Subject: <subject line>
Body:
<plain text email body>

Rules:
- Do not use markdown.
- Keep the email professional and well structured.
- Use the provided tone.
- Include a greeting and a clear closing when appropriate.
- Do not include any text before "Subject:" or after the email body.`

function parseGeneratedEmail(raw: string): GeneratedEmail {
    const match = raw.match(/^\s*Subject:\s*(.+?)\s*Body:\s*([\s\S]+)$/i)
    const subject = match?.[1]?.trim()
    const body = match?.[2]?.trim()

    if (!subject || !body) {
        throw new AgentExecutionError(
            "INVALID_LLM_OUTPUT",
            "Email agent did not return the required Subject/Body format.",
            502
        )
    }

    return { subject, body }
}

export async function generateEmailDraft(input: EmailAgentInput): Promise<GeneratedEmail> {
    try {
        const raw = await completeWithOpenRouter({
            system: EMAIL_AGENT_SYSTEM_PROMPT,
            user: [
                "Generate an email draft for this request.",
                `Sender email: ${input.senderEmail}`,
                `Receiver email: ${input.receiverEmail}`,
                `Preferred subject: ${input.subject}`,
                `Tone: ${input.tone ?? "professional"}`,
                `Context: ${input.context}`,
            ].join("\n"),
            maxTokens: 900,
            temperature: 0.4,
        })

        return parseGeneratedEmail(raw)
    } catch (error) {
        if (error instanceof AgentExecutionError) {
            throw error
        }

        throw createLlmError(error, "Email generation failed")
    }
}
