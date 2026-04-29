"use client"

import { useState } from "react"
import { ChevronDown, CheckCircle2, Circle, FolderGit2, Sparkles } from "lucide-react"

type SetupStep = {
    label: string
    detail: string
    complete: boolean
}

type AgentInfo = {
    label: string
    description: string
}

type CollapsiblePanelProps = {
    walletConnected: boolean
    hasCompletedTask: boolean
    hasGitHubConnection: boolean
    agents: AgentInfo[]
}

export default function CollapsiblePanel({
    walletConnected,
    hasCompletedTask,
    hasGitHubConnection,
    agents,
}: CollapsiblePanelProps) {
    const [expanded, setExpanded] = useState(false)

    const steps: SetupStep[] = [
        {
            label: "Connect a Stellar wallet",
            detail: "Use wallet identity to unlock the existing agent flows and escrow-backed runs.",
            complete: walletConnected,
        },
        {
            label: "Link GitHub when repository work is needed",
            detail: "GitHub remains optional unless you want repo analysis or code review inside the workspace.",
            complete: hasGitHubConnection,
        },
        {
            label: "Run your first task",
            detail: "A completed run confirms the workspace, activity trail, and execution flow are all working together.",
            complete: hasCompletedTask,
        },
    ]

    return (
        <section className="rounded-xl bg-surface ring-1 ring-border">
            <button
                type="button"
                onClick={() => setExpanded((value) => !value)}
                className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left sm:px-6 sm:py-5"
                aria-expanded={expanded}
            >
                <div>
                    <div className="text-sm font-semibold text-foreground">View Setup & Flow Details</div>
                    <p className="mt-1 text-sm text-foreground-soft">
                        Expand to see quick-start guidance, setup progress, and the six agent roles.
                    </p>
                </div>
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary-soft text-primary transition-transform duration-300 ${expanded ? "rotate-180" : ""}`}>
                    <ChevronDown size={18} />
                </div>
            </button>

            <div
                className={`overflow-hidden px-5 transition-[max-height,opacity,padding] duration-300 ease-out sm:px-6 ${
                    expanded ? "max-h-[1400px] pb-6 opacity-100" : "max-h-0 pb-0 opacity-0"
                }`}
            >
                <div className="grid gap-4 border-t border-border/70 pt-5 xl:grid-cols-[0.95fr_1.05fr]">
                    <div className="space-y-4">
                        <div className="rounded-xl bg-surface-elevated p-4 ring-1 ring-border">
                            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                                <Sparkles size={16} className="text-primary" />
                                Quick Start
                            </div>
                            <p className="mt-2 text-sm leading-7 text-foreground-soft">
                                Start in the workspace, choose the agent that matches the task, and keep the same backend flow while the entry experience stays focused and calm.
                            </p>
                        </div>

                        <div className="space-y-3">
                            {steps.map((step, index) => (
                                <div key={step.label} className="rounded-xl bg-surface-elevated p-4 ring-1 ring-border">
                                    <div className="flex items-center justify-between gap-3">
                                        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                                            {step.complete ? (
                                                <CheckCircle2 size={16} className="text-emerald-600 dark:text-emerald-400" />
                                            ) : (
                                                <Circle size={14} className="text-muted" />
                                            )}
                                            {step.label}
                                        </div>
                                        <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">0{index + 1}</span>
                                    </div>
                                    <p className="mt-2 text-sm leading-7 text-foreground-soft">{step.detail}</p>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="rounded-xl bg-surface-elevated p-4 ring-1 ring-border">
                        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                            <FolderGit2 size={16} className="text-primary" />
                            Agent Roles
                        </div>
                        <div className="mt-4 grid gap-3 sm:grid-cols-2">
                            {agents.map((agent) => (
                                <div key={agent.label} className="rounded-xl bg-surface px-4 py-3 ring-1 ring-border">
                                    <div className="text-sm font-semibold text-foreground">{agent.label}</div>
                                    <p className="mt-1 text-sm leading-6 text-foreground-soft">{agent.description}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </section>
    )
}
