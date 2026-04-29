"use client"

import Link from "next/link"
import { Activity, ArrowRight, BarChart3, Layers3, Sparkles } from "lucide-react"

const FEATURES = [
    {
        title: "Workspace",
        description: "Launch the full agent workbench and run tasks from one surface.",
        href: "/agents",
        icon: Sparkles,
    },
    {
        title: "Dashboard",
        description: "Review platform health, metrics, sponsorship status, and monitoring snapshots.",
        href: "/dashboard",
        icon: BarChart3,
    },
    {
        title: "Activity",
        description: "Track task history, execution updates, and operational events across runs.",
        href: "/activity",
        icon: Activity,
    },
    {
        title: "Agents",
        description: "Jump straight into the six-agent execution surface with the current workflow intact.",
        href: "/agents#agent-workbench",
        icon: Layers3,
    },
]

export default function FeatureGrid() {
    return (
        <section className="grid gap-4 md:grid-cols-2">
            {FEATURES.map((feature) => {
                const Icon = feature.icon
                return (
                    <Link
                        key={feature.title}
                        href={feature.href}
                        className="group rounded-xl bg-surface p-5 ring-1 ring-border transition-all duration-200 hover:-translate-y-0.5 hover:ring-primary/20"
                    >
                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-soft text-primary transition-transform duration-300 group-hover:scale-105">
                            <Icon size={20} />
                        </div>
                        <div className="mt-5 text-lg font-semibold tracking-tight text-foreground">{feature.title}</div>
                        <p className="mt-2 text-sm leading-7 text-foreground-soft">{feature.description}</p>
                        <div className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-primary">
                            Open
                            <ArrowRight size={15} />
                        </div>
                    </Link>
                )
            })}
        </section>
    )
}
