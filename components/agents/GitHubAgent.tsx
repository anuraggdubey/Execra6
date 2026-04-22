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
            setTxState("On-chain confirmed")
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
                        Connect a Stellar wallet before using the GitHub agent.
                    </div>
                </div>
            )}

            <div className="rounded-xl border border-border bg-surface p-3 sm:p-4">
                <div className="mb-3 text-[11px] font-medium uppercase tracking-wider text-muted">Setup Progress</div>
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
                <div className="overflow-hidden rounded-xl border border-border bg-surface">
                    <div className="flex items-center gap-2 border-b border-border px-3 py-2 sm:px-4 sm:py-3">
                        <Github size={14} className="text-primary" />
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">Step 1 - Connect GitHub Optional</span>
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
                                GitHub OAuth is not configured. You can still paste and analyze public GitHub repositories below.
                            </div>
                        )}

                        {walletAddress && !ghUser && (
                            <div className="rounded-lg border border-border bg-background p-3 text-[13px] leading-relaxed text-foreground-soft sm:text-sm">
                                Connect GitHub if you want to browse your own repositories quickly. You can also skip GitHub login and paste any public GitHub repository URL in Step 2.
                            </div>
                        )}

                        {walletAddress && !ghUser && githubConfigured && (
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

                <div className="overflow-hidden rounded-xl border border-border bg-surface">
                    <div className="flex items-center gap-2 border-b border-border px-3 py-2 sm:px-4 sm:py-3">
                        <FolderGit2 size={14} className="text-primary" />
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">Step 2 - Select Or Paste Repository</span>
                    </div>
                    <div className="space-y-3 p-3 sm:p-4">
                        <div className="space-y-2">
                            <label className="block text-[11px] font-medium uppercase tracking-wider text-muted">Paste GitHub Repository URL</label>
                            <input
                                value={repoUrlInput}
                                onChange={(event) => setRepoUrlInput(event.target.value)}
                                placeholder="https://github.com/owner/repo"
                                disabled={agentLocked}
                                className="w-full rounded-lg border border-border bg-background px-3.5 py-3 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
                                style={{ minHeight: 44 }}
                            />
                            <button
                                type="button"
                                onClick={() => void validateRepoUrl()}
                                disabled={!repoUrlInput.trim() || validatingRepoUrl || agentLocked || !walletAddress}
                                className="flex w-full items-center justify-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-surface-elevated disabled:opacity-50"
                                style={{ minHeight: 44 }}
                            >
                                {validatingRepoUrl ? <Loader2 size={14} className="animate-spin" /> : <FolderGit2 size={14} className="text-primary" />}
                                Validate And Load Repo
                            </button>
                            <p className="text-[12px] leading-relaxed text-foreground-soft sm:text-xs">
                                Paste any public GitHub repository link here. If the repository does not exist, the agent will show <span className="font-medium text-foreground">Invalid GitHub repo</span>.
                            </p>
                        </div>

                        <div className="h-px bg-border" />

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
                            className="w-full rounded-lg border border-border bg-background px-3.5 py-3 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
                            style={{ minHeight: 44 }}
                        >
                            <option value="">Choose one of your connected repositories</option>
                            {repos.map((repo) => (
                                <option key={repo.id} value={repo.fullName}>
                                    {repo.fullName}
                                </option>
                            ))}
                        </select>

                        <button
                            type="button"
                            onClick={() => void loadRepo()}
                            disabled={!selectedRepo || indexing || agentLocked || !walletAddress}
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
                                        Starred {selectedRepo.stars}
                                    </span>
                                    <span className="rounded-md border border-border px-2 py-0.5 text-[10px] font-medium text-muted">
                                        {selectedRepo.defaultBranch}
                                    </span>
                                </div>
                                {repoFiles.length > 0 && (
                                    <div className="mt-2 text-xs text-emerald-600 dark:text-emerald-400">
                                        Indexed {repoFiles.length} files
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div className="overflow-hidden rounded-xl border border-border bg-surface">
                <div className="flex items-center justify-between border-b border-border px-3 py-2 sm:px-4 sm:py-3">
                    <div className="flex items-center gap-2">
                        <BookOpenText size={14} className="text-primary" />
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">Step 3 - Ask The Agent</span>
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
                                <div className="text-sm font-semibold text-foreground">Analyze your own repos or any public GitHub repo</div>
                                <p className="mt-0.5 text-[13px] leading-relaxed text-foreground-soft sm:text-xs">
                                    Connect a wallet, then either connect GitHub for your own repositories or paste any public GitHub repo URL and load it.
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
                                    ? "e.g. Give me a very detailed analysis of this repository architecture, main modules, risk areas, auth flow, data flow, and improvement opportunities."
                                    : "Connect a wallet, then connect GitHub or paste a valid repository URL and load it first."
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
                            <span className="text-[13px] text-foreground-soft sm:text-sm">Analyzing repository in detail...</span>
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
                <details className="overflow-hidden rounded-xl border border-border bg-surface">
                    <summary className="cursor-pointer px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted select-none" style={{ minHeight: 44, display: "flex", alignItems: "center" }}>
                        Indexed Files ({repoFiles.length})
                    </summary>
                    <div className="max-h-[300px] space-y-1 overflow-y-auto border-t border-border p-3">
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
