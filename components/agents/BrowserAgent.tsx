"use client"

import { useEffect, useRef, useState } from "react"
import { AlertCircle, Globe, Loader2, MonitorPlay, PlaySquare, ShieldCheck } from "lucide-react"
import { useAgentContext } from "@/lib/AgentContext"
import { useWalletContext } from "@/lib/WalletContext"
import { finalizeEscrowedTask, prepareEscrowedTask, rollbackEscrowedTask } from "@/lib/soroban/taskLifecycle"
import type { BrowserStructuredResult } from "@/lib/services/browserSessionStore"

type RunState = "idle" | "running" | "done" | "error"

type BrowserAgentResponse = {
    success: true
    taskId: string
    sessionId: string
    transactionVerified: boolean
    result: BrowserStructuredResult
}

function getErrorMessage(error: unknown, fallback: string) {
    const message = error instanceof Error ? error.message : fallback
    if (message.includes("429 Provider returned error")) {
        return "The model provider is rate-limiting requests right now. Retry in a moment."
    }
    return message
}

export default function BrowserAgent() {
    const { walletAddress, walletProviderId } = useWalletContext()
    const { startAgentRun, completeAgentRun, failAgentRun } = useAgentContext()
    const [instruction, setInstruction] = useState("")
    const [rewardXlm, setRewardXlm] = useState("0.2000000")
    const [runState, setRunState] = useState<RunState>("idle")
    const [error, setError] = useState<string | null>(null)
    const [txState, setTxState] = useState<string | null>(null)
    const [result, setResult] = useState<BrowserStructuredResult | null>(null)
    const [sessionId, setSessionId] = useState<string | null>(null)
    const eventSourceRef = useRef<EventSource | null>(null)

    const locked = runState === "running"
    const canRun = Boolean(walletAddress && instruction.trim()) && !locked

    useEffect(() => {
        return () => {
            eventSourceRef.current?.close()
        }
    }, [])

    const connectLogStream = (nextSessionId: string) => {
        eventSourceRef.current?.close()
        const source = new EventSource(`/api/agent/browser/events/${encodeURIComponent(nextSessionId)}`)
        eventSourceRef.current = source

        source.onmessage = (event) => {
            const data = JSON.parse(event.data) as
                | { type: "connected" }
                | { type: "log" }
                | { type: "done"; result: { result: BrowserStructuredResult } }
                | { type: "error"; error: string }

            if (data.type === "done") {
                setResult(data.result.result)
                source.close()
            }

            if (data.type === "error") {
                setError(data.error)
                source.close()
            }
        }

        source.onerror = () => {
            source.close()
        }
    }

    const runBrowserAgent = async () => {
        if (!canRun) return

        const nextSessionId = crypto.randomUUID()
        setSessionId(nextSessionId)
        setRunState("running")
        setError(null)
        setResult(null)
        setTxState("Creating escrow transaction on Soroban...")
        connectLogStream(nextSessionId)
        startAgentRun("browser", `Running browser workflow: ${instruction.trim()}`)

        let preparedTask: Awaited<ReturnType<typeof prepareEscrowedTask>> | null = null

        try {
            preparedTask = await prepareEscrowedTask({
                walletAddress: walletAddress!,
                walletProviderId,
                rewardXlm,
                agentType: "browser",
            })

            setTxState(`Escrow created (TX: ${preparedTask.blockchainPayload.createTxHash.slice(0, 8)}...). Launching browser...`)
            const response = await fetch("/api/agent/browser", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    instruction,
                    sessionId: nextSessionId,
                    walletAddress,
                    blockchain: preparedTask.blockchainPayload,
                }),
            })

            const data = await response.json() as BrowserAgentResponse & { error?: string }
            if (!response.ok) {
                throw new Error(data.error ?? "Browser automation failed")
            }

            setResult(data.result)
            setTxState("Finalizing escrow and confirming on-chain...")

            const finalizeResult = await finalizeEscrowedTask({
                taskId: data.taskId,
                walletAddress: walletAddress!,
                walletProviderId,
                onChainTaskId: preparedTask.onChainTaskId,
                blockchainPayload: preparedTask.blockchainPayload,
            })

            setTxState(`On-chain confirmed (TX: ${finalizeResult.txHash.slice(0, 8)}...)`)
            setRunState("done")
            completeAgentRun("browser", "Completed browser workflow.")
        } catch (error: unknown) {
            const message = getErrorMessage(error, "Browser automation failed")
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
            setRunState("error")
            failAgentRun("browser", message)
        }
    }

    return (
        <section className="panel overflow-hidden">
            <div className="flex flex-col gap-2 border-b border-border px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:px-5 sm:py-4">
                <div>
                    <div className="eyebrow">Browser Automation Agent</div>
                    <h2 className="mt-0.5 text-base font-semibold tracking-tight text-foreground sm:mt-1 sm:text-lg">
                        Visible browser workflows with clean final answers
                    </h2>
                </div>
                <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1.5 text-[11px] font-semibold text-primary">
                    <ShieldCheck size={14} />
                    Escrow-gated automation
                </div>
            </div>

            <div className="space-y-5 p-3 sm:p-5">
                <div className="grid gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(260px,1fr)] xl:items-start">
                    <div className="w-full max-w-3xl space-y-4 rounded-xl border border-border bg-surface p-3 sm:rounded-2xl sm:p-5">
                        <div>
                            <label htmlFor="browser-agent-instruction" className="mb-2 block text-sm font-medium text-foreground">Instruction</label>
                            <textarea
                                id="browser-agent-instruction"
                                value={instruction}
                                onChange={(event) => setInstruction(event.target.value)}
                                rows={7}
                                disabled={locked}
                                placeholder="Open https://example.com, find pricing, and tell me the main plans."
                                className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted focus:border-primary focus:ring-2 focus:ring-[color:var(--ring)] disabled:opacity-60"
                            />
                            <p className="mt-2 text-sm font-semibold text-foreground">
                                Warning: install Playwright Chromium first by running `npx playwright install chromium` on your system before using the browser tool.
                            </p>
                        </div>

                        <div>
                            <label htmlFor="browser-agent-reward" className="mb-2 block text-sm font-medium text-foreground">Reward (XLM)</label>
                            <input
                                id="browser-agent-reward"
                                value={rewardXlm}
                                onChange={(event) => setRewardXlm(event.target.value)}
                                inputMode="decimal"
                                disabled={locked}
                                className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm text-foreground focus:border-primary focus:ring-2 focus:ring-[color:var(--ring)] disabled:opacity-60"
                            />
                            <p className="mt-2 text-xs text-muted">The browser only launches after escrow is verified on-chain.</p>
                        </div>

                        <div className="flex flex-wrap gap-3">
                            <button
                                onClick={() => void runBrowserAgent()}
                                disabled={!canRun}
                                className="button-primary disabled:opacity-50"
                            >
                                {runState === "running" ? <Loader2 size={15} className="animate-spin" /> : <MonitorPlay size={15} />}
                                {runState === "running" ? "Running" : "Run Browser Agent"}
                            </button>
                            <button
                                onClick={() => {
                                    setInstruction("")
                                    setRewardXlm("0.2000000")
                                    setError(null)
                                    setRunState("idle")
                                    setTxState(null)
                                    setResult(null)
                                    setSessionId(null)
                                    eventSourceRef.current?.close()
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

                        {txState && (
                            <div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-foreground-soft">
                                {txState}
                            </div>
                        )}

                        {!walletAddress && (
                            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
                                Connect a wallet before running visible browser automation.
                            </div>
                        )}
                    </div>

                    <div className="hidden space-y-4 xl:sticky xl:top-4 xl:block">
                        <div className="rounded-xl border border-border bg-surface p-4">
                            <div className="eyebrow">Output</div>
                            <div className="mt-1 text-sm font-semibold text-foreground">Clean result cards</div>
                            <p className="mt-2 text-sm leading-relaxed text-foreground-soft">
                                The browser agent now focuses on a structured final answer instead of exposing step-by-step internals.
                            </p>
                        </div>
                        <div className="rounded-xl border border-border bg-surface p-4">
                            <div className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">Session</div>
                            <div className="mt-2 text-sm text-foreground-soft">
                                Status: <span className="font-semibold text-foreground">{runState === "running" ? "Active" : runState === "done" ? "Completed" : runState === "error" ? "Needs attention" : "Idle"}</span>
                            </div>
                            {sessionId && (
                                <div className="mt-1 break-all text-xs text-foreground-soft">Session: {sessionId}</div>
                            )}
                        </div>
                    </div>
                </div>

                <div className="space-y-4 rounded-xl border border-border bg-surface p-3 sm:rounded-2xl sm:p-5">
                    <div className="flex items-center justify-between">
                        <div>
                            <div className="eyebrow">Final Output</div>
                            <div className="mt-1 text-sm font-semibold text-foreground">Structured browser result</div>
                        </div>
                        <span className={`rounded-full px-3 py-1 text-xs font-medium ${
                            runState === "running" ? "bg-primary-soft text-primary" :
                            runState === "done" ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" :
                            runState === "error" ? "bg-red-500/10 text-red-600 dark:text-red-400" :
                            "bg-surface-elevated text-muted"
                        }`}>
                            {runState === "running" ? "Running" : runState === "done" ? "Ready" : runState === "error" ? "Error" : "Idle"}
                        </span>
                    </div>

                    {runState === "running" && !result && (
                        <div className="rounded-xl border border-border bg-background p-4">
                            <div className="flex items-center gap-2 text-sm text-foreground-soft">
                                <Loader2 size={15} className="animate-spin text-primary" />
                                Preparing your structured result...
                            </div>
                        </div>
                    )}

                    {!result && runState !== "running" && (
                        <div className="rounded-xl border border-dashed border-border bg-background px-4 py-10 text-center">
                            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-soft text-primary">
                                <PlaySquare size={20} />
                            </div>
                            <div className="mt-4 text-sm font-semibold text-foreground">No browser result yet</div>
                            <p className="mt-2 text-sm leading-relaxed text-foreground-soft">
                                Start a browser task to get a clean summary, details, key points, searched query, and suggestions.
                            </p>
                        </div>
                    )}

                    {result && (
                        <div className="grid gap-4 lg:grid-cols-2">
                            <div className="rounded-xl border border-border bg-background p-4 lg:col-span-2">
                                <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-muted">
                                    <Globe size={14} />
                                    Summary
                                </div>
                                <div className="text-sm leading-relaxed text-foreground">{result.summary}</div>
                            </div>

                            <div className="rounded-xl border border-border bg-background p-4">
                                <div className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">Searched Query</div>
                                <div className="mt-3 rounded-lg bg-surface px-3 py-2 text-sm text-foreground">{result.searchedQuery}</div>
                            </div>

                            <div className="rounded-xl border border-border bg-background p-4">
                                <div className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">Details</div>
                                <div className="mt-3 text-sm leading-relaxed text-foreground-soft">{result.details}</div>
                            </div>

                            <div className="rounded-xl border border-border bg-background p-4">
                                <div className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">Key Points</div>
                                {result.keyPoints.length > 0 ? (
                                    <div className="mt-3 space-y-2">
                                        {result.keyPoints.map((point, index) => (
                                            <div key={`${point}-${index}`} className="rounded-lg bg-surface px-3 py-2 text-sm text-foreground-soft">
                                                {point}
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="mt-3 text-sm text-muted">No key points were extracted.</div>
                                )}
                            </div>

                            <div className="rounded-xl border border-border bg-background p-4">
                                <div className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">Suggestions</div>
                                {result.suggestions.length > 0 ? (
                                    <div className="mt-3 space-y-2">
                                        {result.suggestions.map((suggestion, index) => (
                                            <div key={`${suggestion}-${index}`} className="rounded-lg bg-surface px-3 py-2 text-sm text-foreground-soft">
                                                {suggestion}
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="mt-3 text-sm text-muted">No suggestions were needed.</div>
                                )}
                            </div>
                        </div>
                    )}

                    {runState === "idle" && (
                        <div className="rounded-xl border border-border bg-background p-4 text-sm text-foreground-soft">
                            The browser will run in visible mode after escrow verification and return a clean structured answer.
                        </div>
                    )}

                    {runState === "running" && (
                        <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm text-foreground-soft">
                            The browser is working through the request and preparing a clean structured result.
                        </div>
                    )}

                    {runState === "done" && (
                        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-sm text-foreground-soft">
                            The browser run completed. Review the clean final result above.
                        </div>
                    )}

                    {runState === "error" && (
                        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-sm text-foreground-soft">
                            The browser run did not complete successfully. Retry the instruction or refine the site and task wording.
                        </div>
                    )}
                </div>
            </div>
        </section>
    )
}
