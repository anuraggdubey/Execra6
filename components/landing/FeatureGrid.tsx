// Execra Platform
"use client"

import Link from "next/link"

const FEATURES = [
    {
        title: "Workspace",
        description: "Launch the full agent workbench and run tasks from one surface.",
        href: "/agents",
    },
    {
        title: "Dashboard",
        description: "Review platform health, metrics, sponsorship status, and monitoring snapshots.",
        href: "/dashboard",
    },
    {
        title: "Activity",
        description: "Track task history, execution updates, and operational events across runs.",
        href: "/activity",
    },
    {
        title: "Agents",
        description: "Jump straight into the six-agent execution surface with the current workflow intact.",
        href: "/agents#agent-workbench",
    },
]

export default function FeatureGrid() {
    return (
        <section className="grid gap-0 border border-border bg-surface md:grid-cols-2">
            {FEATURES.map((feature) => {
                return (
                    <Link
                        key={feature.title}
                        href={feature.href}
                        className="group border-b border-border p-6 transition-colors duration-150 hover:bg-[color:var(--ex-surface-2)] md:[&:nth-child(odd)]:border-r [&:nth-last-child(-n+2)]:md:border-b-0"
                    >
                        <div className="font-heading text-[10px] uppercase tracking-[0.08em] text-muted">Surface</div>
                        <div className="mt-3 font-heading text-[15px] tracking-[0.02em] text-foreground">{feature.title}</div>
                        <p className="mt-2 max-w-[34ch] text-[13px] leading-[1.6] text-foreground-soft">{feature.description}</p>
                        <div className="mt-5 font-heading text-[11px] tracking-[0.04em] text-[color:var(--ex-accent)]">
                            Open →
                        </div>
                    </Link>
                )
            })}
        </section>
    )
}
