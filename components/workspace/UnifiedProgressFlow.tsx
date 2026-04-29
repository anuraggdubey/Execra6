"use client"

import { ArrowRight, CheckCircle2 } from "lucide-react"
import ConnectWalletButton from "@/components/wallet/ConnectWalletButton"

type WorkspaceAgentId = "github" | "coding" | "document" | "email" | "search" | "browser"

type UnifiedProgressFlowProps = {
    walletConnected: boolean
    hasGitHubConnection: boolean
    selectedAgentId: WorkspaceAgentId
    hasCompletedTask: boolean
}

type FlowStep = {
    label: string
    complete: boolean
}

function getSteps(
    walletConnected: boolean,
    hasGitHubConnection: boolean,
    selectedAgentId: WorkspaceAgentId,
    hasCompletedTask: boolean
): FlowStep[] {
    return [
        { label: "Wallet", complete: walletConnected },
        { label: "GitHub", complete: selectedAgentId === "github" ? hasGitHubConnection : true },
        { label: "Repository", complete: selectedAgentId === "github" ? hasGitHubConnection : true },
        { label: "Run Task", complete: hasCompletedTask },
    ]
}

export default function UnifiedProgressFlow({
    walletConnected,
    hasGitHubConnection,
    selectedAgentId,
    hasCompletedTask,
}: UnifiedProgressFlowProps) {
    const steps = getSteps(walletConnected, hasGitHubConnection, selectedAgentId, hasCompletedTask)
    const completedCount = steps.filter((step) => step.complete).length
    const progress = (completedCount / steps.length) * 100

    const cta =
        !walletConnected
            ? "Connect wallet"
            : selectedAgentId === "github" && !hasGitHubConnection
                ? "Connect GitHub"
                : !hasCompletedTask
                    ? "Run first task"
                    : "Continue setup"

    return (
        <section className="rounded-[26px] bg-surface/78 px-4 py-4 shadow-[0_12px_32px_rgba(15,23,42,0.06)] ring-1 ring-white/35 backdrop-blur-[8px] sm:px-5 sm:py-5">
            <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between gap-3">
                    <div>
                        <div className="text-sm font-semibold text-foreground">Setup Progress</div>
                        <p className="mt-1 text-xs text-foreground-soft">Complete setup to run your first agent task.</p>
                    </div>
                    <div className="rounded-full bg-background px-3 py-1.5 text-[11px] font-semibold text-foreground ring-1 ring-black/5">
                        {completedCount}/{steps.length} Complete
                    </div>
                </div>

                <div className="h-1.5 overflow-hidden rounded-full bg-surface-elevated">
                    <div
                        className="h-full rounded-full bg-[linear-gradient(90deg,#6366f1,#4f46e5)] transition-all duration-300 ease-out"
                        style={{ width: `${progress}%` }}
                    />
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    {steps.map((step, index) => (
                        <div key={step.label} className="flex items-center gap-2">
                            <div className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium ${
                                step.complete
                                    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                                    : "bg-background text-foreground-soft ring-1 ring-black/5"
                            }`}>
                                {step.complete ? <CheckCircle2 size={13} /> : <span className="h-2 w-2 rounded-full bg-current/60" />}
                                {step.label}
                            </div>
                            {index < steps.length - 1 && <span className="hidden text-muted sm:inline">→</span>}
                        </div>
                    ))}
                </div>

                <div className="flex flex-wrap gap-3">
                    {!walletConnected ? (
                        <ConnectWalletButton className="button-primary" label={cta} />
                    ) : (
                        <a
                            href={selectedAgentId === "github" && !hasGitHubConnection ? "#github-setup" : "#agent-workbench"}
                            className="button-primary"
                        >
                            {cta}
                            <ArrowRight size={14} />
                        </a>
                    )}

                    <a href="#agent-workbench" className="button-ghost rounded-2xl !px-4">
                        Open workspace
                    </a>
                </div>
            </div>
        </section>
    )
}
