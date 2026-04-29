"use client"

import { Coins, Sparkles, Wallet } from "lucide-react"

type SummaryStripProps = {
    walletAddress: string | null
    shortWalletAddress: string | null
    walletBalance: string | null
    agentCount: number
}

export default function SummaryStrip({
    walletAddress,
    shortWalletAddress,
    walletBalance,
    agentCount,
}: SummaryStripProps) {
    const items = [
        {
            label: "Agents",
            value: String(agentCount),
            icon: Sparkles,
        },
        {
            label: "Wallet",
            value: walletAddress ? shortWalletAddress ?? "Connected" : "Not connected",
            icon: Wallet,
        },
        {
            label: "Balance",
            value: walletAddress ? `${walletBalance ?? "0"} XLM` : "Testnet",
            icon: Coins,
        },
    ]

    return (
        <section className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            {items.map((item) => {
                const Icon = item.icon
                return (
                    <div
                        key={item.label}
                        className="flex min-h-[72px] flex-1 items-center gap-3 rounded-[24px] bg-surface/78 px-4 py-3 shadow-[0_10px_30px_rgba(15,23,42,0.06)] ring-1 ring-white/35 backdrop-blur-[8px]"
                    >
                        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary-soft text-primary">
                            <Icon size={18} />
                        </div>
                        <div className="min-w-0">
                            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">{item.label}</div>
                            <div className="truncate text-sm font-semibold text-foreground">{item.value}</div>
                        </div>
                    </div>
                )
            })}
        </section>
    )
}
