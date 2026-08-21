// Execra Platform
"use client"

import type { ReactNode } from "react"

type StepCardProps = {
    step: string
    title: string
    children: ReactNode
    footer?: ReactNode
    badge?: ReactNode
    state?: "idle" | "active" | "completed"
}

export default function StepCard({
    step,
    title,
    children,
    footer,
    badge,
    state = "idle",
}: StepCardProps) {
    const stateStyles =
        state === "active"
            ? "border-[color:var(--ex-border-2)] bg-surface"
            : state === "completed"
                ? "border-[color:var(--ex-border)] bg-surface"
                : "border-[color:var(--ex-border)] bg-surface"

    return (
        <section className={`rounded-[6px] border px-6 py-5 transition-all duration-150 ${stateStyles}`}>
            <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                    <span className="font-heading text-[10px] uppercase tracking-[0.08em] text-muted">{step}</span>
                    <span className="font-heading text-[10px] uppercase tracking-[0.08em] text-muted">·</span>
                    <span className="font-heading text-[15px] font-medium tracking-[0.02em] text-foreground">{title}</span>
                </div>
                {badge && <div className="shrink-0">{badge}</div>}
            </div>

            <div className="mt-4 space-y-3">{children}</div>

            {footer && (
                <div className="mt-4 border-t border-border pt-3 text-[12px] text-foreground-soft">
                    {footer}
                </div>
            )}
        </section>
    )
}
