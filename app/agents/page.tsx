"use client"

import { useMemo, useState } from "react"
import dynamic from "next/dynamic"
import {
    AlertCircle,
    Box,
    CheckCircle2,
    Download,
    ExternalLink,
    FileCode2,
    FileText,
    Upload,
} from "lucide-react"
import ReactMarkdown from "react-markdown"
import type { Components } from "react-markdown"

import ActionButton from "@/components/workspace/ActionButton"
import AgentQuickStart from "@/components/workspace/AgentQuickStart"
import AgentSidebar from "@/components/workspace/AgentSidebar"
import PromptBox from "@/components/workspace/PromptBox"
import StepCard from "@/components/workspace/StepCard"
import { useAgentContext } from "@/lib/AgentContext"
import ConnectWalletButton from "@/components/wallet/ConnectWalletButton"
import { useWalletContext } from "@/lib/WalletContext"
import { finalizeEscrowedTask, prepareEscrowedTask, rollbackEscrowedTask } from "@/lib/soroban/taskLifecycle"
import {
    BrowserAgentIcon,
    CodingAgentIcon,
    DocumentAgentIcon,
    EmailAgentIcon,
    GitHubAgentIcon,
    SearchAgentIcon,
} from "@/components/ui/ExecraIcons"


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

const WebSearchAgent = dynamic(() => import("@/components/agents/WebSearchAgent"), {
    ssr: false,
    loading: () => (
        <div className="panel p-6">
            <div className="skeleton h-6 w-40" />
            <div className="skeleton mt-4 h-24" />
            <div className="skeleton mt-4 h-64" />
        </div>
    ),
})

const BrowserAgent = dynamic(() => import("@/components/agents/BrowserAgent"), {
    ssr: false,
    loading: () => (
        <div className="panel p-6">
            <div className="skeleton h-6 w-40" />
            <div className="skeleton mt-4 h-24" />
            <div className="skeleton mt-4 h-64" />
        </div>
    ),
})

