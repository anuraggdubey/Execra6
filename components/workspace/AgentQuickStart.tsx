"use client"

import { useState } from "react"
import { ArrowRight, CheckCircle2, Sparkles, X } from "lucide-react"

type QuickStartStep = {
    label: string
    complete: boolean
}

type AgentQuickStartProps = {
    /** Short description of what to do */
    description: string
    /** Steps shown as chips */
    steps: QuickStartStep[]
    /** Primary CTA label */
    ctaLabel: string
    /** Primary CTA action — href string or click handler */
    ctaAction: string | (() => void)
    /** Optional secondary CTA */
    secondaryLabel?: string
    secondaryAction?: string | (() => void)
}

export default function AgentQuickStart({
    description,
    steps,
    ctaLabel,
    ctaAction,
    secondaryLabel,
    secondaryAction,
}: AgentQuickStartProps) {
    const [dismissed, setDismissed] = useState(false)

    if (dismissed) return null

    const completedCount = steps.filter((s) => s.complete).length
    const allDone = completedCount === steps.length

    return (
        <section className="rounded-xl bg-surface px-4 py-3 ring-1 ring-black/5">
            {/* Top row: description + progress + dismiss */}
            <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                    <Sparkles size={14} className="shrink-0 text-primary" />
                    <div className="min-w-0">
                        <span className="text-[13px] font-semibold text-foreground">Quick start</span>
                        <span className="ml-2 text-[12px] text-foreground-soft">{description}</span>
                    </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                    <span className="text-[11px] font-medium text-foreground-soft">
                        {completedCount}/{steps.length} complete
                    </span>
                    <button
                        onClick={() => setDismissed(true)}
                        className="rounded-md p-0.5 text-muted transition-colors hover:bg-surface-elevated hover:text-foreground"
                        aria-label="Dismiss quick start"
                    >
                        <X size={14} />
                    </button>
                </div>
            </div>

            {/* Step chips */}
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                {steps.map((step) => (
                    <div
                        key={step.label}
                        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ${
                            step.complete
                                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                                : "bg-background text-foreground-soft ring-1 ring-black/5"
                        }`}
                    >
                        {step.complete ? (
                            <CheckCircle2 size={12} />
                        ) : (
                            <span className="h-1.5 w-1.5 rounded-full bg-current opacity-40" />
                        )}
                        {step.label}
                    </div>
                ))}
            </div>

            {/* CTA buttons */}
            {!allDone && (
                <div className="mt-3 flex items-center gap-2">
                    {typeof ctaAction === "string" ? (
                        <a
                            href={ctaAction}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-[12px] font-semibold text-white transition-opacity hover:opacity-90"
                        >
                            {ctaLabel}
                            <ArrowRight size={12} />
                        </a>
                    ) : (
                        <button
                            onClick={ctaAction}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-[12px] font-semibold text-white transition-opacity hover:opacity-90"
                        >
                            {ctaLabel}
                            <ArrowRight size={12} />
                        </button>
                    )}

                    {secondaryLabel && secondaryAction && (
                        typeof secondaryAction === "string" ? (
                            <a
                                href={secondaryAction}
                                className="inline-flex items-center gap-1.5 rounded-lg bg-background px-3 py-1.5 text-[12px] font-medium text-foreground ring-1 ring-black/5 transition-colors hover:bg-surface-elevated"
                            >
                                {secondaryLabel}
                            </a>
                        ) : (
                            <button
                                onClick={secondaryAction}
                                className="inline-flex items-center gap-1.5 rounded-lg bg-background px-3 py-1.5 text-[12px] font-medium text-foreground ring-1 ring-black/5 transition-colors hover:bg-surface-elevated"
                            >
                                {secondaryLabel}
                            </button>
                        )
                    )}
                </div>
            )}
        </section>
    )
}
