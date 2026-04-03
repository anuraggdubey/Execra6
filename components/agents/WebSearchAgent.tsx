"use client"

import { useState } from "react"
import { AlertCircle, CheckCircle2, ExternalLink, Globe2, Loader2, PlayCircle, Search, Sparkles } from "lucide-react"
import { useAgentContext } from "@/lib/AgentContext"
import { useWalletContext } from "@/lib/WalletContext"
import { finalizeEscrowedTask, prepareEscrowedTask, rollbackEscrowedTask } from "@/lib/soroban/taskLifecycle"
import type { SearchDepth } from "@/lib/services/searchService"
import type { VideoResult } from "@/lib/services/videoService"

type RunState = "idle" | "running" | "done" | "error"

type SearchResponse = {
    success: true
    taskId: string
    transactionVerified: boolean
    summary: string
    keyInsights?: string[]
    results: Array<{
        title: string
        link: string
        description: string
    }>
    videos: VideoResult[]
}

type SearchOutput = {
    summary: string
    keyInsights: string[]
    results: SearchResponse["results"]
    videos: VideoResult[]
}

function getErrorMessage(error: unknown, fallback: string) {
    const message = error instanceof Error ? error.message : fallback
    if (message.includes("429 Provider returned error")) {
        return "The model provider is rate-limiting requests right now. Retry in a moment."
    }
    return message
}

function toEmbedUrl(url: string) {
    try {
        const parsed = new URL(url)
        if (parsed.hostname.includes("youtu.be")) {
            const videoId = parsed.pathname.replace("/", "")
            return videoId ? `https://www.youtube.com/embed/${videoId}` : null
        }

        if (parsed.hostname.includes("youtube.com")) {
            const videoId = parsed.searchParams.get("v")
            return videoId ? `https://www.youtube.com/embed/${videoId}` : null
        }
    } catch {
        return null
    }

    return null
}