type WorkspaceAgentId = "github" | "coding" | "document" | "email" | "search" | "browser"
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
        icon: GitHubAgentIcon,
        description: "Connect a repository, index source context, and review code through a focused repo workflow.",
        badge: "Repository intelligence",
    },
    {
        id: "coding",
        label: "Coding Agent",
        icon: CodingAgentIcon,
        description: "Generate MVP-ready code artifacts and previews for product surfaces that feed the next integration phase.",
        badge: "Build surfaces",
    },
    {
        id: "document",
        label: "Document Agent",
        icon: DocumentAgentIcon,
        description: "Parse project docs, specs, and datasets into concise analysis the team can use immediately.",
        badge: "Spec digestion",
    },
    {
        id: "email",
        label: "Email Agent",
        icon: EmailAgentIcon,
        description: "Generate outbound emails, verify escrow first, and send through the configured mailbox without leaving the workspace.",
        badge: "Escrow-backed delivery",
    },
    {
        id: "search",
        label: "Web Search Agent",
        icon: SearchAgentIcon,
        description: "Run escrow-gated web searches, summarize source-backed results, and surface optional related videos.",
        badge: "Live web research",
    },
    {
        id: "browser",
        label: "Browser Automation Agent",
        icon: BrowserAgentIcon,
        description: "Launch a visible browser, execute planned web actions, and stream live execution logs after escrow verification.",
        badge: "Live browser control",
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
    const { walletAddress, walletProviderId } = useWalletContext()
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


    const runCodingAgent = async () => {
        if (!walletAddress || !codingPrompt.trim() || codingState === "running") return

        setCodingState("running")
        setCodingError(null)
        setCodingResult(null)
        setCodingTxState("Submitting escrow transaction to Soroban...")
        startAgentRun("coding", `Generating build output for: ${codingPrompt}`)

        let preparedTask: Awaited<ReturnType<typeof prepareEscrowedTask>> | null = null
        try {
            preparedTask = await prepareEscrowedTask({
                walletAddress,
                walletProviderId,
                rewardXlm: codingRewardXlm,
                agentType: "coding",
            })

            setCodingTxState(`Escrow submitted (TX: ${preparedTask.blockchainPayload.createTxHash.slice(0, 8)}...). Running agent while chain confirms...`)
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

            let proofPayload: Record<string, unknown>
            if (data.files && data.preview?.previewUrl) {
                setCodingResult({
                    mode: "project",
                    projectId: data.projectId,
                    files: data.files,
                    previewUrl: data.preview.previewUrl,
                })
                proofPayload = {
                    kind: "project",
                    files: data.files,
                    previewUrl: data.preview.previewUrl,
                }
            } else if (data.singleFile) {
                setCodingResult({
                    mode: "single-file",
                    projectId: data.projectId,
                    fileName: data.singleFile.filename,
                    language: data.singleFile.language,
                    code: data.singleFile.code,
                })
                proofPayload = {
                    kind: "single-file",
                    fileName: data.singleFile.filename,
                    language: data.singleFile.language,
                    code: data.singleFile.code,
                }
            } else {
                throw new Error("Coding agent returned an incomplete payload.")
            }

            setCodingTxState("Finalizing escrow after agent completion...")
            setCodingState("done")
            completeAgentRun("coding", `Prepared ${data.projectId} for handoff and follow-on integration.`)

            const finalizeResult = await finalizeEscrowedTask({
                taskId: data.taskId,
                agentType: "coding",
                walletAddress,
                walletProviderId,
                onChainTaskId: preparedTask.onChainTaskId,
                proofPayload,
                blockchainPayload: preparedTask.blockchainPayload,
            })

            setCodingTxState(`On-chain confirmed (TX: ${finalizeResult.txHash.slice(0, 8)}...)`)
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
        setDocumentTxState("Submitting escrow transaction to Soroban...")
        startAgentRun("document", `Analyzing ${documentFile.name}`)

        let preparedTask: Awaited<ReturnType<typeof prepareEscrowedTask>> | null = null
        try {
            preparedTask = await prepareEscrowedTask({
                walletAddress,
                walletProviderId,
                rewardXlm: documentRewardXlm,
                agentType: "document",
            })
            setDocumentTxState(`Escrow submitted (TX: ${preparedTask.blockchainPayload.createTxHash.slice(0, 8)}...). Analyzing while chain confirms...`)
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
            const proofPayload = {
                fileName: data.fileName,
                fileType: data.fileType,
                analysis: data.analysis,
                truncated: Boolean(data.truncated),
            }
            setDocumentTxState("Finalizing escrow after analysis...")
            setDocumentState("done")
            completeAgentRun("document", `Analyzed ${data.fileName} and prepared a concise brief.`)

            const finalizeResult = await finalizeEscrowedTask({
                taskId: documentTaskId,
                agentType: "document",
                walletAddress,
                walletProviderId,
                onChainTaskId: preparedTask.onChainTaskId,
                proofPayload,
                blockchainPayload: preparedTask.blockchainPayload,
            })

            setDocumentTxState(`On-chain confirmed (TX: ${finalizeResult.txHash.slice(0, 8)}...)`)
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
        <div className="w-full overflow-x-hidden px-4 py-4 sm:px-6 lg:px-8">
            {!walletAddress && (
                <section className="mx-auto mb-4 flex w-full max-w-[1200px] flex-col gap-2 rounded-[6px] border border-border bg-surface px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:px-6">
                    <span className="font-sans text-[13px] text-foreground-soft">Connect a Stellar wallet to unlock agents</span>
                    <ConnectWalletButton className="button-primary !min-h-[30px] !px-3 !py-1 !text-[11px]" />
                </section>
            )}
            <section id="agent-workbench" className="mx-auto grid min-h-[calc(100dvh-92px)] w-full max-w-[1200px] grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-[8px] border border-border bg-surface shadow-[0_12px_40px_rgba(15,23,42,0.06)] sm:grid-cols-[260px_minmax(0,1fr)] sm:grid-rows-none">
                <AgentSidebar
                    agents={AGENTS}
                    selectedAgentId={selectedAgentId}
                    onSelect={(agentId) => setSelectedAgentId(agentId as WorkspaceAgentId)}
                />

                <div className="min-w-0 overflow-x-hidden bg-background p-4 sm:p-5">
                    {selectedAgent.id === "github" && (
                        <div id="github-setup" className="space-y-3">
                            <AgentQuickStart
                                description="Connect GitHub, select a repository, then ask for a focused review or architecture summary."
                                steps={[
                                    { label: "Connect a Stellar wallet", complete: Boolean(walletAddress) },
                                    { label: "Link GitHub for repository work", complete: Boolean(walletAddress) },
                                    { label: "Run your first task", complete: agents.some((a) => a.id === "github" && a.tasksCompleted > 0) },
                                ]}
                                ctaLabel="Link GitHub"
                                ctaAction="#github-setup"
                                secondaryLabel="Open workspace"
                                secondaryAction="#agent-workbench"
                            />
                            <GitHubAgent />
                        </div>
                    )}

                    {selectedAgent.id === "email" && (
                        <div id="email-setup" className="space-y-3">
                            <AgentQuickStart
                                description="Connect wallet, compose your email, and send via escrow-backed delivery."
                                steps={[
                                    { label: "Connect a Stellar wallet", complete: Boolean(walletAddress) },
                                    { label: "Compose email content", complete: false },
                                    { label: "Send with escrow", complete: agents.some((a) => a.id === "email" && a.tasksCompleted > 0) },
                                ]}
                                ctaLabel="Compose email"
                                ctaAction="#email-setup"
                                secondaryLabel="Open workspace"
                                secondaryAction="#agent-workbench"
                            />
                            <EmailAgent />
                        </div>
                    )}

                    {selectedAgent.id === "search" && (
                        <div id="search-setup" className="space-y-3">
                            <AgentQuickStart
                                description="Enter a search query, review source-backed results, and explore related content."
                                steps={[
                                    { label: "Connect a Stellar wallet", complete: Boolean(walletAddress) },
                                    { label: "Enter a search query", complete: false },
                                    { label: "Run your first search", complete: agents.some((a) => a.id === "search" && a.tasksCompleted > 0) },
                                ]}
                                ctaLabel="Start searching"
                                ctaAction="#search-setup"
                                secondaryLabel="Open workspace"
                                secondaryAction="#agent-workbench"
                            />
                            <WebSearchAgent />
                        </div>
                    )}

                    {selectedAgent.id === "browser" && (
                        <div id="browser-setup" className="space-y-3">
                            <AgentQuickStart
                                description="Describe a browser action, verify escrow, and watch it execute live."
                                steps={[
                                    { label: "Connect a Stellar wallet", complete: Boolean(walletAddress) },
                                    { label: "Describe browser actions", complete: false },
                                    { label: "Execute automation", complete: agents.some((a) => a.id === "browser" && a.tasksCompleted > 0) },
                                ]}
                                ctaLabel="Start automation"
                                ctaAction="#browser-setup"
                                secondaryLabel="Open workspace"
                                secondaryAction="#agent-workbench"
                            />
                            <BrowserAgent />
                        </div>
                    )}

                    {selectedAgent.id === "coding" && (
                        <>
                        <AgentQuickStart
                            description="Write a prompt, choose output format, and generate build-ready code artifacts."
                            steps={[
                                { label: "Connect a Stellar wallet", complete: Boolean(walletAddress) },
                                { label: "Write a build prompt", complete: Boolean(codingPrompt.trim()) },
                                { label: "Generate code output", complete: codingState === "done" },
                            ]}
                            ctaLabel="Write prompt"
                            ctaAction="#agent-workbench"
                            secondaryLabel="Open workspace"
                            secondaryAction="#agent-workbench"
                        />
                        <section className="overflow-hidden rounded-[6px] border border-border bg-background">
                            <div className="flex items-center justify-between border-b border-border bg-surface px-4 py-4 sm:px-6">
                                <h2 className="font-heading text-[13px] uppercase tracking-[0.06em] text-foreground">Coding Agent</h2>
                                <span className="workspace-chip"><span className="text-[color:var(--ex-xlm)]">◈</span> {codingRewardXlm} XLM</span>
                            </div>

                            {/* Input steps */}
                            <div className="space-y-3 px-4 py-6 sm:px-6 sm:py-8">
                                <StepCard
                                    step="STEP 1"
                                    title="Define the build task"
                                    state={codingPrompt.trim() ? "completed" : "active"}
                                    footer="Keep the request focused."
                                >
                                    <PromptBox
                                        value={codingPrompt}
                                        onChange={setCodingPrompt}
                                        rows={6}
                                        disabled={codingLocked}
                                        placeholder="Ask the agent to analyze, review, or execute..."
                                    />
                                </StepCard>

                                <StepCard
                                    step="STEP 2"
                                    title="Choose output"
                                    state="active"
                                    badge={<span className="workspace-chip"><span className="text-[color:var(--ex-xlm)]">◈</span> {codingRewardXlm} XLM</span>}
                                    footer="Escrow is created before execution."
                                >
                                    <div className="grid gap-3 sm:grid-cols-2">
                                        <select
                                            value={codingLanguage}
                                            onChange={(event) => setCodingLanguage(event.target.value)}
                                            disabled={codingLocked}
                                            className="w-full rounded-[4px] border border-border bg-background px-3 py-3 font-heading text-[13px] text-foreground focus:border-[color:var(--ex-accent)] focus:shadow-[0_0_0_3px_rgba(37,99,235,0.08)] disabled:opacity-60"
                                        >
                                            <option value="html-css-js">HTML / CSS / JS project</option>
                                            <option value="typescript">TypeScript</option>
                                            <option value="javascript">JavaScript</option>
                                            <option value="react">React</option>
                                            <option value="python">Python</option>
                                            <option value="go">Go</option>
                                            <option value="rust">Rust</option>
                                        </select>
                                        <input
                                            value={codingRewardXlm}
                                            onChange={(event) => setCodingRewardXlm(event.target.value)}
                                            inputMode="decimal"
                                            disabled={codingLocked}
                                            placeholder="Reward in XLM"
                                            className="w-full rounded-[4px] border border-border bg-background px-3 py-3 font-heading text-[13px] text-foreground focus:border-[color:var(--ex-accent)] focus:shadow-[0_0_0_3px_rgba(37,99,235,0.08)] disabled:opacity-60"
                                        />
                                    </div>
                                </StepCard>

                                <StepCard
                                    step="STEP 3"
                                    title="Run task"
                                    state={codingState === "done" ? "completed" : codingState === "running" ? "active" : "idle"}
                                    footer={walletAddress ? "Run task to generate files and preview." : "Connect a wallet to continue."}
                                >
                                    <div className="flex flex-wrap gap-3">
                                        <ActionButton
                                            onClick={() => void runCodingAgent()}
                                            disabled={!walletAddress || !codingPrompt.trim() || codingLocked}
                                        >
                                            {codingState === "running" ? "Generating" : "Run Task"}
                                        </ActionButton>
                                        <ActionButton
                                            variant="secondary"
                                            onClick={() => {
                                                setCodingPrompt("")
                                                setCodingResult(null)
                                                setCodingError(null)
                                                setCodingState("idle")
                                            }}
                                            disabled={codingLocked}
                                        >
                                            Reset
                                        </ActionButton>
                                    </div>
                                </StepCard>

                                {codingError && <ErrorBox message={codingError} />}
                                {codingTxState && <InfoBox message={codingTxState} />}
                                {!walletAddress && (
                                    <div className="rounded-[6px] border border-[color:var(--ex-warning)] bg-[color:var(--ex-warning-bg)] px-4 py-3 text-sm text-[color:var(--ex-warning)]">
                                        Connect a wallet before generating code artifacts.
                                    </div>
                                )}
                            </div>

                            {/* Output section — full width below */}
                            <div className="border-t border-border bg-[color:var(--ex-surface-2)] px-4 py-6 sm:px-6 sm:py-8">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <div className="font-heading text-[10px] uppercase tracking-[0.1em] text-muted">Output</div>
                                        <div className="mt-1 font-heading text-[13px] text-foreground">Build summary</div>
                                    </div>
                                    <StatusPill state={codingState} />
                                </div>

                                <div className="mt-5 space-y-4">
                                    {codingState === "running" && <LoadingCopy text="Generating project artifacts..." />}

                                    {!codingResult && codingState !== "running" && (
                                        <EmptyState
                                            icon={Box}
                                            title="No generated output yet"
                                            body="Run the agent to create the next build surface."
                                        />
                                    )}

                                    {codingResult?.mode === "project" && (
                                        <div className="space-y-4">
                                            <div className="rounded-[6px] border border-border bg-surface p-4">
                                                <div className="font-heading text-[12px] text-foreground">{codingResult.projectId}</div>
                                                <div className="mt-1 text-[13px] text-foreground-soft">
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
                                            <div className="rounded-[6px] border border-border bg-surface p-4">
                                                <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                                                    <FileCode2 size={15} className="text-primary" />
                                                    {codingResult.fileName}
                                                </div>
                                                <div className="mt-1 text-[13px] text-foreground-soft">
                                                    Generated in {codingResult.language} and saved under {codingResult.projectId}.
                                                </div>
                                            </div>
                                            <a href={`/api/download/${codingResult.projectId}`} className="button-secondary w-full">
                                                <Download size={14} />
                                                Download Source
                                            </a>
                                            <pre className="max-h-[480px] overflow-auto rounded-[6px] border border-border bg-[color:var(--ex-surface)] p-4 font-heading text-[12px] text-foreground">
                                                <code>{codingResult.code}</code>
                                            </pre>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </section>
                        </>
                    )}

                    {selectedAgent.id === "document" && (
                        <>
                        <AgentQuickStart
                            description="Upload a file (PDF, CSV, JSON), ask a question, and get a concise analysis."
                            steps={[
                                { label: "Connect a Stellar wallet", complete: Boolean(walletAddress) },
                                { label: "Upload a document", complete: Boolean(documentFile) },
                                { label: "Analyze the file", complete: documentState === "done" },
                            ]}
                            ctaLabel="Upload file"
                            ctaAction="#agent-workbench"
                            secondaryLabel="Open workspace"
                            secondaryAction="#agent-workbench"
                        />
                        <section className="overflow-hidden rounded-[6px] border border-border bg-background">
                            <div className="flex items-center justify-between border-b border-border bg-surface px-4 py-4 sm:px-6">
                                <h2 className="font-heading text-[13px] uppercase tracking-[0.06em] text-foreground">Document Agent</h2>
                                <span className="workspace-chip"><span className="text-[color:var(--ex-xlm)]">◈</span> {documentRewardXlm} XLM</span>
                            </div>

                            {/* Input steps */}
                            <div className="space-y-3 px-4 py-6 sm:px-6 sm:py-8">
                                <StepCard
                                    step="STEP 1"
                                    title="Upload document"
                                    state={documentFile ? "completed" : "active"}
                                    footer="One file keeps the result focused."
                                >
                                    <label className="flex cursor-pointer items-center gap-3 rounded-[4px] border border-border bg-background px-4 py-4 transition-all duration-150 hover:border-[color:var(--ex-border-2)] sm:gap-4 sm:px-5">
                                        <Upload size={18} className="text-primary" />
                                        <div>
                                            <div className="text-sm font-semibold text-foreground">
                                                {documentFile ? documentFile.name : "Upload a project document"}
                                            </div>
                                            <div className="mt-1 text-sm text-foreground-soft">
                                                PDF, Excel, CSV, JSON, or TXT.
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
                                </StepCard>

                                <StepCard
                                    step="STEP 2"
                                    title="Set the focus"
                                    state={documentQuestion.trim() ? "completed" : documentFile ? "active" : "idle"}
                                    badge={<span className="workspace-chip"><span className="text-[color:var(--ex-xlm)]">◈</span> {documentRewardXlm} XLM</span>}
                                    footer="Ask one focused question."
                                >
                                    <PromptBox
                                        value={documentQuestion}
                                        onChange={setDocumentQuestion}
                                        rows={4}
                                        disabled={documentLocked}
                                        placeholder="Ask the agent to analyze, review, or execute..."
                                    />
                                    <input
                                        value={documentRewardXlm}
                                        onChange={(event) => setDocumentRewardXlm(event.target.value)}
                                        inputMode="decimal"
                                        disabled={documentLocked}
                                        placeholder="Reward in XLM"
                                        className="w-full rounded-[4px] border border-border bg-background px-3 py-3 font-heading text-[13px] text-foreground focus:border-[color:var(--ex-accent)] focus:shadow-[0_0_0_3px_rgba(37,99,235,0.08)] disabled:opacity-60"
                                    />
                                </StepCard>

                                <StepCard
                                    step="STEP 3"
                                    title="Run task"
                                    state={documentState === "done" ? "completed" : documentState === "running" ? "active" : "idle"}
                                    footer={walletAddress ? "Analyze the uploaded file." : "Connect a wallet to continue."}
                                >
                                    <div className="flex flex-wrap gap-3">
                                        <ActionButton
                                            onClick={() => void runDocumentAgent()}
                                            disabled={!walletAddress || !documentFile || documentLocked}
                                        >
                                            {documentState === "running" ? "Analyzing" : "Run Task"}
                                        </ActionButton>
                                        <ActionButton
                                            variant="secondary"
                                            onClick={() => {
                                                setDocumentFile(null)
                                                setDocumentQuestion("")
                                                setDocumentResult(null)
                                                setDocumentError(null)
                                                setDocumentState("idle")
                                            }}
                                            disabled={documentLocked}
                                        >
                                            Clear
                                        </ActionButton>
                                    </div>
                                </StepCard>

                                {documentError && <ErrorBox message={documentError} />}
                                {documentTxState && <InfoBox message={documentTxState} />}
                                {!walletAddress && (
                                    <div className="rounded-[6px] border border-[color:var(--ex-warning)] bg-[color:var(--ex-warning-bg)] px-4 py-3 text-sm text-[color:var(--ex-warning)]">
                                        Connect a wallet before uploading and analyzing documents.
                                    </div>
                                )}
                            </div>

                            {/* Output section — full width below */}
                            <div className="border-t border-border bg-[color:var(--ex-surface-2)] px-4 py-6 sm:px-6 sm:py-8">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <div className="font-heading text-[10px] uppercase tracking-[0.1em] text-muted">Analysis</div>
                                        <div className="mt-1 font-heading text-[13px] text-foreground">Processed output</div>
                                    </div>
                                    <StatusPill state={documentState} />
                                </div>

                                <div className="mt-5 space-y-4">
                                    {documentState === "running" && <LoadingCopy text="Parsing and analyzing the document..." />}

                                    {!documentResult && documentState !== "running" && (
                                        <EmptyState
                                            icon={FileText}
                                            title="No document analysis yet"
                                            body="Upload one file and run the task."
                                        />
                                    )}

                                    {documentResult && (
                                        <div className="space-y-4">
                                            <div className="rounded-[6px] border border-border bg-surface p-4 text-sm">
                                                <div className="font-heading text-[12px] text-foreground">{documentResult.fileName}</div>
                                                <div className="mt-1 text-[13px] text-foreground-soft">
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
                        </>
                    )}
                </div>
            </section>
        </div>
    )
}




function StatusPill({ state }: { state: RunState }) {
    const label =
        state === "running" ? "Running" :
        state === "done" ? "Ready" :
        state === "error" ? "Needs attention" :
        "Idle"

    const tone =
        state === "running" ? "border-[color:var(--ex-accent)] bg-[color:var(--ex-accent-bg)] text-[color:var(--ex-accent)]" :
        state === "done" ? "border-[color:var(--ex-success)] bg-[color:var(--ex-success-bg)] text-[color:var(--ex-success)]" :
        state === "error" ? "border-[color:var(--ex-danger)] bg-[color:var(--ex-danger-bg)] text-[color:var(--ex-danger)]" :
        "border-border bg-[color:var(--ex-surface-2)] text-muted"

    return <span className={`rounded-[3px] border px-2 py-1 font-heading text-[10px] uppercase tracking-[0.06em] ${tone}`}>{label}</span>
}

function LoadingCopy({ text }: { text: string }) {
    return (
        <div className="border border-border bg-surface px-4 py-4">
            <div className="scan-label">Running Agent...</div>
            <div className="mt-3 text-[12px] text-foreground-soft">{text}</div>
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
        <div className="border border-border bg-surface px-4 py-10 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center border border-border bg-[color:var(--ex-surface-2)] text-primary">
                <Icon size={20} />
            </div>
            <div className="mt-4 font-heading text-[12px] uppercase tracking-[0.04em] text-foreground">{title}</div>
            <p className="mt-2 text-[13px] leading-relaxed text-foreground-soft">{body}</p>
        </div>
    )
}

function ErrorBox({ message }: { message: string }) {
    return (
        <div className="border border-[color:var(--ex-danger)] bg-[color:var(--ex-danger-bg)] px-4 py-3 text-sm text-[color:var(--ex-danger)]">
            <div className="flex items-start gap-2">
                <AlertCircle size={15} className="mt-0.5 shrink-0" />
                <span>{message}</span>
            </div>
        </div>
    )
}

function InfoBox({ message }: { message: string }) {
    return (
        <div className="border border-[color:var(--ex-border-2)] bg-surface px-4 py-3 text-sm text-foreground-soft">
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
        <div className="overflow-hidden border border-border">
            <div className="flex flex-wrap border-b border-border bg-surface">
                {fileNames.map((fileName) => (
                    <button
                        key={fileName}
                        onClick={() => setActiveTab(fileName)}
                        className={`px-4 py-3 font-heading text-[10px] uppercase tracking-[0.08em] ${
                            selectedTab === fileName ? "bg-[color:var(--ex-surface-2)] text-foreground" : "text-muted"
                        }`}
                    >
                        {fileName}
                    </button>
                ))}
            </div>
            <pre className="max-h-[380px] overflow-auto bg-surface p-4 font-heading text-[12px] text-foreground">
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
