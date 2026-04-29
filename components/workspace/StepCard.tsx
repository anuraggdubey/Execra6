"use client"

import type { ReactNode } from "react"
import { CheckCircle2 } from "lucide-react"

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
            ? "bg-surface ring-1 ring-primary/15 shadow-sm"
            : state === "completed"
                ? "bg-surface/90 opacity-90 ring-1 ring-emerald-500/12"
                : "bg-surface/85 ring-1 ring-black/5"

    return (
        <section className={`rounded-xl p-3 transition-all duration-200 sm:p-4 ${stateStyles}`}>
            <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">{step}</span>
                    {state === "completed" && <CheckCircle2 size={14} className="text-emerald-500" />}
                    <span className="text-[13px] font-semibold text-foreground">{title}</span>
                </div>
                {badge && <div className="shrink-0">{badge}</div>}
            </div>

            <div className="mt-3 space-y-3">{children}</div>

            {footer && (
                <div className="mt-3 border-t border-border/60 pt-2 text-[11px] text-foreground-soft">
                    {footer}
                </div>
            )}
        </section>
    )
}
