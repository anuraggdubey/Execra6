"use client"

import { useState } from "react"
import { AlertCircle, CheckCircle2, Download, ExternalLink, Loader2, Mail, Send, ShieldCheck, Sparkles } from "lucide-react"
import { useAgentContext } from "@/lib/AgentContext"
import { useWalletContext } from "@/lib/WalletContext"
import { finalizeEscrowedTask, prepareEscrowedTask, rollbackEscrowedTask } from "@/lib/soroban/taskLifecycle"

type Tone = "formal" | "informal" | "professional"
type RunState = "idle" | "generating" | "preview-ready" | "sending" | "sent" | "error"

type GeneratedEmail = {
    subject: string
    body: string
}

type GenerateResponse = {
    success: true
    taskId: string
    generatedEmail: GeneratedEmail
}

type SendResponse = {
    success: true
    taskId: string
    transactionVerified: boolean
    generatedEmail: GeneratedEmail
    delivery?: {
        messageId?: string
        from?: string
    }
}

function getErrorMessage(error: unknown, fallback: string) {
    const message = error instanceof Error ? error.message : fallback
    if (message.includes("429 Provider returned error")) {
        return "The model provider is rate-limiting requests right now. Retry in a moment."
    }
    return message
}

export default function EmailAgent() {
    const { walletAddress, walletProviderId } = useWalletContext()
    const { startAgentRun, completeAgentRun, failAgentRun } = useAgentContext()
    const [senderEmail, setSenderEmail] = useState("")
    const [receiverEmail, setReceiverEmail] = useState("")
    const [subject, setSubject] = useState("")
    const [context, setContext] = useState("")
    const [tone, setTone] = useState<Tone>("professional")
    const [rewardXlm, setRewardXlm] = useState("0.1000000")
    const [runState, setRunState] = useState<RunState>("idle")
    const [error, setError] = useState<string | null>(null)
    const [txState, setTxState] = useState<string | null>(null)
    const [verificationStatus, setVerificationStatus] = useState<string | null>(null)
    const [preview, setPreview] = useState<GeneratedEmail | null>(null)
    const [delivery, setDelivery] = useState<SendResponse["delivery"] | null>(null)

    const locked = runState === "generating" || runState === "sending"
    const canGenerate = Boolean(walletAddress && senderEmail.trim() && receiverEmail.trim() && subject.trim() && context.trim()) && !locked
    const canSend = Boolean(preview) && !locked

    const downloadDraft = () => {
        if (!preview) return

        const lines = [
            `To: ${receiverEmail}`,
            `Reply-To: ${senderEmail}`,
            `Subject: ${preview.subject}`,
            "MIME-Version: 1.0",
            "Content-Type: text/plain; charset=UTF-8",
            "",
            preview.body,
        ]

        const blob = new Blob([lines.join("\n")], { type: "message/rfc822;charset=utf-8" })
        const url = URL.createObjectURL(blob)
        const link = document.createElement("a")
        const safeSubject = preview.subject.replace(/[^a-z0-9-_]+/gi, "-").replace(/^-+|-+$/g, "") || "email-draft"

        link.href = url
        link.download = `${safeSubject}.eml`
        document.body.appendChild(link)
        link.click()
        link.remove()
        URL.revokeObjectURL(url)
    }

    const openInGmail = () => {
        if (!preview) return

        const gmailUrl = new URL("https://mail.google.com/mail/")
        gmailUrl.searchParams.set("view", "cm")
        gmailUrl.searchParams.set("fs", "1")
        gmailUrl.searchParams.set("to", receiverEmail)
        gmailUrl.searchParams.set("su", preview.subject)
        gmailUrl.searchParams.set("body", preview.body)

        window.open(gmailUrl.toString(), "_blank", "noopener,noreferrer")
    }

    const generatePreview = async () => {
        if (!canGenerate) return

        setRunState("generating")
        setError(null)
        setTxState("Creating escrow transaction on Soroban...")
        setVerificationStatus("Creating escrow before generating the email preview...")
        setDelivery(null)
        startAgentRun("email", `Generating email preview for ${receiverEmail}`)

        let preparedTask: Awaited<ReturnType<typeof prepareEscrowedTask>> | null = null

        try {
            preparedTask = await prepareEscrowedTask({
                walletAddress: walletAddress!,
                walletProviderId,
                rewardXlm,
                agentType: "email",
            })

            setTxState(`Escrow created (TX: ${preparedTask.blockchainPayload.createTxHash.slice(0, 8)}...). Generating preview...`)
            const response = await fetch("/api/agent/email", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action: "generate",
                    senderEmail,
                    receiverEmail,
                    subject,
                    context,
                    tone,
                    walletAddress,
                    blockchain: preparedTask.blockchainPayload,
                }),
            })

            const data = await response.json() as GenerateResponse & { error?: string }
            if (!response.ok) {
                throw new Error(data.error ?? "Email preview generation failed")
            }

            setPreview(data.generatedEmail)
            setTxState("Finalizing escrow — confirming on-chain...")
            const finalizeResult = await finalizeEscrowedTask({
                taskId: data.taskId,
                walletAddress: walletAddress!,
                walletProviderId,
                onChainTaskId: preparedTask.onChainTaskId,
                blockchainPayload: preparedTask.blockchainPayload,
            })
            setVerificationStatus("On-chain confirmed. Preview generated and ready for download, Gmail, or platform send.")
            setTxState(`On-chain confirmed ✓ (TX: ${finalizeResult.txHash.slice(0, 8)}...)`)
            setRunState("preview-ready")
            completeAgentRun("email", `Generated an email preview for ${receiverEmail}.`)
        } catch (error: unknown) {
            const message = getErrorMessage(error, "Email preview generation failed")
            setError(message)
            if (preparedTask && walletAddress) {
                setTxState("Rolling back escrowed reward...")
                await rollbackEscrowedTask({
                    walletAddress,
                    walletProviderId,
                    onChainTaskId: preparedTask.onChainTaskId,
                    blockchainPayload: preparedTask.blockchainPayload,
                }).catch(() => undefined)
            }
            setTxState(null)
            setVerificationStatus(null)
            setRunState("error")
            failAgentRun("email", message)
        }
    }

    const sendPreview = async () => {
        if (!preview || locked) return

        setRunState("sending")
        setError(null)
        setTxState("Sending approved email via platform mailbox...")
        setVerificationStatus("Sending through the platform mailbox. Replies will go to the sender email you entered.")

        try {
            const response = await fetch("/api/agent/email", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action: "send",
                    senderEmail,
                    receiverEmail,
                    subject: preview.subject,
                    body: preview.body,
                }),
            })

            const data = await response.json() as SendResponse & { error?: string }
            if (!response.ok) {
                throw new Error(data.error ?? "Email sending failed")
            }

            setPreview(data.generatedEmail)
            setDelivery(data.delivery ?? null)
            setVerificationStatus("Email delivered through the platform mailbox.")
            setTxState("Platform send completed.")
            setRunState("sent")
        } catch (error: unknown) {
            const message = getErrorMessage(error, "Email sending failed")
            setError(message)
            setTxState(null)
            setRunState("error")
        }
    }

    return (
        <section className="panel overflow-hidden">
            <div className="flex flex-col gap-2 border-b border-border px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:px-5 sm:py-4">
                <div>
                    <div className="eyebrow">Email Agent</div>
                    <h2 className="mt-0.5 text-base font-semibold tracking-tight text-foreground sm:mt-1 sm:text-lg">
                        Preview first, then download or send
                    </h2>
                </div>
                <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1.5 text-[11px] font-semibold text-primary">
                    <ShieldCheck size={14} />
                    Platform send is optional
                </div>
            </div>

            <div className="grid gap-4 p-3 sm:gap-5 sm:p-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                <div className="space-y-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                        <div>
                            <label className="mb-2 block text-sm font-medium text-foreground">Sender email</label>
                            <input
                                value={senderEmail}
                                onChange={(event) => setSenderEmail(event.target.value)}
                                disabled={locked}
                                placeholder="sender@example.com"
                                className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm text-foreground focus:border-primary focus:ring-2 focus:ring-[color:var(--ring)] disabled:opacity-60"
                            />
                        </div>
                        <div>
                            <label className="mb-2 block text-sm font-medium text-foreground">Receiver email</label>
                            <input
                                value={receiverEmail}
                                onChange={(event) => setReceiverEmail(event.target.value)}
                                disabled={locked}
                                placeholder="receiver@example.com"
                                className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm text-foreground focus:border-primary focus:ring-2 focus:ring-[color:var(--ring)] disabled:opacity-60"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="mb-2 block text-sm font-medium text-foreground">Requested subject</label>
                        <input
                            value={subject}
                            onChange={(event) => setSubject(event.target.value)}
                            disabled={locked}
                            placeholder="Follow-up on our escrow-backed project milestone"
                            className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm text-foreground focus:border-primary focus:ring-2 focus:ring-[color:var(--ring)] disabled:opacity-60"
                        />
                    </div>

                    <div>
                        <label className="mb-2 block text-sm font-medium text-foreground">Context</label>
                        <textarea
                            value={context}
                            onChange={(event) => setContext(event.target.value)}
                            rows={7}
                            disabled={locked}
                            placeholder="Explain the purpose of the email, the action needed, and any relevant project or payment context."
                            className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted focus:border-primary focus:ring-2 focus:ring-[color:var(--ring)] disabled:opacity-60"
                        />
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                        <div>
                            <label className="mb-2 block text-sm font-medium text-foreground">Tone</label>
                            <select
                                value={tone}
                                onChange={(event) => setTone(event.target.value as Tone)}
                                disabled={locked}
                                className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm text-foreground focus:border-primary focus:ring-2 focus:ring-[color:var(--ring)] disabled:opacity-60"
                            >
                                <option value="professional">Professional</option>
                                <option value="formal">Formal</option>
                                <option value="informal">Informal</option>
                            </select>
                        </div>
                        <div>
                            <label className="mb-2 block text-sm font-medium text-foreground">Reward (XLM)</label>
                            <input
                                value={rewardXlm}
                                onChange={(event) => setRewardXlm(event.target.value)}
                                inputMode="decimal"
                                disabled={locked}
                                className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm text-foreground focus:border-primary focus:ring-2 focus:ring-[color:var(--ring)] disabled:opacity-60"
                            />
                            <p className="mt-2 text-xs text-muted">Escrow is created before preview generation and confirmed once the draft is ready.</p>
                        </div>
                    </div>

                    <p className="text-xs text-muted">
                        Generate the draft first. Then either download it and send from the user&apos;s own Gmail or use the optional platform send flow.
                    </p>

                    <div className="flex flex-wrap gap-3">
                        <button
                            onClick={() => void generatePreview()}
                            disabled={!canGenerate}
                            className="button-primary disabled:opacity-50"
                        >
                            {runState === "generating" ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
                            {runState === "generating" ? "Generating" : "Generate Preview"}
                        </button>
                        <button
                            onClick={downloadDraft}
                            disabled={!preview || locked}
                            className="button-secondary disabled:opacity-50"
                        >
                            <Download size={15} />
                            Download Email
                        </button>
                        <button
                            onClick={openInGmail}
                            disabled={!preview || locked}
                            className="button-secondary disabled:opacity-50"
                        >
                            <ExternalLink size={15} />
                            Open in Gmail
                        </button>
                        <button
                            onClick={() => void sendPreview()}
                            disabled={!canSend}
                            className="button-secondary disabled:opacity-50"
                        >
                            {runState === "sending" ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                            {runState === "sending" ? "Sending" : "Send via Platform"}
                        </button>
                        <button
                            onClick={() => {
                                setSenderEmail("")
                                setReceiverEmail("")
                                setSubject("")
                                setContext("")
                                setTone("professional")
                                setPreview(null)
                                setDelivery(null)
                                setError(null)
                                setRunState("idle")
                                setTxState(null)
                                setVerificationStatus(null)
                            }}
                            disabled={locked}
                            className="button-secondary"
                        >
                            Clear
                        </button>
                    </div>

                    {error && (
                        <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-600 dark:text-red-400">
                            <div className="flex items-start gap-2">
                                <AlertCircle size={15} className="mt-0.5 shrink-0" />
                                <span>{error}</span>
                            </div>
                        </div>
                    )}

                    {verificationStatus && (
                        <div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-foreground-soft">
                            {verificationStatus}
                        </div>
                    )}

                    {preview && (
                        <div className="rounded-xl border border-border bg-background px-4 py-3 text-sm text-foreground-soft">
                            Downloaded drafts can be opened or attached in the user&apos;s own email app. The Gmail button opens a compose window with the generated recipient, subject, and message already filled in. If you choose platform send instead, the message is sent via the platform mailbox and replies go to the sender email you entered.
                        </div>
                    )}

                    {txState && (
                        <div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-foreground-soft">
                            {txState}
                        </div>
                    )}

                    {!walletAddress && (
                        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
                            Connect a wallet before generating a preview so the email agent can create escrow and confirm on-chain after the draft is produced.
                        </div>
                    )}
                </div>

                <div className="space-y-4 rounded-xl border border-border bg-surface p-3 sm:rounded-2xl sm:p-5">
                    <div className="flex items-center justify-between">
                        <div>
                            <div className="eyebrow">Preview</div>
                            <div className="mt-1 text-sm font-semibold text-foreground">Review before sending</div>
                        </div>
                        <span className={`rounded-full px-3 py-1 text-xs font-medium ${
                            runState === "generating" || runState === "sending" ? "bg-primary-soft text-primary" :
                            runState === "sent" ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" :
                            runState === "error" ? "bg-red-500/10 text-red-600 dark:text-red-400" :
                            preview ? "bg-amber-500/10 text-amber-700 dark:text-amber-300" :
                            "bg-surface-elevated text-muted"
                        }`}>
                            {runState === "generating" ? "Generating" :
                                runState === "sending" ? "Sending" :
                                runState === "sent" ? "Sent" :
                                runState === "error" ? "Error" :
                                preview ? "Ready to send" :
                                "Idle"}
                        </span>
                    </div>

                    {(runState === "generating" || runState === "sending") && (
                        <div className="rounded-xl border border-border bg-background p-4">
                            <div className="flex items-center gap-2 text-sm text-foreground-soft">
                                <Loader2 size={15} className="animate-spin text-primary" />
                                {runState === "generating" ? "Generating your email preview..." : "Sending the approved email..."}
                            </div>
                        </div>
                    )}

                    {!preview && runState !== "generating" && runState !== "sending" && (
                        <div className="rounded-xl border border-dashed border-border bg-background px-4 py-10 text-center">
                            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-soft text-primary">
                                <Mail size={20} />
                            </div>
                            <div className="mt-4 text-sm font-semibold text-foreground">No preview yet</div>
                            <p className="mt-2 text-sm leading-relaxed text-foreground-soft">
                                Generate the email first, review it, then either download it for Gmail/manual sending or optionally send it through the platform.
                            </p>
                        </div>
                    )}

                    {preview && (
                        <div className="space-y-4">
                            <div className="rounded-xl border border-border bg-background p-4">
                                <div className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">Subject</div>
                                <div className="mt-2 text-sm font-semibold text-foreground">{preview.subject}</div>
                            </div>

                            <div className="rounded-xl border border-border bg-background p-4">
                                <div className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">Body</div>
                                <pre className="mt-2 whitespace-pre-wrap font-sans text-sm leading-relaxed text-foreground-soft">
                                    {preview.body}
                                </pre>
                            </div>

                            <div className="rounded-xl border border-border bg-background p-4 text-sm">
                                <div className="flex items-center gap-2 font-semibold text-foreground">
                                    <CheckCircle2 size={15} className={runState === "sent" ? "text-emerald-500" : "text-amber-500"} />
                                    {runState === "sent" ? "Email delivered via platform mailbox" : "Preview only. Nothing has been sent yet."}
                                </div>
                                {delivery?.messageId && (
                                    <div className="mt-2 text-foreground-soft">Message ID: {delivery.messageId}</div>
                                )}
                                {delivery?.from && (
                                    <div className="mt-1 text-foreground-soft">Sent via platform mailbox as: {delivery.from}</div>
                                )}
                                <div className="mt-1 text-foreground-soft">
                                    Replies go to: {senderEmail || "the sender email you entered"}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </section>
    )
}
