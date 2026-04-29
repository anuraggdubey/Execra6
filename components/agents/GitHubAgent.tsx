"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import {
    AlertCircle,
    BookOpenText,
    FolderGit2,
    Github,
    Loader2,
    RefreshCw,
    Send,
    Sparkles,
    Unplug,
    Wallet,
} from "lucide-react"
import ReactMarkdown from "react-markdown"
import type { Components } from "react-markdown"
import ActionButton from "@/components/workspace/ActionButton"
import PromptBox from "@/components/workspace/PromptBox"
import StepCard from "@/components/workspace/StepCard"
import { useAgentContext } from "@/lib/AgentContext"
import { useWalletContext } from "@/lib/WalletContext"
import { finalizeEscrowedTask, prepareEscrowedTask, rollbackEscrowedTask } from "@/lib/soroban/taskLifecycle"
import { clearGitHubSession, getGitHubSession, saveGitHubSession } from "@/lib/wallet/githubSession"

type Repo = {
    id: number
    name: string
    fullName: string
    description: string
    language: string
    stars: number
    isPrivate: boolean
    defaultBranch: string
}

type GHUser = { login: string; name: string; avatarUrl: string }

type PlatformStatus = {
    tools?: {
        github?: {
            configured: boolean
        }
    }
}

type GitHubOAuthMessage = {
    type?: string
    success?: boolean
    walletAddress?: string
    accessToken?: string
    message?: string
}

function getErrorMessage(error: unknown, fallback: string) {
    return error instanceof Error ? error.message : fallback
}

