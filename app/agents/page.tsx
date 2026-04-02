"use client"

import { useMemo, useState } from "react"
import dynamic from "next/dynamic"
import {
    AlertCircle,
    Box,
    Braces,
    CheckCircle2,
    Download,
    ExternalLink,
    FileCode2,
    FileText,
    Github,
    Layers3,
    Loader2,
    Mail,
    Sparkles,
    Upload,
} from "lucide-react"
import ReactMarkdown from "react-markdown"
import type { Components } from "react-markdown"
import WorkspaceOnboarding from "@/components/WorkspaceOnboarding"
import { useAgentContext } from "@/lib/AgentContext"
import ConnectWalletButton from "@/components/wallet/ConnectWalletButton"
import { useWalletContext } from "@/lib/WalletContext"
import { finalizeEscrowedTask, prepareEscrowedTask, rollbackEscrowedTask } from "@/lib/soroban/taskLifecycle"
import { getGitHubSession } from "@/lib/wallet/githubSession"

const GitHubAgent = dynamic(() => import("@/components/agents/GitHubAgent"), {
    ssr: false,
    loading: () => (
        <div className="panel p-6">
            <div className="skeleton h-6 w-40" />
            <div className="skeleton mt-4 h-24" />
            <div className="skeleton mt-4 h-64" />
        </div>
    ),
})

const EmailAgent = dynamic(() => import("@/components/agents/EmailAgent"), {
    ssr: false,
    loading: () => (
        <div className="panel p-6">
            <div className="skeleton h-6 w-40" />
            <div className="skeleton mt-4 h-24" />
            <div className="skeleton mt-4 h-64" />
        </div>
    ),
})

type WorkspaceAgentId = "github" | "coding" | "document" | "email"
type RunState = "idle" | "running" | "done" | "error"

type AgentDefinition = {
    id: WorkspaceAgentId
    label: string
    icon: React.ElementType
    description: string
    badge: string
}

type GeneratedFiles = Record<string, string>

type CodingResult =
    | {
        mode: "project"
        projectId: string
        files: GeneratedFiles
        previewUrl: string
      }
    | {
        mode: "single-file"
        projectId: string
        fileName: string
        language: string
        code: string
      }

type DocumentResult = {
    fileName: string
    fileType: string
    analysis: string
    truncated: boolean
}

const AGENTS: AgentDefinition[] = [
    {
        id: "github",
        label: "GitHub Agent",
        icon: Github,
        description: "Connect a repository, index source context, and review code through a focused repo workflow.",
        badge: "Repository intelligence",
    },
    {
        id: "coding",
        label: "Coding Agent",
        icon: Braces,
        description: "Generate MVP-ready code artifacts and previews for product surfaces that feed the next integration phase.",
        badge: "Build surfaces",
    },
    {
        id: "document",
        label: "Document Agent",
        icon: FileText,
        description: "Parse project docs, specs, and datasets into concise analysis the team can use immediately.",
        badge: "Spec digestion",
    },
    {
        id: "email",
        label: "Email Agent",
        icon: Mail,
        description: "Generate outbound emails, verify escrow first, and send through the configured mailbox without leaving the workspace.",
        badge: "Escrow-backed delivery",
    },
]

function getErrorMessage(error: unknown, fallback: string) {
    const message = error instanceof Error ? error.message : fallback
    if (message.includes("429 Provider returned error")) {
        return "The model provider is rate-limiting requests right now. Retry in a moment or switch to a paid-capable model."
    }
    return message
}

async function parseApiJson<T>(response: Response): Promise<T> {
    const contentType = response.headers.get("content-type") ?? ""

    if (contentType.includes("application/json")) {
        return response.json() as Promise<T>
    }

    const text = await response.text()
    const compact = text.replace(/\s+/g, " ").trim()
    const preview = compact.slice(0, 180)

    if (/<!doctype html>|<html/i.test(text)) {
        throw new Error(
            `The server returned an HTML error page instead of JSON. This usually means the deployed API route crashed before sending a response.${preview ? ` Response preview: ${preview}` : ""}`
        )
    }

    throw new Error(preview || "The server returned a non-JSON response.")
}