export default function WebSearchAgent() {
    const { walletAddress, walletProviderId } = useWalletContext()
    const { startAgentRun, completeAgentRun, failAgentRun } = useAgentContext()
    const [query, setQuery] = useState("")
    const [depth, setDepth] = useState<SearchDepth>("basic")
    const [includeVideos, setIncludeVideos] = useState(true)
    const [rewardXlm, setRewardXlm] = useState("0.0800000")
    const [runState, setRunState] = useState<RunState>("idle")
    const [error, setError] = useState<string | null>(null)
    const [txState, setTxState] = useState<string | null>(null)
    const [result, setResult] = useState<SearchOutput | null>(null)
    const [lastSignature, setLastSignature] = useState<string | null>(null)

    const locked = runState === "running"
    const canSearch = Boolean(walletAddress && query.trim()) && !locked

    const runSearch = async () => {
        if (!canSearch) return

        const signature = `${query.trim().toLowerCase()}|${depth}|${includeVideos}`
        if (signature === lastSignature && result) {
            return
        }

        setRunState("running")
        setError(null)
        setResult(null)
        setTxState("Creating escrow transaction on Soroban...")
        startAgentRun("search", `Searching the web for: ${query.trim()}`)

        let preparedTask: Awaited<ReturnType<typeof prepareEscrowedTask>> | null = null

        try {
            preparedTask = await prepareEscrowedTask({
                walletAddress: walletAddress!,
                walletProviderId,
                rewardXlm,
                agentType: "search",
            })

            setTxState(`Escrow created (TX: ${preparedTask.blockchainPayload.createTxHash.slice(0, 8)}...). Searching...`)
            const response = await fetch("/api/agent/web-search", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    query,
                    depth,
                    includeVideos,
                    walletAddress,
                    blockchain: preparedTask.blockchainPayload,
                }),
            })

            const data = await response.json() as (SearchResponse & { error?: string })
            if (!response.ok) {
                throw new Error(data.error ?? "Web search failed")
            }

            setResult({
                summary: data.summary,
                keyInsights: data.keyInsights ?? [],
                results: data.results ?? [],
                videos: data.videos ?? [],
            })
            setTxState("Finalizing escrow — confirming on-chain...")

            const finalizeResult = await finalizeEscrowedTask({
                taskId: data.taskId,
                walletAddress: walletAddress!,
                walletProviderId,
                onChainTaskId: preparedTask.onChainTaskId,
                blockchainPayload: preparedTask.blockchainPayload,
            })

            setLastSignature(signature)
            setTxState(`On-chain confirmed ✓ (TX: ${finalizeResult.txHash.slice(0, 8)}...)`)
            setRunState("done")
            completeAgentRun("search", `Returned ${data.results.length} source-backed result${data.results.length === 1 ? "" : "s"} for ${query.trim()}.`)
        } catch (error: unknown) {
            const message = getErrorMessage(error, "Web search failed")
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
            failAgentRun("search", message)
        }
    }

    return (
        <section className="panel overflow-hidden">
            <div className="flex flex-col gap-2 border-b border-border px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:px-5 sm:py-4">
                <div>
                    <div className="eyebrow">Web Search Agent</div>
                    <h2 className="mt-0.5 text-base font-semibold tracking-tight text-foreground sm:mt-1 sm:text-lg">
                        Search first, summarize second
                    </h2>
                </div>
                <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1.5 text-[11px] font-semibold text-primary">
                    <Globe2 size={14} />
                    Escrow-verified search flow
                </div>
            </div>

            <div className="space-y-5 p-3 sm:p-5">
                <div className="space-y-4">
                    <div>
                        <label className="mb-2 block text-sm font-medium text-foreground">Search query</label>
                        <textarea
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                            rows={5}
                            disabled={locked}
                            placeholder="Compare the latest stable Starknet and Stellar smart contract tooling for MVP teams."
                            className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted focus:border-primary focus:ring-2 focus:ring-[color:var(--ring)] disabled:opacity-60"
                        />
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                        <div>
                            <label className="mb-2 block text-sm font-medium text-foreground">Depth</label>
                            <select
                                value={depth}
                                onChange={(event) => setDepth(event.target.value as SearchDepth)}
                                disabled={locked}
                                className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm text-foreground focus:border-primary focus:ring-2 focus:ring-[color:var(--ring)] disabled:opacity-60"
                            >
                                <option value="basic">Basic</option>
                                <option value="detailed">Detailed</option>
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
                            <p className="mt-2 text-xs text-muted">Escrow is created before search starts and confirmed after structured results are ready.</p>
                        </div>
                    </div>

                    <label className="flex items-center gap-3 rounded-xl border border-border bg-background px-4 py-3 text-sm text-foreground">
                        <input
                            type="checkbox"
                            checked={includeVideos}
                            onChange={(event) => setIncludeVideos(event.target.checked)}
                            disabled={locked}
                            className="h-4 w-4 rounded border-border text-primary focus:ring-[color:var(--ring)]"
                        />
                        Include related videos
                    </label>

                    <div className="flex flex-wrap gap-3">
                        <button
                            onClick={() => void runSearch()}
                            disabled={!canSearch}
                            className="button-primary disabled:opacity-50"
                        >
                            {runState === "running" ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
                            {runState === "running" ? "Searching" : "Run Web Search Agent"}
                        </button>
                        <button
                            onClick={() => {
                                setQuery("")
                                setDepth("basic")
                                setIncludeVideos(true)
                                setResult(null)
                                setError(null)
                                setRunState("idle")
                                setTxState(null)
                                setLastSignature(null)
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
                            Connect a wallet before searching so the agent can verify escrow on-chain.
                        </div>
                    )}
                </div>

                <div className="space-y-4 rounded-xl border border-border bg-surface p-3 sm:rounded-2xl sm:p-5">
                    <div className="flex items-center justify-between">
                        <div>
                            <div className="eyebrow">Output</div>
                            <div className="mt-1 text-sm font-semibold text-foreground">Source-backed summary</div>
                        </div>
                        <span className={`rounded-full px-3 py-1 text-xs font-medium ${
                            runState === "running" ? "bg-primary-soft text-primary" :
                            runState === "done" ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" :
                            runState === "error" ? "bg-red-500/10 text-red-600 dark:text-red-400" :
                            "bg-surface-elevated text-muted"
                        }`}>
                            {runState === "running" ? "Running" :
                                runState === "done" ? "Ready" :
                                runState === "error" ? "Error" :
                                "Idle"}
                        </span>
                    </div>

                    {runState === "running" && (
                        <div className="rounded-xl border border-border bg-background p-4">
                            <div className="flex items-center gap-2 text-sm text-foreground-soft">
                                <Loader2 size={15} className="animate-spin text-primary" />
                                Searching sources and preparing the summary...
                            </div>
                        </div>
                    )}

                    {!result && runState !== "running" && (
                        <div className="rounded-xl border border-dashed border-border bg-background px-4 py-10 text-center">
                            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-soft text-primary">
                                <Globe2 size={20} />
                            </div>
                            <div className="mt-4 text-sm font-semibold text-foreground">No search results yet</div>
                            <p className="mt-2 text-sm leading-relaxed text-foreground-soft">
                                Enter a query to retrieve summarized web results, clickable sources, and optional videos.
                            </p>
                        </div>
                    )}

                    {result && (
                        <div className="space-y-4">
                            <div className="rounded-xl border border-border bg-background p-4">
                                <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                                    <Sparkles size={15} className="text-primary" />
                                    Summary
                                </div>
                                <p className="mt-2 text-sm leading-relaxed text-foreground-soft">{result.summary}</p>
                            </div>

                            {result.keyInsights.length > 0 && (
                                <div className="rounded-xl border border-border bg-background p-4">
                                    <div className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">Key insights</div>
                                    <div className="mt-3 space-y-2">
                                        {result.keyInsights.map((insight) => (
                                            <div key={insight} className="flex items-start gap-2 text-sm text-foreground-soft">
                                                <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-primary" />
                                                <span>{insight}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div className="space-y-3">
                                <div className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">Sources</div>
                                {result.results.map((item) => (
                                    <a
                                        key={item.link}
                                        href={item.link}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="block rounded-xl border border-border bg-background p-4 transition-colors hover:bg-surface-elevated"
                                    >
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <div className="text-sm font-semibold text-foreground">{item.title}</div>
                                                <div className="mt-1 break-all text-xs text-primary">{item.link}</div>
                                            </div>
                                            <ExternalLink size={14} className="mt-0.5 shrink-0 text-muted" />
                                        </div>
                                        {item.description && (
                                            <p className="mt-3 text-sm leading-relaxed text-foreground-soft">{item.description}</p>
                                        )}
                                    </a>
                                ))}
                            </div>

                            {result.videos.length > 0 && (
                                <div className="space-y-3">
                                    <div className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">Videos</div>
                                    {result.videos.map((video) => {
                                        const embedUrl = toEmbedUrl(video.url)
                                        return (
                                            <div key={video.url} className="rounded-xl border border-border bg-background p-4">
                                                <a
                                                    href={video.url}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="flex items-center gap-2 text-sm font-semibold text-foreground hover:text-primary"
                                                >
                                                    <PlayCircle size={15} className="text-primary" />
                                                    <span>{video.title}</span>
                                                </a>
                                                {embedUrl && (
                                                    <div className="mt-3 overflow-hidden rounded-xl border border-border">
                                                        <iframe
                                                            src={embedUrl}
                                                            title={video.title}
                                                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                                            allowFullScreen
                                                            className="aspect-video w-full"
                                                        />
                                                    </div>
                                                )}
                                            </div>
                                        )
                                    })}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </section>
    )
}
