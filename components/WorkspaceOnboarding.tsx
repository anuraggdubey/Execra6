"use client"

import { useMemo, useState } from "react"
import { ArrowRight, CheckCircle2, Circle, FileText, FolderGit2, Sparkles, X } from "lucide-react"
import ConnectWalletButton from "@/components/wallet/ConnectWalletButton"
import { useHasMounted } from "@/lib/useHasMounted"

type WorkspaceAgentId = "github" | "coding" | "document" | "email" | "search"

type WorkspaceOnboardingProps = {
    walletConnected: boolean
    hasGitHubConnection: boolean
    selectedAgentId: WorkspaceAgentId
    hasCompletedTask: boolean
}

const STORAGE_KEY = "execra_workspace_onboarding_hidden_v1"

const AGENT_COPY: Record<WorkspaceAgentId, { title: string; body: string; icon: React.ElementType }> = {
    github: {
        title: "Recommended first run",
        body: "Connect GitHub, select a repository, then ask for a focused review or architecture summary.",
        icon: FolderGit2,
    },
    coding: {
        title: "Recommended first run",
        body: "Start with a narrow build request so the Coding Agent can return a clean preview and downloadable bundle.",
        icon: Sparkles,
    },
    document: {
        title: "Recommended first run",
        body: "Upload one source document and ask for constraints, requirements, or implementation notes you can act on immediately.",
        icon: FileText,
    },
    email: {
        title: "Recommended first run",
        body: "Draft one outbound email, confirm the escrow step, and review the generated subject and body before delivery.",
        icon: Sparkles,
    },
    search: {
        title: "Recommended first run",
        body: "Ask one focused question, verify the escrow step, and review the returned summary, sources, and optional videos.",
        icon: Sparkles,
    },
}

export default function WorkspaceOnboarding({
    walletConnected,
    hasGitHubConnection,
    selectedAgentId,
    hasCompletedTask,
}: WorkspaceOnboardingProps) {
    const [dismissed, setDismissed] = useState(false)
    const mounted = useHasMounted()

    const steps = useMemo(() => {
        const workflowReady = selectedAgentId === "github" ? hasGitHubConnection : true

        return [
            {
                label: "Connect a Stellar wallet",
                detail: "Wallet identity unlocks agent actions and Soroban escrowed task flows.",
                complete: walletConnected,
            },
            {
                label: selectedAgentId === "github" ? "Link GitHub for repository work" : "Review the selected workflow inputs",
                detail:
                    selectedAgentId === "github"
                        ? "GitHub Agent needs a linked GitHub session before repository indexing can start."
                        : "The selected workflow is ready once the current agent inputs are confirmed.",
                complete: workflowReady,
            },
            {
                label: "Run your first task",
                detail: "A successful run populates activity history and proves the workspace is working end to end.",
                complete: hasCompletedTask,
            },
        ]
    }, [hasCompletedTask, hasGitHubConnection, selectedAgentId, walletConnected])

    const dismiss = () => {
        if (typeof window !== "undefined") {
            window.localStorage.setItem(STORAGE_KEY, "true")
        }
        setDismissed(true)
    }

    const restore = () => {
        if (typeof window !== "undefined") {
            window.localStorage.removeItem(STORAGE_KEY)
        }
        setDismissed(false)
    }

    const completedCount = steps.filter((step) => step.complete).length
    const progressLabel = `${completedCount}/${steps.length} complete`
    const contextCopy = AGENT_COPY[selectedAgentId]
    const ContextIcon = contextCopy.icon
    const persistedDismissed =
        mounted && typeof window !== "undefined"
            ? window.localStorage.getItem(STORAGE_KEY) === "true"
            : false
    const isDismissed = dismissed || persistedDismissed

    if (isDismissed) {
        return (
            <div className="mb-3 flex justify-end sm:mb-4">
                <button type="button" onClick={restore} className="button-ghost !min-h-[32px] !px-3 !py-1.5 text-xs">
                    Show guide
                </button>
            </div>
        )
    }

    return (
        <section className="panel animate-fade-in mb-4 overflow-hidden border-[color:var(--border-strong)] sm:mb-6">
            <div className="flex flex-col gap-4 px-4 py-4 sm:px-5 sm:py-4">
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                            <ContextIcon size={15} className="text-primary" />
                            Quick start
                        </div>
                        <p className="mt-1 text-sm leading-relaxed text-foreground-soft">
                            {contextCopy.body}
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="rounded-full border border-border bg-surface-elevated px-3 py-1.5 text-[11px] font-semibold text-foreground">
                            {progressLabel}
                        </div>
                        <button type="button" onClick={dismiss} className="button-ghost !min-h-[32px] !px-2 !py-1.5" aria-label="Dismiss onboarding">
                            <X size={15} />
                        </button>
                    </div>
                </div>

                <div className="flex flex-wrap gap-2">
                    {steps.map((step) => (
                        <div key={step.label} className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-2 text-xs text-foreground-soft">
                            {step.complete ? (
                                <CheckCircle2 size={14} className="text-emerald-600 dark:text-emerald-400" />
                            ) : (
                                <Circle size={12} className="text-muted" />
                            )}
                            <span>{step.label}</span>
                        </div>
                    ))}
                </div>

                <div className="flex flex-wrap gap-3">
                    {!walletConnected ? (
                        <ConnectWalletButton className="button-primary" label="Connect wallet" />
                    ) : selectedAgentId === "github" && !hasGitHubConnection ? (
                        <a href="#github-setup" className="button-primary">
                            Link GitHub
                            <ArrowRight size={14} />
                        </a>
                    ) : !hasCompletedTask ? (
                        <a href="#agent-workbench" className="button-primary">
                            Run first task
                            <ArrowRight size={14} />
                        </a>
                    ) : (
                        <a href="/activity" className="button-secondary">
                            Review activity
                            <ArrowRight size={14} />
                        </a>
                    )}

                    <a href="#agent-workbench" className="button-secondary">
                        Open workspace
                    </a>
                </div>
            </div>
        </section>
    )
}
