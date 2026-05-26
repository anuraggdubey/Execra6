"use client"

import { StatusDot } from "@/components/ui/ExecraIcons"

type CurrentStatusPanelProps = {
    walletAddress: string | null
    shortWalletAddress: string | null
    hasGitHubConnection: boolean
    lastActivity: string | null
}

function SectionHeader({ label }: { label: string }) {
    return (
        <div className="flex items-center gap-3">
            <span className="shrink-0 font-heading text-[10px] uppercase tracking-[0.1em] text-muted">{label}</span>
            <span className="h-px w-full bg-border" />
        </div>
    )
}

export default function CurrentStatusPanel({
    walletAddress,
    hasGitHubConnection,
    lastActivity,
}: CurrentStatusPanelProps) {
    const hasError = Boolean(lastActivity && /error|failed|invalid|unable/i.test(lastActivity))

    return (
        <aside className="h-full bg-surface px-8 py-8">
            <div className="space-y-8">
                <section className="space-y-4">
                    <SectionHeader label="Workspace Status" />
                    <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-0 text-[11px]">
                        {[
                            ["WORKSPACE", "READY"],
                            ["WALLET", walletAddress ? "CONNECTED" : "DISCONNECTED"],
                            ["NETWORK", "TESTNET"],
                        ].map(([label, value], index) => (
                            <div key={label} className={`contents ${index < 2 ? "[&>*]:border-b" : ""}`}>
                                <div className="border-border py-2 font-heading tracking-[0.02em] text-muted">{label}</div>
                                <div className="border-border py-2 text-right font-heading tracking-[0.02em] text-foreground">{value}</div>
                            </div>
                        ))}
                    </div>
                </section>

                <section className="space-y-4">
                    <SectionHeader label="Last Event" />
                    {hasError ? (
                        <div className="rounded-r-[4px] border-l-[3px] border-[color:var(--ex-danger)] bg-[color:var(--ex-danger-bg)] px-3 py-2.5 text-[12px] leading-[1.5] text-[color:var(--ex-danger)]">
                            {lastActivity}
                        </div>
                    ) : (
                        <div className="text-[12px] leading-[1.5] text-foreground-soft">
                            {lastActivity ?? "No recent runs recorded."}
                        </div>
                    )}
                </section>

                <section className="space-y-4">
                    <SectionHeader label="Connected Services" />
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <span className="font-sans text-[12px] text-foreground-soft">Freighter Wallet</span>
                            <StatusDot tone={walletAddress ? "success" : "warning"} />
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="font-sans text-[12px] text-foreground-soft">Stellar Testnet</span>
                            <StatusDot tone="success" />
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="font-sans text-[12px] text-foreground-soft">Soroban RPC</span>
                            <StatusDot tone={hasGitHubConnection ? "success" : "warning"} />
                        </div>
                    </div>
                </section>
            </div>
        </aside>
    )
}