function parseGitHubRepoInput(input: string) {
    const trimmed = input.trim()
    if (!trimmed) return null

    const normalized = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`

    try {
        const url = new URL(normalized)
        if (!/^(www\.)?github\.com$/i.test(url.hostname)) return null

        const parts = url.pathname.split("/").filter(Boolean)
        if (parts.length < 2) return null

        return {
            owner: parts[0],
            repo: parts[1].replace(/\.git$/i, ""),
        }
    } catch {
        return null
    }
}

export default function GitHubAgent() {
    const { walletAddress, shortWalletAddress, walletProviderId } = useWalletContext()
    const { startAgentRun, completeAgentRun, failAgentRun, logAgentEvent } = useAgentContext()
    const [platformStatus, setPlatformStatus] = useState<PlatformStatus | null>(null)
    const [ghUser, setGhUser] = useState<GHUser | null>(null)
    const [githubAccessToken, setGitHubAccessToken] = useState<string | null>(null)
    const [repos, setRepos] = useState<Repo[]>([])
    const [selectedRepo, setSelectedRepo] = useState<Repo | null>(null)
    const [repoUrlInput, setRepoUrlInput] = useState("")
    const [repoContext, setRepoContext] = useState("")
    const [repoFiles, setRepoFiles] = useState<string[]>([])
    const [prompt, setPrompt] = useState("")
    const [result, setResult] = useState("")
    const [loading, setLoading] = useState(false)
    const [connecting, setConnecting] = useState(false)
    const [indexing, setIndexing] = useState(false)
    const [validatingRepoUrl, setValidatingRepoUrl] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [rewardXlm, setRewardXlm] = useState("0.2000000")
    const [txState, setTxState] = useState<string | null>(null)
    const lastLoadedTokenRef = useRef<string | null>(null)
    const agentLocked = loading || indexing || validatingRepoUrl

    const githubConfigured = Boolean(platformStatus?.tools?.github?.configured)

    const refreshPlatformStatus = useCallback(() => {
        fetch("/api/platform-status")
            .then((res) => res.json())
            .then((data) => setPlatformStatus(data))
            .catch(() => setPlatformStatus(null))
    }, [])

    useEffect(() => {
        void refreshPlatformStatus()
    }, [refreshPlatformStatus])

    const resetWorkspace = useCallback(() => {
        setGhUser(null)
        setRepos([])
        setSelectedRepo(null)
        setRepoUrlInput("")
        setRepoContext("")
        setRepoFiles([])
        setPrompt("")
        setResult("")
    }, [])

    const loadGitHubConnection = useCallback(async () => {
        if (!githubAccessToken) {
            resetWorkspace()
            return
        }

        setConnecting(true)
        setError(null)

        try {
            const res = await fetch("/api/connect-github", {
                headers: {
                    Authorization: `Bearer ${githubAccessToken}`,
                    "x-wallet-address": walletAddress ?? "",
                },
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error ?? "Failed to connect GitHub")

            setGhUser(data.user)
            setRepos(data.repos)
            if (walletAddress) {
                saveGitHubSession(walletAddress, {
                    accessToken: githubAccessToken,
                    login: data.user?.login,
                    connectedAt: Date.now(),
                })
            }
            logAgentEvent(
                "github",
                `Connected GitHub account ${data.user?.login ?? "session"} for wallet ${shortWalletAddress ?? walletAddress}.`,
                { status: "success" }
            )
        } catch (err) {
            const message = getErrorMessage(err, "Failed to connect GitHub")
            setError(message)
            resetWorkspace()
            lastLoadedTokenRef.current = null
            if (walletAddress) clearGitHubSession(walletAddress)
        } finally {
            setConnecting(false)
        }
    }, [githubAccessToken, logAgentEvent, resetWorkspace, shortWalletAddress, walletAddress])

    useEffect(() => {
        setError(null)
        resetWorkspace()
        lastLoadedTokenRef.current = null
        setGitHubAccessToken(getGitHubSession(walletAddress)?.accessToken ?? null)
    }, [resetWorkspace, walletAddress])

    useEffect(() => {
        if (!walletAddress || !githubAccessToken) return
        if (lastLoadedTokenRef.current === githubAccessToken) return

        lastLoadedTokenRef.current = githubAccessToken
        void loadGitHubConnection()
    }, [githubAccessToken, loadGitHubConnection, walletAddress])

    useEffect(() => {
        const listener = (event: MessageEvent<GitHubOAuthMessage>) => {
            if (event.origin !== window.location.origin) return
            if (event.data?.type !== "execra:github-oauth") return

            if (!event.data.success || !event.data.walletAddress || !event.data.accessToken) {
                setError(event.data?.message ?? "GitHub OAuth failed")
                return
            }

            saveGitHubSession(event.data.walletAddress, {
                accessToken: event.data.accessToken,
                connectedAt: Date.now(),
            })

            if (event.data.walletAddress === walletAddress) {
                setGitHubAccessToken(event.data.accessToken)
            }
        }

        window.addEventListener("message", listener)
        return () => window.removeEventListener("message", listener)
    }, [walletAddress])

    const beginOAuth = useCallback(() => {
        if (!walletAddress) {
            setError("Connect a wallet before connecting GitHub.")
            return
        }

        setConnecting(true)
        setError(null)
        const popup = window.open(
            `/api/auth/github?wallet=${encodeURIComponent(walletAddress)}`,
            "execra_github_oauth",
            "width=620,height=760"
        )

        if (!popup) {
            setConnecting(false)
            setError("The GitHub popup was blocked by the browser.")
            return
        }

        const popupWatcher = window.setInterval(() => {
            if (!popup.closed) return
            window.clearInterval(popupWatcher)
            setConnecting(false)
        }, 500)
    }, [walletAddress])

    const disconnect = useCallback(async () => {
        if (!walletAddress) return
        clearGitHubSession(walletAddress)
        void fetch("/api/users/github-status", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ walletAddress, githubConnected: false }),
        }).catch(() => undefined)
        lastLoadedTokenRef.current = null
        setGitHubAccessToken(null)
        resetWorkspace()
        setError(null)
    }, [resetWorkspace, walletAddress])

    const buildFetchHeaders = () => {
        const headers: Record<string, string> = {
            "Content-Type": "application/json",
        }

        if (githubAccessToken) {
            headers.Authorization = `Bearer ${githubAccessToken}`
        }

        return headers
    }

    const validateRepoUrl = async () => {
        if (!walletAddress) {
            setError("Connect a wallet before loading a repository.")
            return
        }

        const parsed = parseGitHubRepoInput(repoUrlInput)
        if (!parsed) {
            setError("Invalid GitHub repo")
            return
        }

        setValidatingRepoUrl(true)
        setError(null)
        setSelectedRepo(null)
        setRepoContext("")
        setRepoFiles([])
        setPrompt("")
        setResult("")

        try {
            const res = await fetch("/api/fetch-repo", {
                method: "POST",
                headers: buildFetchHeaders(),
                body: JSON.stringify({
                    owner: parsed.owner,
                    repo: parsed.repo,
                    walletAddress,
                    blockchain: null,
                }),
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error ?? "Invalid GitHub repo")

            setSelectedRepo(data.repo)
            setRepoUrlInput(`https://github.com/${data.repo.fullName}`)
            setRepoContext(data.context)
            setRepoFiles(data.files)
            logAgentEvent("github", `Loaded repository ${data.repo.fullName} from a pasted GitHub URL.`, { status: "success" })
        } catch (err) {
            const message = getErrorMessage(err, "Invalid GitHub repo")
            setError(message)
            setSelectedRepo(null)
            setRepoContext("")
            setRepoFiles([])
        } finally {
            setValidatingRepoUrl(false)
        }
    }

    const loadRepo = async () => {
        if (!selectedRepo || !walletAddress) return

        setIndexing(true)
        setError(null)
        setResult("")
        setTxState("Creating escrow transaction on Soroban...")
        startAgentRun("github", `Indexing ${selectedRepo.fullName}`)

        let preparedTask: Awaited<ReturnType<typeof prepareEscrowedTask>> | null = null
        try {
            preparedTask = await prepareEscrowedTask({
                walletAddress,
                walletProviderId,
                rewardXlm,
                agentType: "github",
            })
            const [owner, repo] = selectedRepo.fullName.split("/")
            const res = await fetch("/api/fetch-repo", {
                method: "POST",
                headers: buildFetchHeaders(),
                body: JSON.stringify({
                    owner,
                    repo,
                    ref: selectedRepo.defaultBranch,
                    walletAddress,
                    blockchain: preparedTask.blockchainPayload,
                }),
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error ?? "Failed to index repository")

            setSelectedRepo(data.repo ?? selectedRepo)
            setRepoContext(data.context)
            setRepoFiles(data.files)
            setRepoUrlInput(`https://github.com/${(data.repo ?? selectedRepo).fullName}`)
            setTxState("Confirming on-chain...")
            completeAgentRun(
                "github",
                `Indexed ${selectedRepo.fullName} and loaded ${data.files?.length ?? 0} repository files.`,
                2
            )

            await finalizeEscrowedTask({
                taskId: data.taskId,
                walletAddress,
                walletProviderId,
                onChainTaskId: preparedTask.onChainTaskId,
                blockchainPayload: preparedTask.blockchainPayload,
            })
            setTxState("On-chain confirmed")
        } catch (err) {
            const message = getErrorMessage(err, "Failed to index repository")
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
            failAgentRun("github", message)
        } finally {
            setIndexing(false)
        }
    }

    const runPrompt = async (questionOverride?: string) => {
        const question = questionOverride ?? prompt
        if (!selectedRepo || !repoContext || !question.trim() || !walletAddress) return

        setLoading(true)
        setError(null)
        setTxState("Creating escrow transaction on Soroban...")
        startAgentRun("github", `Analyzing ${selectedRepo.fullName} for wallet ${walletAddress}: ${question}`)

        let preparedTask: Awaited<ReturnType<typeof prepareEscrowedTask>> | null = null
        try {
            preparedTask = await prepareEscrowedTask({
                walletAddress,
                walletProviderId,
                rewardXlm,
                agentType: "github",
            })
            const [owner, repo] = selectedRepo.fullName.split("/")
            const res = await fetch("/api/ask-repo", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    owner,
                    repo,
                    question,
                    context: repoContext,
                    walletAddress,
                    blockchain: preparedTask.blockchainPayload,
                }),
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error ?? "GitHub agent failed")
            setResult(data.answer)
            setTxState("Confirming on-chain...")
            completeAgentRun("github", `Completed repository prompt for ${selectedRepo.fullName}.`, 5)

            await finalizeEscrowedTask({
                taskId: data.taskId,
                walletAddress,
                walletProviderId,
                onChainTaskId: preparedTask.onChainTaskId,
                blockchainPayload: preparedTask.blockchainPayload,
            })
            setTxState("On-chain confirmed")
        } catch (err) {
            const message = getErrorMessage(err, "GitHub agent failed")
            setError(message)
            if (preparedTask) {
                setTxState("Rolling back escrowed reward...")
                await rollbackEscrowedTask({
                    walletAddress,
                    walletProviderId,
                    onChainTaskId: preparedTask.onChainTaskId,
                    blockchainPayload: preparedTask.blockchainPayload,
                }).catch(() => undefined)
            }
            setTxState(null)
            failAgentRun("github", message)
        } finally {
            setLoading(false)
        }
    }

    const runFullReview = async () => {
        if (!selectedRepo || !repoContext || !walletAddress) return

        const reviewPrompt = "Give me a detailed review of this repository: architecture, modules, risks, data flow, and improvement opportunities."
        setPrompt(reviewPrompt)
        await runPrompt(reviewPrompt)
    }

    const isReadyForPrompt = Boolean(walletAddress && selectedRepo && repoContext)

    return (
        <div className="space-y-4 sm:space-y-5">
            {error && (
                <div className="flex items-start gap-3 rounded-2xl border border-red-500/20 bg-red-500/5 p-3.5 sm:p-4">
                    <AlertCircle size={16} className="mt-0.5 shrink-0 text-red-500" />
                    <div className="min-w-0 text-[13px] leading-relaxed text-red-600 dark:text-red-400 sm:text-sm">{error}</div>
                </div>
            )}

            {!walletAddress && (
                <div className="flex items-start gap-3 rounded-2xl border border-amber-500/20 bg-amber-500/5 p-3.5 sm:p-4">
                    <Wallet size={16} className="mt-0.5 shrink-0 text-amber-500" />
                    <div className="min-w-0 text-[13px] leading-relaxed text-amber-700 dark:text-amber-300 sm:text-sm">
                        Connect a Stellar wallet before using the GitHub agent.
                    </div>
                </div>
            )}

            {txState && (
                <div className="rounded-xl border border-primary/15 bg-primary/5 px-3 py-2 text-[12px] text-foreground-soft">
                    {txState}
                </div>
            )}


            <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_280px]">
                <div className="space-y-4">
                    <StepCard
                        step="STEP 1"
                        title="Connect GitHub"
                        state={ghUser ? "completed" : "active"}
                        badge={<span className="workspace-chip">{rewardXlm} XLM</span>}
                        footer="Optional. Public repositories still work in step 2."
                    >
                        <input
                            value={rewardXlm}
                            onChange={(event) => setRewardXlm(event.target.value)}
                            inputMode="decimal"
                            disabled={agentLocked}
                            className="w-full rounded-[20px] bg-background px-4 py-3 text-sm text-foreground ring-1 ring-black/5 focus:ring-2 focus:ring-[color:var(--ring)] disabled:opacity-60"
                        />

                        {!githubConfigured && (
                            <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-3 text-sm text-amber-700 dark:text-amber-300">
                                GitHub OAuth is not configured. Public repositories still work below.
                            </div>
                        )}

                        {walletAddress && !ghUser && githubConfigured && (
                            <ActionButton type="button" onClick={beginOAuth} disabled={connecting || agentLocked} className="w-full">
                                {connecting ? <Loader2 size={15} className="animate-spin" /> : <Github size={15} />}
                                Connect GitHub
                            </ActionButton>
                        )}

                        {walletAddress && ghUser && (
                            <div className="space-y-3">
                                <div className="flex items-center gap-3 rounded-2xl bg-background p-3 ring-1 ring-black/5">
                                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary-soft">
                                        <Github size={16} className="text-primary" />
                                    </div>
                                    <div className="min-w-0">
                                        <div className="truncate text-sm font-medium text-foreground">{ghUser.name || ghUser.login}</div>
                                        <div className="text-xs text-muted">@{ghUser.login} | {shortWalletAddress}</div>
                                    </div>
                                </div>
                                <ActionButton type="button" onClick={() => void disconnect()} disabled={agentLocked} variant="secondary" className="w-full">
                                    <Unplug size={14} />
                                    Disconnect GitHub
                                </ActionButton>
                            </div>
                        )}
                    </StepCard>

                    <StepCard
                        step="STEP 2"
                        title="Select repository"
                        state={selectedRepo ? "completed" : walletAddress ? "active" : "idle"}
                        footer="Paste a public repository or pick one from your connected account."
                    >
                        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_140px]">
                            <input
                                value={repoUrlInput}
                                onChange={(event) => setRepoUrlInput(event.target.value)}
                                placeholder="https://github.com/owner/repo"
                                disabled={agentLocked}
                                className="w-full rounded-[20px] bg-background px-4 py-3 text-sm text-foreground ring-1 ring-black/5 focus:ring-2 focus:ring-[color:var(--ring)] disabled:opacity-50"
                            />
                            <ActionButton
                                type="button"
                                onClick={() => void validateRepoUrl()}
                                disabled={!repoUrlInput.trim() || validatingRepoUrl || agentLocked || !walletAddress}
                                variant="secondary"
                            >
                                {validatingRepoUrl ? <Loader2 size={14} className="animate-spin" /> : <FolderGit2 size={14} />}
                                Validate
                            </ActionButton>
                        </div>

                        <select
                            value={ghUser ? selectedRepo?.fullName ?? "" : ""}
                            onChange={(event) => {
                                const repo = repos.find((entry) => entry.fullName === event.target.value) ?? null
                                setSelectedRepo(repo)
                                setRepoUrlInput(repo ? `https://github.com/${repo.fullName}` : "")
                                setRepoContext("")
                                setRepoFiles([])
                                setResult("")
                                setPrompt("")
                            }}
                            disabled={!ghUser || repos.length === 0 || agentLocked}
                            className="w-full rounded-[20px] bg-background px-4 py-3 text-sm text-foreground ring-1 ring-black/5 focus:ring-2 focus:ring-[color:var(--ring)] disabled:opacity-50"
                        >
                            <option value="">Choose one of your connected repositories</option>
                            {repos.map((repo) => (
                                <option key={repo.id} value={repo.fullName}>
                                    {repo.fullName}
                                </option>
                            ))}
                        </select>

                        <ActionButton
                            type="button"
                            onClick={() => void loadRepo()}
                            disabled={!selectedRepo || indexing || agentLocked || !walletAddress}
                            className="w-full"
                        >
                            {indexing ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                            Index Repository
                        </ActionButton>

                        {selectedRepo && (
                            <div className="rounded-2xl bg-background p-4 ring-1 ring-black/5">
                                <div className="text-sm font-medium text-foreground">{selectedRepo.fullName}</div>
                                {selectedRepo.description && (
                                    <div className="mt-1 text-sm text-foreground-soft">{selectedRepo.description}</div>
                                )}
                                <div className="mt-3 flex flex-wrap gap-2">
                                    {selectedRepo.language && (
                                        <span className="rounded-full bg-primary-soft px-2.5 py-1 text-[10px] font-semibold uppercase text-primary">
                                            {selectedRepo.language}
                                        </span>
                                    )}
                                    <span className="rounded-full bg-surface px-2.5 py-1 text-[10px] font-medium text-muted ring-1 ring-black/5">
                                        Starred {selectedRepo.stars}
                                    </span>
                                    <span className="rounded-full bg-surface px-2.5 py-1 text-[10px] font-medium text-muted ring-1 ring-black/5">
                                        {selectedRepo.defaultBranch}
                                    </span>
                                </div>
                                {repoFiles.length > 0 && (
                                    <div className="mt-3 text-xs text-emerald-600 dark:text-emerald-400">
                                        Indexed {repoFiles.length} files
                                    </div>
                                )}
                            </div>
                        )}
                    </StepCard>

                    <StepCard
                        step="STEP 3"
                        title="Ask the agent"
                        state={result ? "completed" : isReadyForPrompt ? "active" : "idle"}
                        footer={isReadyForPrompt ? "Ask for review, analysis, or execution." : "Load a repository first."}
                    >
                        <div className="flex flex-wrap gap-3">
                            <ActionButton
                                type="button"
                                onClick={() => void runFullReview()}
                                disabled={!isReadyForPrompt || loading || agentLocked}
                                variant="secondary"
                            >
                                <BookOpenText size={14} />
                                Full Review
                            </ActionButton>
                        </div>

                        <PromptBox
                            value={prompt}
                            onChange={setPrompt}
                            disabled={!isReadyForPrompt || loading || agentLocked}
                            rows={5}
                            placeholder={
                                isReadyForPrompt
                                    ? "Ask the agent to analyze, review, or execute..."
                                    : "Connect a wallet, choose a repository, then load it first."
                            }
                        />

                        <div className="flex gap-3">
                            <ActionButton
                                type="button"
                                onClick={() => void runPrompt()}
                                disabled={!prompt.trim() || !isReadyForPrompt || loading || agentLocked}
                                className="flex-1 sm:flex-none"
                            >
                                {loading ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                                Run Task
                            </ActionButton>
                            <ActionButton
                                type="button"
                                onClick={() => {
                                    setPrompt("")
                                    setResult("")
                                    setError(null)
                                }}
                                disabled={agentLocked}
                                variant="secondary"
                            >
                                <RefreshCw size={14} />
                                Clear
                            </ActionButton>
                        </div>
                    </StepCard>

                    {loading && (
                        <div className="rounded-2xl bg-background p-4 text-sm text-foreground-soft ring-1 ring-black/5">
                            <div className="flex items-center gap-2">
                                <Loader2 size={15} className="animate-spin text-primary" />
                                Analyzing repository...
                            </div>
                        </div>
                    )}

                    {result && (
                        <div className="rounded-[24px] bg-surface/90 p-5 shadow-[0_12px_34px_rgba(15,23,42,0.06)] ring-1 ring-white/35">
                            <div className="mb-4 flex items-center justify-between">
                                <div>
                                    <div className="eyebrow">Output</div>
                                    <div className="mt-1 text-sm font-semibold text-foreground">Repository response</div>
                                </div>
                                <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                                    Ready
                                </span>
                            </div>
                            <div className="prose prose-sm max-w-none dark:prose-invert">
                                <ReactMarkdown components={mdComponents}>{result}</ReactMarkdown>
                            </div>
                        </div>
                    )}
                </div>

                <div className="space-y-4 xl:sticky xl:top-4">
                    <div className="rounded-[24px] bg-background/80 p-4 ring-1 ring-black/5">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">Status</div>
                        <div className="mt-2 text-sm font-semibold text-foreground">
                            {result ? "Response ready" : repoContext ? "Repository indexed" : selectedRepo ? "Repository selected" : "Waiting for setup"}
                        </div>
                        <p className="mt-2 text-sm text-foreground-soft">Clear steps, same GitHub flow, less noise.</p>
                    </div>

                    {repoFiles.length > 0 && (
                        <details className="overflow-hidden rounded-[24px] bg-surface/90 ring-1 ring-white/35">
                            <summary className="cursor-pointer px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted select-none" style={{ minHeight: 44, display: "flex", alignItems: "center" }}>
                                Indexed Files ({repoFiles.length})
                            </summary>
                            <div className="max-h-[300px] space-y-1 overflow-y-auto border-t border-border p-3">
                                {repoFiles.map((file) => (
                                    <div key={file} className="truncate rounded-xl bg-background px-3 py-2 font-mono text-xs text-foreground-soft ring-1 ring-black/5">
                                        {file}
                                    </div>
                                ))}
                            </div>
                        </details>
                    )}
                </div>
            </div>


        </div>
    )
}



const mdComponents: Components = {
    h2: ({ children }) => <h2 className="mt-6 border-b border-border pb-2 text-base font-bold text-foreground">{children}</h2>,
    h3: ({ children }) => <h3 className="mt-4 text-sm font-bold text-foreground">{children}</h3>,
    p: ({ children }) => <p className="mb-3 text-[13px] leading-relaxed text-foreground-soft sm:text-sm">{children}</p>,
    ul: ({ children }) => <ul className="mb-4 space-y-2">{children}</ul>,
    li: ({ children }) => (
        <li className="flex items-start gap-2 text-[13px] text-foreground-soft sm:text-sm">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
            <span>{children}</span>
        </li>
    ),
    strong: ({ children }) => <strong className="font-bold text-foreground">{children}</strong>,
    code: ({ children }) => <code className="rounded bg-black/10 px-1.5 py-0.5 font-mono text-xs dark:bg-white/10">{children}</code>,
    pre: ({ children }) => <pre className="mt-2 overflow-auto rounded-lg bg-[#0d1117] p-3.5 text-xs text-gray-300">{children}</pre>,
}
