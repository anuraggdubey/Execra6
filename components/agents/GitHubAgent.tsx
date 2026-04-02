"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import {
    AlertCircle,
    BookOpenText,
    CheckCircle2,
    Clock,
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
import { useAgentContext } from "@/lib/AgentContext"
import { useWalletContext } from "@/lib/WalletContext"
import { finalizeEscrowedTask, prepareEscrowedTask, rollbackEscrowedTask } from "@/lib/soroban/taskLifecycle"
import {
    clearGitHubSession,
    getGitHubSession,
    saveGitHubSession,
} from "@/lib/wallet/githubSession"

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

export default function GitHubAgent() {
    const { walletAddress, shortWalletAddress, walletProviderId } = useWalletContext()
    const { startAgentRun, completeAgentRun, failAgentRun, logAgentEvent } = useAgentContext()
    const [platformStatus, setPlatformStatus] = useState<PlatformStatus | null>(null)
    const [ghUser, setGhUser] = useState<GHUser | null>(null)
    const [githubAccessToken, setGitHubAccessToken] = useState<string | null>(null)
    const [repos, setRepos] = useState<Repo[]>([])
    const [selectedRepo, setSelectedRepo] = useState<Repo | null>(null)
    const [repoContext, setRepoContext] = useState("")
    const [repoFiles, setRepoFiles] = useState<string[]>([])
    const [prompt, setPrompt] = useState("")
    const [result, setResult] = useState("")
    const [loading, setLoading] = useState(false)
    const [connecting, setConnecting] = useState(false)
    const [indexing, setIndexing] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [rewardXlm, setRewardXlm] = useState("0.2000000")
    const [txState, setTxState] = useState<string | null>(null)
    const lastLoadedTokenRef = useRef<string | null>(null)
    const agentLocked = loading || indexing

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
            saveGitHubSession(walletAddress!, {
                accessToken: githubAccessToken,
                login: data.user?.login,
                connectedAt: Date.now(),
            })
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
    }, [loadGitHubConnection, walletAddress])

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

    const loadRepo = async () => {
        if (!selectedRepo || !githubAccessToken) return

        setIndexing(true)
        setError(null)
        setResult("")
        setTxState("Creating escrow transaction on Soroban...")
        startAgentRun("github", `Indexing ${selectedRepo.fullName}`)

        let preparedTask: Awaited<ReturnType<typeof prepareEscrowedTask>> | null = null
        try {
            preparedTask = await prepareEscrowedTask({
                walletAddress: walletAddress!,
                walletProviderId,
                rewardXlm,
                agentType: "github",
            })
            const [owner, repo] = selectedRepo.fullName.split("/")
            const res = await fetch("/api/fetch-repo", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${githubAccessToken}`,
                },
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

            setRepoContext(data.context)
            setRepoFiles(data.files)
            setTxState("Confirming on-chain...")
            completeAgentRun(
                "github",
                `Indexed ${selectedRepo.fullName} and loaded ${data.files?.length ?? 0} repository files.`,
                2
            )

            await finalizeEscrowedTask({
                taskId: data.taskId,
                walletAddress: walletAddress!,
                walletProviderId,
                onChainTaskId: preparedTask.onChainTaskId,
                blockchainPayload: preparedTask.blockchainPayload,
            })
            setTxState("On-chain confirmed ✓")
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

    const runPrompt = async () => {
        if (!selectedRepo || !repoContext || !prompt.trim() || !walletAddress) return

        setLoading(true)
        setError(null)
        setTxState("Creating escrow transaction on Soroban...")
        startAgentRun("github", `Analyzing ${selectedRepo.fullName} for wallet ${walletAddress}: ${prompt}`)

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
                    question: prompt,
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
            setTxState("On-chain confirmed ✓")
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
            setConnecting(false)
        }
    }

    const runFullReview = async () => {
        if (!selectedRepo || !repoContext || !walletAddress) return

        setLoading(true)
        setError(null)
        setTxState("Creating escrow transaction on Soroban...")
        startAgentRun("github", `Running full repository review for ${selectedRepo.fullName} as ${walletAddress}`)

        let preparedTask: Awaited<ReturnType<typeof prepareEscrowedTask>> | null = null
        try {
            preparedTask = await prepareEscrowedTask({
                walletAddress,
                walletProviderId,
                rewardXlm,
                agentType: "github",
            })
            const [owner, repo] = selectedRepo.fullName.split("/")
            const res = await fetch("/api/analyze-repo", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ owner, repo, context: repoContext, walletAddress, blockchain: preparedTask.blockchainPayload }),
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error ?? "Repository analysis failed")
            setResult(data.analysis)
            setTxState("Confirming on-chain...")
            completeAgentRun("github", `Completed full review for ${selectedRepo.fullName}.`, 6)

            await finalizeEscrowedTask({
                taskId: data.taskId,
                walletAddress,
                walletProviderId,
                onChainTaskId: preparedTask.onChainTaskId,
                blockchainPayload: preparedTask.blockchainPayload,
            })
            setTxState("On-chain confirmed ✓")
        } catch (err) {
            const message = getErrorMessage(err, "Repository analysis failed")
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

    const isReadyForPrompt = Boolean(walletAddress && selectedRepo && repoContext)

    return (
        <div className="space-y-4 sm:space-y-5">
            {error && (
                <div className="flex items-start gap-3 rounded-lg border border-red-500/20 bg-red-500/5 p-3.5 sm:p-4">
                    <AlertCircle size={16} className="mt-0.5 shrink-0 text-red-500" />
                    <div className="min-w-0 text-[13px] leading-relaxed text-red-600 dark:text-red-400 sm:text-sm">{error}</div>
                </div>
            )}

            {!walletAddress && (
                <div className="flex items-start gap-3 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3.5 sm:p-4">
                    <Wallet size={16} className="mt-0.5 shrink-0 text-amber-500" />
                    <div className="min-w-0 text-[13px] leading-relaxed text-amber-700 dark:text-amber-300 sm:text-sm">
                        Connect a Stellar wallet before linking GitHub. GitHub access tokens are stored against the active wallet address.
                    </div>
                </div>
            )}

            <div className="rounded-xl border border-border bg-surface p-3 sm:p-4">
                <div className="text-[11px] font-medium uppercase tracking-wider text-muted mb-3">Setup Progress</div>
                <div className="flex items-center gap-1.5 sm:gap-2">
                    <StepDot label="Wallet" ready={Boolean(walletAddress)} />
                    <div className="h-px flex-1 bg-border" />
                    <StepDot label="GitHub" ready={Boolean(ghUser)} />
                    <div className="h-px flex-1 bg-border" />
                    <StepDot label="Repository" ready={Boolean(selectedRepo)} />
                    <div className="h-px flex-1 bg-border" />
                    <StepDot label="Indexed" ready={Boolean(repoContext)} />
                </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-2">
                <div className="rounded-xl border border-border bg-surface overflow-hidden">
                    <div className="flex items-center gap-2 border-b border-border px-3 py-2 sm:px-4 sm:py-3">
                        <Github size={14} className="text-primary" />
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">Step 1 — Connect GitHub</span>
                    </div>
                    <div className="space-y-3 p-3 sm:p-4">
                        <div>
                            <label className="mb-2 block text-[11px] font-medium uppercase tracking-wider text-muted">Reward (XLM)</label>
                            <input
                                value={rewardXlm}
                                onChange={(event) => setRewardXlm(event.target.value)}
                                inputMode="decimal"
                                disabled={agentLocked}
                                className="w-full rounded-lg border border-border bg-background px-3.5 py-3 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-60"
                                style={{ minHeight: 44 }}
                            />
                            <p className="mt-2 text-[12px] leading-relaxed text-foreground-soft sm:text-xs">
                                Escrowed on Soroban before GitHub indexing or analysis begins.
                            </p>
                        </div>

                        {!githubConfigured && (
                            <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-[13px] leading-relaxed text-amber-700 dark:text-amber-300 sm:text-sm">
                                GitHub OAuth is not configured. Add the client ID, secret, and callback URL in the server environment first.
                            </div>
                        )}

                        {!walletAddress && (
                            <p className="text-[13px] leading-relaxed text-foreground-soft sm:text-sm">
                                Your GitHub connection will be scoped to the connected wallet address.
                            </p>
                        )}

                        {walletAddress && !ghUser && githubConfigured && (
                            <>
                                <div className="rounded-lg border border-border bg-background p-3 text-[13px] leading-relaxed text-foreground-soft sm:text-sm">
                                    Wallet identity: <span className="font-medium text-foreground">{walletAddress}</span>
                                </div>
                                <button
                                    type="button"
                                    onClick={beginOAuth}
                                    disabled={connecting || agentLocked}
                                    className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-primary/90 disabled:opacity-50"
                                    style={{ minHeight: 44 }}
                                >
                                    {connecting ? <Loader2 size={15} className="animate-spin" /> : <Github size={15} />}
                                    Connect GitHub
                                </button>
                            </>
                        )}

                        {walletAddress && ghUser && (
                            <div className="space-y-3">
                                <div className="flex items-center gap-3">
                                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-soft">
                                        <Github size={16} className="text-primary" />
                                    </div>
                                    <div className="min-w-0">
                                        <div className="truncate text-sm font-medium text-foreground">{ghUser.name || ghUser.login}</div>
                                        <div className="text-xs text-muted">
                                            @{ghUser.login} | linked to {shortWalletAddress}
                                        </div>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => void disconnect()}
                                    disabled={agentLocked}
                                    className="flex w-full items-center justify-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-foreground-soft transition-colors hover:bg-surface-elevated disabled:opacity-50"
                                    style={{ minHeight: 44 }}
                                >
                                    <Unplug size={14} />
                                    Disconnect GitHub
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                <div className="rounded-xl border border-border bg-surface overflow-hidden">
                    <div className="flex items-center gap-2 border-b border-border px-3 py-2 sm:px-4 sm:py-3">
                        <FolderGit2 size={14} className="text-primary" />
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">Step 2 — Select Repository</span>
                    </div>
                    <div className="space-y-3 p-3 sm:p-4">
                        <select
                            value={selectedRepo?.fullName ?? ""}
                            onChange={(event) => {
                                const repo = repos.find((entry) => entry.fullName === event.target.value) ?? null
                                setSelectedRepo(repo)
                                setRepoContext("")
                                setRepoFiles([])
                                setResult("")
                                setPrompt("")
                            }}
                            disabled={!ghUser || repos.length === 0 || agentLocked}
                            className="w-full rounded-lg border border-border bg-background px-3.5 py-3 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
                            style={{ minHeight: 44 }}
                        >
                            <option value="">Choose a repository</option>
                            {repos.map((repo) => (
                                <option key={repo.id} value={repo.fullName}>
                                    {repo.fullName}
                                </option>
                            ))}
                        </select>

                        <button
                            type="button"
                            onClick={() => void loadRepo()}
                            disabled={!selectedRepo || indexing || !ghUser || agentLocked}
                            className="flex w-full items-center justify-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-surface-elevated disabled:opacity-50"
                            style={{ minHeight: 44 }}
                        >
                            {indexing ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} className="text-primary" />}
                            Index Repository
                        </button>

                        {selectedRepo && (
                            <div className="rounded-lg border border-border bg-background p-3">
                                <div className="text-sm font-medium text-foreground">{selectedRepo.fullName}</div>
                                {selectedRepo.description && (
                                    <div className="mt-1 text-[13px] leading-relaxed text-foreground-soft sm:text-xs">{selectedRepo.description}</div>
                                )}
                                <div className="mt-2 flex flex-wrap gap-1.5">
                                    {selectedRepo.language && (
                                        <span className="rounded-md bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase text-primary">
                                            {selectedRepo.language}
                                        </span>
                                    )}
                                    <span className="rounded-md border border-border px-2 py-0.5 text-[10px] font-medium text-muted">
                                        ★ {selectedRepo.stars}
                                    </span>
                                    <span className="rounded-md border border-border px-2 py-0.5 text-[10px] font-medium text-muted">
                                        {selectedRepo.defaultBranch}
                                    </span>
                                </div>
                                {repoFiles.length > 0 && (
                                    <div className="mt-2 text-xs text-emerald-600 dark:text-emerald-400">
                                        ✓ {repoFiles.length} files indexed
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div className="rounded-xl border border-border bg-surface overflow-hidden">
                <div className="flex items-center justify-between border-b border-border px-3 py-2 sm:px-4 sm:py-3">
                    <div className="flex items-center gap-2">
                        <BookOpenText size={14} className="text-primary" />
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">Step 3 — Ask the Agent</span>
                    </div>
                    <button
                        type="button"
                        onClick={() => void runFullReview()}
                        disabled={!isReadyForPrompt || loading || agentLocked}
                        className="rounded-lg border border-border px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide text-foreground-soft transition-colors hover:bg-surface-elevated disabled:opacity-40"
                        style={{ minHeight: 36 }}
                    >
                        Full Review
                    </button>
                </div>

                <div className="space-y-4 p-4">
                    {!isReadyForPrompt && !result && !loading && (
                        <div className="flex items-center gap-3 rounded-lg border border-dashed border-border bg-background p-4 sm:p-6">
                            <Github size={20} className="shrink-0 text-muted" />
                            <div>
                                <div className="text-sm font-semibold text-foreground">Wallet-scoped GitHub workflow</div>
                                <p className="mt-0.5 text-[13px] leading-relaxed text-foreground-soft sm:text-xs">
                                    Connect a wallet, attach GitHub to that wallet, select a repository, then index the codebase below.
                                </p>
                            </div>
                        </div>
                    )}

                    <div>
                        <textarea
                            value={prompt}
                            onChange={(event) => setPrompt(event.target.value)}
                            placeholder={
                                isReadyForPrompt
                                    ? "e.g. Explain the auth flow, identify risks, and suggest fixes."
                                    : "Connect a wallet, connect GitHub, and index a repository first."
                            }
                            rows={4}
                            disabled={!isReadyForPrompt || loading || agentLocked}
                            className="w-full rounded-lg border border-border bg-background px-3.5 py-3 text-[15px] text-foreground placeholder:text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50 sm:text-sm"
                        />
                        <div className="mt-3 flex gap-2">
                            <button
                                type="button"
                                onClick={() => void runPrompt()}
                                disabled={!prompt.trim() || !isReadyForPrompt || loading || agentLocked}
                                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-primary/90 disabled:opacity-50 sm:flex-none"
                                style={{ minHeight: 44 }}
                            >
                                {loading ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                                Run Agent
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setPrompt("")
                                    setResult("")
                                    setError(null)
                                }}
                                disabled={agentLocked}
                                className="flex items-center justify-center gap-2 rounded-lg border border-border px-4 py-3 text-sm font-medium text-foreground-soft transition-colors hover:bg-surface-elevated disabled:opacity-50"
                                style={{ minHeight: 44 }}
                            >
                                <RefreshCw size={14} />
                                <span className="hidden sm:inline">Clear</span>
                            </button>
                        </div>
                    </div>

                    {loading && (
                        <div className="flex items-center gap-3 rounded-lg border border-border bg-background p-3.5">
                            <Loader2 size={15} className="animate-spin text-primary" />
                            <span className="text-[13px] text-foreground-soft sm:text-sm">Analyzing repository...</span>
                        </div>
                    )}

                    {result && (
                        <div className="rounded-lg border border-border bg-background p-4">
                            <div className="prose prose-sm max-w-none dark:prose-invert">
                                <ReactMarkdown components={mdComponents}>{result}</ReactMarkdown>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {repoFiles.length > 0 && (
                <details className="rounded-xl border border-border bg-surface overflow-hidden">
                    <summary className="cursor-pointer px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted select-none" style={{ minHeight: 44, display: "flex", alignItems: "center" }}>
                        Indexed Files ({repoFiles.length})
                    </summary>
                    <div className="max-h-[300px] overflow-y-auto border-t border-border p-3 space-y-1">
                        {repoFiles.map((file) => (
                            <div
                                key={file}
                                className="truncate rounded-md border border-border bg-background px-3 py-2 font-mono text-xs text-foreground-soft"
                            >
                                {file}
                            </div>
                        ))}
                    </div>
                </details>
            )}

            {txState && (
                <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-[13px] text-foreground-soft sm:text-sm">
                    {txState}
                </div>
            )}
        </div>
    )
}

function StepDot({ label, ready }: { label: string; ready: boolean }) {
    return (
        <div className="flex flex-col items-center gap-1.5">
            <div className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${
                ready ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : "bg-surface-elevated text-muted"
            }`}>
                {ready ? (
                    <CheckCircle2 size={14} />
                ) : (
                    <Clock size={12} />
                )}
            </div>
            <span className={`text-[10px] font-medium ${ready ? "text-foreground" : "text-muted"}`}>{label}</span>
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
