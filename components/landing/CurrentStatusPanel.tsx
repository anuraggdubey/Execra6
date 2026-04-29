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
            <div className="sticky top-28 rounded-xl bg-surface p-5 ring-1 ring-border">
                <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <ShieldCheck size={16} className="text-primary" />
                    Current Status
                </div>
                <div className="mt-5 space-y-3">
                    {rows.map((row) => {
                        const Icon = row.icon
                        return (
                            <div key={row.label} className="rounded-xl bg-surface-elevated px-4 py-3 ring-1 ring-border">
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
