"use client"

import { useState } from "react"
import { StatusDot } from "@/components/ui/ExecraIcons"

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
        <section className="border border-border bg-surface">
            <button
                type="button"
                onClick={() => setExpanded((value) => !value)}
                className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left"
                aria-expanded={expanded}
            >
                <div>
                    <div className="font-heading text-[12px] uppercase tracking-[0.08em] text-foreground">View Setup & Flow Details</div>
                    <p className="mt-2 text-[13px] leading-[1.6] text-foreground-soft">
                        Expand to see quick-start guidance, setup progress, and the six agent roles.
                    </p>
                </div>
                <div className="shrink-0 font-heading text-[14px] text-foreground-soft">{expanded ? "−" : "+"}</div>
            </button>

            <div
                className={`overflow-hidden px-6 transition-[max-height,opacity,padding] duration-300 ease-out ${
                    expanded ? "max-h-[1400px] pb-6 opacity-100" : "max-h-0 pb-0 opacity-0"
                }`}
            >
                <div className="grid gap-0 border-t border-border pt-6 xl:grid-cols-[0.95fr_1.05fr]">
                    <div className="space-y-4">
                        <div className="border border-border bg-[color:var(--ex-surface-2)] p-5">
                            <div className="font-heading text-[10px] uppercase tracking-[0.08em] text-muted">Quick Start</div>
                            <p className="mt-3 text-[13px] leading-[1.6] text-foreground-soft">
                                Start in the workspace, choose the agent that matches the task, and keep the same backend flow while the entry experience stays focused and calm.
                            </p>
                        </div>

                        <div className="space-y-3">
                            {steps.map((step, index) => (
                                <div key={step.label} className="border border-border bg-surface p-4">
                                    <div className="flex items-center justify-between gap-3">
                                        <div className="flex items-center gap-2 text-[13px] text-foreground">
                                            <StatusDot tone={step.complete ? "success" : "neutral"} />
                                            {step.label}
                                        </div>
                                        <span className="font-heading text-[11px] uppercase tracking-[0.12em] text-muted">0{index + 1}</span>
                                    </div>
                                    <p className="mt-2 text-[13px] leading-[1.6] text-foreground-soft">{step.detail}</p>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="border-l border-border pl-6">
                        <div className="font-heading text-[10px] uppercase tracking-[0.08em] text-muted">Agent Roles</div>
                        <div className="mt-4 grid gap-0 border border-border sm:grid-cols-2">
                            {agents.map((agent) => (
                                <div key={agent.label} className="border-b border-border px-4 py-4 sm:[&:nth-child(odd)]:border-r [&:nth-last-child(-n+2)]:sm:border-b-0">
                                    <div className="font-heading text-[12px] tracking-[0.02em] text-foreground">{agent.label}</div>
                                    <p className="mt-2 text-[13px] leading-[1.6] text-foreground-soft">{agent.description}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </section>
    )
}
