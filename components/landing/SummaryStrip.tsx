// Execra Platform
"use client"

type SummaryStripProps = {
    walletAddress: string | null
    shortWalletAddress: string | null
    walletBalance: string | null
    agentCount: number
    tasksCompleted?: number
    eventsCount?: number
}

export default function SummaryStrip({
    walletAddress,
    shortWalletAddress,
    walletBalance,
    agentCount,
    tasksCompleted = 0,
    eventsCount = 0,
}: SummaryStripProps) {
    const items = [
        {
            label: "Agents",
            value: String(agentCount),
            tone: "ink",
        },
        {
            label: "Wallet",
            value: walletAddress ? shortWalletAddress ?? "Connected" : "Not connected",
            tone: "muted",
        },
        {
            label: "Balance",
            value: walletAddress ? (walletBalance ? Number(walletBalance).toFixed(4) : "0.0000") : "0.0000",
            tone: "xlm",
        },
        {
            label: "Tasks Completed",
            value: String(tasksCompleted),
            tone: "ink",
        },
        {
            label: "Events",
            value: String(eventsCount),
            tone: "ink",
        },
    ]

    return (
        <section className="grid border-y border-border bg-surface sm:grid-cols-5">
            {items.map((item, index) => {
                const valueClassName =
                    item.tone === "xlm"
                        ? "text-[color:var(--ex-xlm)]"
                        : item.tone === "muted"
                            ? "text-foreground-soft"
                            : "text-foreground"

                return (
                    <div
                        key={item.label}
                        className={`flex min-h-[80px] items-center px-6 py-4 ${index < items.length - 1 ? "border-b border-border sm:border-b-0 sm:border-r" : ""}`}
                    >
                        <div className="min-w-0">
                            <div className={`font-heading text-[22px] tracking-[0.02em] ${valueClassName}`}>
                                {item.label === "Balance" ? `◈ ${item.value}` : item.value}
                            </div>
                            <div className="mt-1 font-heading text-[10px] uppercase tracking-[0.08em] text-muted">{item.label}</div>
                        </div>
                    </div>
                )
            })}
        </section>
    )
}
