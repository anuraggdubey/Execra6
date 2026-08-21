// Execra Platform
"use client"

import { useState } from "react"

type QuickStartStep = {
    label: string
    complete: boolean
}

type AgentQuickStartProps = {
    description: string
    steps: QuickStartStep[]
    ctaLabel: string
    ctaAction: string | (() => void)
    secondaryLabel?: string
    secondaryAction?: string | (() => void)
}

export default function AgentQuickStart({
    description,
    steps,
}: AgentQuickStartProps) {
    const [dismissed, setDismissed] = useState(false)

    if (dismissed) return null

    return (
        <section className="rounded-[6px] border border-border bg-surface px-4 py-4 sm:px-5">
            <div className="flex items-start justify-between gap-4">
                <div className="flex min-w-0 items-center gap-3">
                    <span className="font-heading text-[10px] uppercase tracking-[0.08em] text-muted">Quick Start</span>
                    <span className="min-w-0 text-[12px] leading-[1.5] text-foreground-soft">{description}</span>
                </div>
                <button
                    onClick={() => setDismissed(true)}
                    className="font-heading text-[11px] uppercase tracking-[0.06em] text-muted transition-colors duration-150 hover:text-foreground"
                    aria-label="Dismiss quick start"
                >
                    close
                </button>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
                {steps.map((step) => (
                    <div
                        key={step.label}
                        className={`inline-flex items-center rounded-[4px] border px-2 py-1 font-heading text-[10px] uppercase tracking-[0.06em] ${
                            step.complete
                                ? "border-[color:var(--ex-success)] bg-[color:var(--ex-success-bg)] text-[color:var(--ex-success)]"
                                : "border-border text-muted"
                        }`}
                    >
                        {step.complete ? `✓ ${step.label}` : step.label}
                    </div>
                ))}
            </div>
        </section>
    )
}