export default function AgentsPage() {
    const { agents, startAgentRun, completeAgentRun, failAgentRun } = useAgentContext()
    const { walletAddress, shortWalletAddress, walletBalance, walletProviderId } = useWalletContext()
    const [selectedAgentId, setSelectedAgentId] = useState<WorkspaceAgentId>("github")

    const [codingPrompt, setCodingPrompt] = useState("")
    const [codingLanguage, setCodingLanguage] = useState("html-css-js")
    const [codingResult, setCodingResult] = useState<CodingResult | null>(null)
    const [codingState, setCodingState] = useState<RunState>("idle")
    const [codingError, setCodingError] = useState<string | null>(null)
    const [codingRewardXlm, setCodingRewardXlm] = useState("0.2500000")
    const [codingTxState, setCodingTxState] = useState<string | null>(null)

    const [documentFile, setDocumentFile] = useState<File | null>(null)
    const [documentQuestion, setDocumentQuestion] = useState("")
    const [documentResult, setDocumentResult] = useState<DocumentResult | null>(null)
    const [documentState, setDocumentState] = useState<RunState>("idle")
    const [documentError, setDocumentError] = useState<string | null>(null)
    const [documentRewardXlm, setDocumentRewardXlm] = useState("0.1500000")
    const [documentTxState, setDocumentTxState] = useState<string | null>(null)
    const codingLocked = codingState === "running"
    const documentLocked = documentState === "running"
    const selectedAgent = useMemo(
        () => AGENTS.find((agent) => agent.id === selectedAgentId) ?? AGENTS[0],
        [selectedAgentId]
    )
    const hasGitHubConnection = Boolean(getGitHubSession(walletAddress)?.accessToken)
    const hasCompletedTask = agents.some((agent) => agent.tasksCompleted > 0)

    const runCodingAgent = async () => {
        if (!walletAddress || !codingPrompt.trim() || codingState === "running") return

        setCodingState("running")
        setCodingError(null)
        setCodingResult(null)
        setCodingTxState("Creating escrow transaction on Soroban...")
        startAgentRun("coding", `Generating build output for: ${codingPrompt}`)

        let preparedTask: Awaited<ReturnType<typeof prepareEscrowedTask>> | null = null
        try {
            preparedTask = await prepareEscrowedTask({
                walletAddress,
                walletProviderId,
                rewardXlm: codingRewardXlm,
                agentType: "coding",
            })

            setCodingTxState(`Escrow created (TX: ${preparedTask.blockchainPayload.createTxHash.slice(0, 8)}…). Running agent…`)
            const response = await fetch("/api/run-coding-agent", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    prompt: codingPrompt,
                    language: codingLanguage,
                    walletAddress,
                    blockchain: preparedTask.blockchainPayload,
                }),
            })
            const data = await response.json()
            if (!response.ok) throw new Error(data.error ?? "Coding agent failed")

            if (data.files && data.preview?.previewUrl) {
                setCodingResult({
                    mode: "project",
                    projectId: data.projectId,
                    files: data.files,
                    previewUrl: data.preview.previewUrl,
                })
            } else if (data.singleFile) {
                setCodingResult({
                    mode: "single-file",
                    projectId: data.projectId,
                    fileName: data.singleFile.filename,
                    language: data.singleFile.language,
                    code: data.singleFile.code,
                })
            } else {
                throw new Error("Coding agent returned an incomplete payload.")
            }

            setCodingTxState("Finalizing escrow — confirming on-chain…")
            setCodingState("done")
            completeAgentRun("coding", `Prepared ${data.projectId} for handoff and follow-on integration.`)

            const finalizeResult = await finalizeEscrowedTask({
                taskId: data.taskId,
                walletAddress,
                walletProviderId,
                onChainTaskId: preparedTask.onChainTaskId,
                blockchainPayload: preparedTask.blockchainPayload,
            })

            setCodingTxState(`On-chain confirmed ✓ (TX: ${finalizeResult.txHash.slice(0, 8)}…)`)
        } catch (error: unknown) {
            const message = getErrorMessage(error, "Coding agent failed")
            setCodingError(message)
            if (preparedTask) {
                setCodingTxState("Rolling back escrowed reward...")
                await rollbackEscrowedTask({
                    walletAddress,
                    walletProviderId,
                    onChainTaskId: preparedTask.onChainTaskId,
                    blockchainPayload: preparedTask.blockchainPayload,
                }).catch(() => undefined)
            }
            setCodingTxState(null)
            setCodingState("error")
            failAgentRun("coding", message)
        }
    }

    const runDocumentAgent = async () => {
        if (!walletAddress || !documentFile || documentState === "running") return

        setDocumentState("running")
        setDocumentError(null)
        setDocumentResult(null)
        setDocumentTxState("Creating escrow transaction on Soroban...")
        startAgentRun("document", `Analyzing ${documentFile.name}`)

        let preparedTask: Awaited<ReturnType<typeof prepareEscrowedTask>> | null = null
        try {
            preparedTask = await prepareEscrowedTask({
                walletAddress,
                walletProviderId,
                rewardXlm: documentRewardXlm,
                agentType: "document",
            })
            setDocumentTxState(`Escrow created (TX: ${preparedTask.blockchainPayload.createTxHash.slice(0, 8)}…). Analyzing…`)
            const formData = new FormData()
            formData.append("file", documentFile)
            formData.append("question", documentQuestion)
            formData.append("walletAddress", walletAddress)
            formData.append("blockchain", JSON.stringify(preparedTask.blockchainPayload))

            const response = await fetch("/api/analyze-document", {
                method: "POST",
                body: formData,
            })
            const data = await parseApiJson<{
                error?: string
                taskId?: string
                fileName: string
                fileType: string
                analysis: string
                truncated?: boolean
            }>(response)
            if (!response.ok) throw new Error(data.error ?? "Document analysis failed")

            setDocumentResult({
                fileName: data.fileName,
                fileType: data.fileType,
                analysis: data.analysis,
                truncated: Boolean(data.truncated),
            })
            if (!data.taskId) {
                throw new Error("Document analysis returned without a task ID.")
            }
            const documentTaskId = data.taskId
            setDocumentTxState("Finalizing escrow — confirming on-chain…")
            setDocumentState("done")
            completeAgentRun("document", `Analyzed ${data.fileName} and prepared a concise brief.`)

            const finalizeResult = await finalizeEscrowedTask({
                taskId: documentTaskId,
                walletAddress,
                walletProviderId,
                onChainTaskId: preparedTask.onChainTaskId,
                blockchainPayload: preparedTask.blockchainPayload,
            })

            setDocumentTxState(`On-chain confirmed ✓ (TX: ${finalizeResult.txHash.slice(0, 8)}…)`)
        } catch (error: unknown) {
            const message = getErrorMessage(error, "Document analysis failed")
            setDocumentError(message)
            if (preparedTask) {
                setDocumentTxState("Rolling back escrowed reward...")
                await rollbackEscrowedTask({
                    walletAddress,
                    walletProviderId,
                    onChainTaskId: preparedTask.onChainTaskId,
                    blockchainPayload: preparedTask.blockchainPayload,
                }).catch(() => undefined)
            }
            setDocumentTxState(null)
            setDocumentState("error")
            failAgentRun("document", message)
        }
    }

    return (
        <div className="mx-auto w-full max-w-[1480px] overflow-x-hidden px-3 py-4 sm:px-6 sm:py-5 lg:px-8 lg:py-6">
            {/* ── Hero ── */}
            <section className="panel mb-4 rounded-xl px-4 py-4 sm:mb-6 sm:rounded-2xl sm:px-7 sm:py-6">
                <div className="grid gap-4 sm:gap-6 lg:grid-cols-[1fr_auto] lg:items-center">
                    <div>
                        <div className="eyebrow">Web3 MVP workspace</div>
                        <h1 className="mt-1.5 font-heading text-xl font-semibold tracking-[-0.03em] text-foreground sm:mt-2 sm:text-3xl">
                            Four agents, one surface.
                        </h1>
                        <p className="page-copy mt-2 hidden sm:block">
                            Focused on GitHub, Coding, and Document agents — your Stellar wallet is the primary identity
                            for every workflow.
                        </p>
                    </div>
                    <div className="-mx-1 flex gap-2 overflow-x-auto pb-1 sm:mx-0 sm:flex-wrap sm:gap-3 sm:overflow-visible sm:pb-0">
                        <div className="flex min-w-[100px] flex-shrink-0 flex-col gap-0.5 rounded-lg border border-border border-l-[3px] border-l-primary bg-surface-elevated px-3 py-2 sm:min-w-[130px] sm:gap-1 sm:rounded-xl sm:px-4 sm:py-3">
                            <div className="text-[9px] font-semibold uppercase tracking-[0.1em] text-muted sm:text-[10px]">Agents</div>
                            <div className="text-sm font-semibold tracking-tight text-foreground sm:text-base">{AGENTS.length}</div>
                        </div>
                        <div className="flex min-w-[100px] flex-shrink-0 flex-col gap-0.5 rounded-lg border border-border border-l-[3px] border-l-primary bg-surface-elevated px-3 py-2 sm:min-w-[130px] sm:gap-1 sm:rounded-xl sm:px-4 sm:py-3">
                            <div className="text-[9px] font-semibold uppercase tracking-[0.1em] text-muted sm:text-[10px]">Wallet</div>
                            <div className="text-sm font-semibold tracking-tight text-foreground sm:text-base">{walletAddress ? shortWalletAddress ?? "Connected" : "—"}</div>
                        </div>
                        <div className="flex min-w-[100px] flex-shrink-0 flex-col gap-0.5 rounded-lg border border-border border-l-[3px] border-l-primary bg-surface-elevated px-3 py-2 sm:min-w-[130px] sm:gap-1 sm:rounded-xl sm:px-4 sm:py-3">
                            <div className="text-[9px] font-semibold uppercase tracking-[0.1em] text-muted sm:text-[10px]">Balance</div>
                            <div className="text-sm font-semibold tracking-tight text-foreground sm:text-base">{walletAddress ? `${walletBalance ?? "0"} XLM` : "Testnet"}</div>
                        </div>
                    </div>
                </div>
            </section>

            <WorkspaceOnboarding
                walletConnected={Boolean(walletAddress)}
                hasGitHubConnection={hasGitHubConnection}
                selectedAgentId={selectedAgentId}
                hasCompletedTask={hasCompletedTask}
            />

            {/* ── Wallet Gate ── */}
            {!walletAddress && (
                <section className="mb-4 flex flex-col gap-3 rounded-xl border border-border bg-surface p-4 sm:mb-6 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:rounded-2xl sm:px-5 sm:py-5">
                    <div>
                        <div className="text-[13px] font-semibold text-foreground sm:text-sm">Connect a Stellar wallet to unlock the agents</div>
                        <p className="mt-0.5 text-xs text-foreground-soft sm:mt-1 sm:text-sm">
                            GitHub, Coding, Document, and Email actions stay gated until a testnet wallet is connected.
                        </p>
                    </div>
                    <ConnectWalletButton className="button-primary w-full sm:w-auto" />
                </section>
            )}

            {/* ── Main Layout ── */}
            <section id="agent-workbench" className="grid gap-4 sm:gap-6 xl:grid-cols-[280px_minmax(0,1fr)]">
                {/* Mobile: horizontal pill selector | Desktop: sidebar cards */}
                <aside className="panel overflow-hidden p-2 sm:sticky sm:top-0 sm:self-start sm:p-4">
                    <div className="eyebrow hidden px-2 pb-2 sm:block">Active stack</div>

                    {/* Mobile: horizontal scrollable agent pills */}
                    <div className="flex gap-1.5 overflow-x-auto sm:hidden">
                        {AGENTS.map((agent) => {
                            const Icon = agent.icon
                            const active = agent.id === selectedAgentId
                            return (
                                <button
                                    key={agent.id}
                                    onClick={() => setSelectedAgentId(agent.id)}
                                    className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-[12px] font-semibold transition-colors ${
                                        active
                                            ? "bg-primary text-white"
                                            : "bg-surface-elevated text-foreground-soft"
                                    }`}
                                >
                                    <Icon size={14} />
                                    {agent.label}
                                </button>
                            )
                        })}
                    </div>

                    {/* Desktop: full sidebar cards */}
                    <div className="mt-1 hidden space-y-1 sm:block">
                        {AGENTS.map((agent) => {
                            const Icon = agent.icon
                            const active = agent.id === selectedAgentId
                            return (
                                <button
                                    key={agent.id}
                                    onClick={() => setSelectedAgentId(agent.id)}
                                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-all duration-200 ${
                                        active
                                            ? "border-l-[3px] border-l-primary bg-primary-soft"
                                            : "border-l-[3px] border-l-transparent hover:bg-surface-elevated"
                                    }`}
                                >
                                    <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                                        active ? "bg-[color:var(--primary)] text-white" : "bg-surface-elevated text-primary"
                                    }`}>
                                        <Icon size={15} />
                                    </div>
                                    <div className="min-w-0">
                                        <div className="text-[13px] font-semibold text-foreground">{agent.label}</div>
                                        <div className="text-[11px] font-medium text-primary">{agent.badge}</div>
                                    </div>
                                </button>
                            )
                        })}
                    </div>
                </aside>

                <div className="min-w-0 space-y-4 sm:space-y-5">

                    {selectedAgent.id === "github" && (
                        <div id="github-setup">
                            <GitHubAgent />
                        </div>
                    )}

                    {selectedAgent.id === "email" && (
                        <div id="email-setup">
                            <EmailAgent />
                        </div>
                    )}

                    {selectedAgent.id === "coding" && (
                        <section className="panel overflow-hidden">
                        <div className="flex flex-col gap-2 border-b border-border px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:px-5 sm:py-4">
                                <div>
                                    <div className="eyebrow">Coding Agent</div>
                                    <h2 className="mt-0.5 text-base font-semibold tracking-tight text-foreground sm:mt-1 sm:text-lg">Generate the next build surface</h2>
                                </div>
                                <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1.5 text-[11px] font-semibold text-primary">
                                    <Sparkles size={14} />
                                    Smart-contract ready handoff
                                </div>
                            </div>

                            <div className="grid gap-4 p-3 sm:gap-5 sm:p-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
                                <div className="space-y-4">
                                    <div>
                                        <label className="mb-2 block text-sm font-medium text-foreground">Task prompt</label>
                                        <textarea
                                            value={codingPrompt}
                                            onChange={(event) => setCodingPrompt(event.target.value)}
                                            rows={8}
                                            disabled={codingLocked}
                                            placeholder="Build a lightweight Web3 onboarding dashboard with wallet status, task queue, and contract deployment checklist."
                                            className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted focus:border-primary focus:ring-2 focus:ring-[color:var(--ring)] disabled:opacity-60"
                                        />
                                    </div>

                                    <div>
                                        <label className="mb-2 block text-sm font-medium text-foreground">Output format</label>
                                        <select
                                            value={codingLanguage}
                                            onChange={(event) => setCodingLanguage(event.target.value)}
                                            disabled={codingLocked}
                                            className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm text-foreground focus:border-primary focus:ring-2 focus:ring-[color:var(--ring)] disabled:opacity-60"
                                        >
                                            <option value="html-css-js">HTML / CSS / JS project</option>
                                            <option value="typescript">TypeScript</option>
                                            <option value="javascript">JavaScript</option>
                                            <option value="react">React</option>
                                            <option value="python">Python</option>
                                            <option value="go">Go</option>
                                            <option value="rust">Rust</option>
                                        </select>
                                    </div>

                                    <div>
                                        <label className="mb-2 block text-sm font-medium text-foreground">Reward (XLM)</label>
                                        <input
                                            value={codingRewardXlm}
                                            onChange={(event) => setCodingRewardXlm(event.target.value)}
                                            inputMode="decimal"
                                            disabled={codingLocked}
                                            className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm text-foreground focus:border-primary focus:ring-2 focus:ring-[color:var(--ring)] disabled:opacity-60"
                                        />
                                        <p className="mt-2 text-xs text-muted">Escrowed on Soroban before the coding agent runs, then released back on completion.</p>
                                    </div>

                                    <div className="flex flex-wrap gap-3">
                                        <button
                                            onClick={() => void runCodingAgent()}
                                            disabled={!walletAddress || !codingPrompt.trim() || codingLocked}
                                            className="button-primary disabled:opacity-50"
                                        >
                                            {codingState === "running" ? <Loader2 size={15} className="animate-spin" /> : <Braces size={15} />}
                                            {codingState === "running" ? "Generating" : "Run Coding Agent"}
                                        </button>
                                        <button
                                            onClick={() => {
                                                setCodingPrompt("")
                                                setCodingResult(null)
                                                setCodingError(null)
                                                setCodingState("idle")
                                            }}
                                            disabled={codingLocked}
                                            className="button-secondary"
                                        >
                                            Reset
                                        </button>
                                    </div>

                                    {codingError && <ErrorBox message={codingError} />}
                                    {codingTxState && <InfoBox message={codingTxState} />}
                                    {!walletAddress && (
                                        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
                                            Connect a wallet before generating code artifacts.
                                        </div>
                                    )}
                                </div>

                                <div className="space-y-4 rounded-xl border border-border bg-surface p-3 sm:rounded-2xl sm:p-5">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <div className="eyebrow">Output</div>
                                            <div className="mt-1 text-sm font-semibold text-foreground">Build summary</div>
                                        </div>
                                        <StatusPill state={codingState} />
                                    </div>

                                    {codingState === "running" && <LoadingCopy text="Generating project artifacts..." />}

                                    {!codingResult && codingState !== "running" && (
                                        <EmptyState
                                            icon={Box}
                                            title="No generated output yet"
                                            body="Run the Coding Agent to produce a project preview or a single-file artifact for the next implementation step."
                                        />
                                    )}

                                    {codingResult?.mode === "project" && (
                                        <div className="space-y-4">
                                            <div className="rounded-xl border border-border bg-background p-4">
                                                <div className="text-sm font-semibold text-foreground">{codingResult.projectId}</div>
                                                <div className="mt-1 text-sm text-foreground-soft">
                                                    Frontend project prepared with HTML, CSS, and JavaScript assets.
                                                </div>
                                            </div>
                                            <div className="grid gap-3 sm:grid-cols-2">
                                                <a href={codingResult.previewUrl} target="_blank" rel="noreferrer" className="button-secondary">
                                                    <ExternalLink size={14} />
                                                    Open Preview
                                                </a>
                                                <a href={`/api/download/${codingResult.projectId}`} className="button-secondary">
                                                    <Download size={14} />
                                                    Download Bundle
                                                </a>
                                            </div>
                                            <CodePreviewTabs files={codingResult.files} />
                                        </div>
                                    )}

                                    {codingResult?.mode === "single-file" && (
                                        <div className="space-y-4">
                                            <div className="rounded-xl border border-border bg-background p-4">
                                                <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                                                    <FileCode2 size={15} className="text-primary" />
                                                    {codingResult.fileName}
                                                </div>
                                                <div className="mt-1 text-sm text-foreground-soft">
                                                    Generated in {codingResult.language} and saved under {codingResult.projectId}.
                                                </div>
                                            </div>
                                            <a href={`/api/download/${codingResult.projectId}`} className="button-secondary w-full">
                                                <Download size={14} />
                                                Download Source
                                            </a>
                                            <pre className="max-h-[480px] overflow-auto rounded-xl border border-border bg-[#0d1117] p-4 text-xs text-gray-200">
                                                <code>{codingResult.code}</code>
                                            </pre>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </section>
                    )}

                    {selectedAgent.id === "document" && (
                        <section className="panel overflow-hidden">
                        <div className="flex flex-col gap-2 border-b border-border px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:px-5 sm:py-4">
                                <div>
                                    <div className="eyebrow">Document Agent</div>
                                    <h2 className="mt-0.5 text-base font-semibold tracking-tight text-foreground sm:mt-1 sm:text-lg">Turn docs into implementation context</h2>
                                </div>
                                <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1.5 text-[11px] font-semibold text-primary">
                                    <Layers3 size={14} />
                                    Specs, briefs, and datasets
                                </div>
                            </div>

                            <div className="grid gap-4 p-3 sm:gap-5 sm:p-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                                <div className="space-y-4">
                                    <label className="flex cursor-pointer items-center gap-3 rounded-xl border-2 border-dashed border-border px-3 py-3 transition-all duration-200 hover:border-primary hover:bg-primary-soft sm:gap-4 sm:rounded-2xl sm:px-5 sm:py-5">
                                        <Upload size={18} className="text-primary" />
                                        <div>
                                            <div className="text-sm font-semibold text-foreground">
                                                {documentFile ? documentFile.name : "Upload a project document"}
                                            </div>
                                            <div className="mt-1 text-sm text-foreground-soft">
                                                Supports PDF, Excel, CSV, JSON, and TXT files.
                                            </div>
                                        </div>
                                        <input
                                            type="file"
                                            accept=".pdf,.xlsx,.xls,.csv,.json,.txt"
                                            onChange={(event) => setDocumentFile(event.target.files?.[0] ?? null)}
                                            disabled={documentLocked}
                                            className="hidden"
                                        />
                                    </label>

                                    <div>
                                        <label className="mb-2 block text-sm font-medium text-foreground">Question or focus area</label>
                                        <textarea
                                            value={documentQuestion}
                                            onChange={(event) => setDocumentQuestion(event.target.value)}
                                            rows={6}
                                            disabled={documentLocked}
                                            placeholder="Summarize the product requirements and list the implementation constraints that matter for Web3 integration."
                                            className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted focus:border-primary focus:ring-2 focus:ring-[color:var(--ring)] disabled:opacity-60"
                                        />
                                    </div>

                                    <div>
                                        <label className="mb-2 block text-sm font-medium text-foreground">Reward (XLM)</label>
                                        <input
                                            value={documentRewardXlm}
                                            onChange={(event) => setDocumentRewardXlm(event.target.value)}
                                            inputMode="decimal"
                                            disabled={documentLocked}
                                            className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm text-foreground focus:border-primary focus:ring-2 focus:ring-[color:var(--ring)] disabled:opacity-60"
                                        />
                                        <p className="mt-2 text-xs text-muted">Escrowed on Soroban before the document task starts.</p>
                                    </div>

                                    <div className="flex flex-wrap gap-3">
                                        <button
                                            onClick={() => void runDocumentAgent()}
                                            disabled={!walletAddress || !documentFile || documentLocked}
                                            className="button-primary disabled:opacity-50"
                                        >
                                            {documentState === "running" ? <Loader2 size={15} className="animate-spin" /> : <FileText size={15} />}
                                            {documentState === "running" ? "Analyzing" : "Run Document Agent"}
                                        </button>
                                        <button
                                            onClick={() => {
                                                setDocumentFile(null)
                                                setDocumentQuestion("")
                                                setDocumentResult(null)
                                                setDocumentError(null)
                                                setDocumentState("idle")
                                            }}
                                            disabled={documentLocked}
                                            className="button-secondary"
                                        >
                                            Clear
                                        </button>
                                    </div>

                                    {documentError && <ErrorBox message={documentError} />}
                                    {documentTxState && <InfoBox message={documentTxState} />}
                                    {!walletAddress && (
                                        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
                                            Connect a wallet before uploading and analyzing documents.
                                        </div>
                                    )}
                                </div>

                                <div className="space-y-4 rounded-xl border border-border bg-surface p-3 sm:rounded-2xl sm:p-5">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <div className="eyebrow">Analysis</div>
                                            <div className="mt-1 text-sm font-semibold text-foreground">Processed document output</div>
                                        </div>
                                        <StatusPill state={documentState} />
                                    </div>

                                    {documentState === "running" && <LoadingCopy text="Parsing and analyzing the document..." />}

                                    {!documentResult && documentState !== "running" && (
                                        <EmptyState
                                            icon={FileText}
                                            title="No document analysis yet"
                                            body="Upload a source document to extract constraints, requirements, or implementation notes for the team."
                                        />
                                    )}

                                    {documentResult && (
                                        <div className="space-y-4">
                                            <div className="rounded-xl border border-border bg-background p-4 text-sm">
                                                <div className="font-semibold text-foreground">{documentResult.fileName}</div>
                                                <div className="mt-1 text-foreground-soft">
                                                    Detected type: <span className="uppercase">{documentResult.fileType}</span>
                                                </div>
                                                {documentResult.truncated && (
                                                    <div className="mt-2 text-xs text-warning">
                                                        Content was trimmed to fit the analysis window.
                                                    </div>
                                                )}
                                            </div>
                                            <div className="prose prose-sm max-w-none dark:prose-invert">
                                                <ReactMarkdown components={mdComponents}>{documentResult.analysis}</ReactMarkdown>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </section>
                    )}
                </div>
            </section>
        </div>
    )
}

function WorkspaceStat(_props: { label: string; value: string }) {
    // Legacy component — now handled inline with workspace-stat classes
    return null
}

function StatusPill({ state }: { state: RunState }) {
    const label =
        state === "running" ? "Running" :
        state === "done" ? "Ready" :
        state === "error" ? "Needs attention" :
        "Idle"

    const tone =
        state === "running" ? "bg-primary-soft text-primary" :
        state === "done" ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" :
        state === "error" ? "bg-red-500/10 text-red-600 dark:text-red-400" :
        "bg-surface-elevated text-muted"

    return <span className={`rounded-full px-3 py-1 text-xs font-medium ${tone}`}>{label}</span>
}

function LoadingCopy({ text }: { text: string }) {
    return (
        <div className="rounded-xl border border-border bg-background p-4">
            <div className="flex items-center gap-2 text-sm text-foreground-soft">
                <Loader2 size={15} className="animate-spin text-primary" />
                {text}
            </div>
        </div>
    )
}

function EmptyState({
    icon: Icon,
    title,
    body,
}: {
    icon: React.ElementType
    title: string
    body: string
}) {
    return (
        <div className="rounded-xl border border-dashed border-border bg-background px-4 py-10 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-soft text-primary">
                <Icon size={20} />
            </div>
            <div className="mt-4 text-sm font-semibold text-foreground">{title}</div>
            <p className="mt-2 text-sm leading-relaxed text-foreground-soft">{body}</p>
        </div>
    )
}

function ErrorBox({ message }: { message: string }) {
    return (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-600 dark:text-red-400">
            <div className="flex items-start gap-2">
                <AlertCircle size={15} className="mt-0.5 shrink-0" />
                <span>{message}</span>
            </div>
        </div>
    )
}

function InfoBox({ message }: { message: string }) {
    return (
        <div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-foreground-soft">
            {message}
        </div>
    )
}

function CodePreviewTabs({ files }: { files: GeneratedFiles }) {
    const fileNames = Object.keys(files)
    const [activeTab, setActiveTab] = useState<string>(fileNames[0] ?? "index.html")
    const selectedTab = activeTab in files ? activeTab : (fileNames[0] ?? "index.html")
    const activeFile = files[selectedTab] ?? ""

    return (
        <div className="rounded-xl border border-border">
            <div className="flex flex-wrap border-b border-border">
                {fileNames.map((fileName) => (
                    <button
                        key={fileName}
                        onClick={() => setActiveTab(fileName)}
                        className={`px-4 py-3 text-xs font-semibold uppercase tracking-[0.08em] ${
                            selectedTab === fileName ? "bg-surface-elevated text-foreground" : "text-muted"
                        }`}
                    >
                        {fileName}
                    </button>
                ))}
            </div>
            <pre className="max-h-[380px] overflow-auto bg-[#0d1117] p-4 text-xs text-gray-200">
                <code>{activeFile}</code>
            </pre>
        </div>
    )
}

const mdComponents: Components = {
    h2: ({ children }) => <h2 className="mt-5 border-b border-border pb-2 text-base font-semibold text-foreground">{children}</h2>,
    h3: ({ children }) => <h3 className="mt-4 text-sm font-semibold text-foreground">{children}</h3>,
    p: ({ children }) => <p className="mb-3 text-sm leading-relaxed text-foreground-soft">{children}</p>,
    ul: ({ children }) => <ul className="mb-4 space-y-2">{children}</ul>,
    li: ({ children }) => (
        <li className="flex items-start gap-2 text-sm text-foreground-soft">
            <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-primary" />
            <span>{children}</span>
        </li>
    ),
    strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
}
