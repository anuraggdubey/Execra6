"use client"

import { Activity, CheckCircle2, Link2, ShieldCheck } from "lucide-react"

type CurrentStatusPanelProps = {
    walletAddress: string | null
    shortWalletAddress: string | null
    hasGitHubConnection: boolean
    lastActivity: string | null
}

export default function CurrentStatusPanel({
    walletAddress,
    shortWalletAddress,
    hasGitHubConnection,
    lastActivity,
}: CurrentStatusPanelProps) {
    const rows = [
        {
            label: "Workspace",
            value: walletAddress ? "Ready" : "Needs wallet",
            icon: CheckCircle2,
        },
        {
            label: "Last activity",
            value: lastActivity ?? "No recent runs",
            icon: Activity,
        },
        {
            label: "Connected services",
            value: hasGitHubConnection ? `Wallet + GitHub (${shortWalletAddress ?? "linked"})` : walletAddress ? "Wallet connected" : "No active services",
            icon: Link2,
        },
    ]

    return (
        <aside className="hidden xl:block">
            <div className="sticky top-28 rounded-[28px] bg-surface/76 p-5 shadow-[0_14px_40px_rgba(15,23,42,0.08)] ring-1 ring-white/35 backdrop-blur-[8px]">
                <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <ShieldCheck size={16} className="text-primary" />
                    Current Status
                </div>
                <div className="mt-5 space-y-3">
                    {rows.map((row) => {
                        const Icon = row.icon
                        return (
                            <div key={row.label} className="rounded-2xl bg-background/80 px-4 py-3 ring-1 ring-black/5">
                                <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
                                    <Icon size={14} />
                                    {row.label}
                                </div>
                                <div className="mt-2 text-sm font-medium leading-6 text-foreground">{row.value}</div>
                            </div>
                        )
                    })}
                </div>
            </div>
        </aside>
    )
}
