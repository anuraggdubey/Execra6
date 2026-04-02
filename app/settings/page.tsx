"use client"

import { useState } from "react"
import { Check, Copy, RefreshCw, Wallet } from "lucide-react"
import { useHasMounted } from "@/lib/useHasMounted"
import ConnectWalletButton from "@/components/wallet/ConnectWalletButton"
import { useWalletContext } from "@/lib/WalletContext"

export default function SettingsPage() {
    const { disconnectWallet, refreshBalance, walletAddress, walletBalance, walletProviderId } = useWalletContext()
    const mounted = useHasMounted()
    const [copied, setCopied] = useState(false)

    const handleCopy = async () => {
        if (!walletAddress) return

        try {
            await navigator.clipboard.writeText(walletAddress)
            setCopied(true)
            window.setTimeout(() => setCopied(false), 1600)
        } catch {
            setCopied(false)
        }
    }

    return (
        <div className="mx-auto max-w-2xl space-y-4 px-1 sm:px-0">
            <div>
                <h1 className="text-2xl font-semibold tracking-tight text-foreground">Settings</h1>
                <p className="text-sm text-foreground-soft">Wallet identity and workspace preferences</p>
            </div>

            <div className="panel overflow-hidden rounded-2xl p-4 sm:p-5">
                {!mounted ? (
                    <div className="space-y-4">
                        <div className="flex items-center gap-3">
                            <div className="skeleton h-10 w-10 rounded-lg" />
                            <div className="min-w-0 space-y-1.5">
                                <div className="skeleton h-4 w-28" />
                                <div className="skeleton h-3 w-40" />
                            </div>
                        </div>
                        <div className="skeleton h-10 w-full rounded-lg" />
                    </div>
                ) : walletAddress ? (
                    <div className="space-y-4">
                        <div className="flex items-start gap-3">
                            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
                                <Wallet size={20} />
                            </div>
                            <div className="min-w-0 flex-1">
                                <div className="text-base font-semibold text-foreground">Connected Wallet</div>
                                <div className="mt-1 text-sm text-foreground-soft">Stellar testnet identity for this workspace</div>
                            </div>
                            <button
                                type="button"
                                onClick={() => void handleCopy()}
                                className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-xs font-medium text-foreground-soft transition-colors hover:bg-surface-elevated"
                                aria-label="Copy wallet address"
                            >
                                {copied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                                {copied ? "Copied" : "Copy"}
                            </button>
                        </div>

                        <div className="grid gap-3">
                            <div className="rounded-xl border border-border bg-background p-3 sm:p-4">
                                <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">Wallet Address</div>
                                <div className="mt-2 overflow-hidden text-ellipsis break-all font-mono text-sm leading-6 text-foreground">
                                    {walletAddress}
                                </div>
                            </div>

                            <div className="grid gap-3 sm:grid-cols-2">
                                <div className="min-w-0 rounded-xl border border-border bg-background p-3 sm:p-4">
                                    <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">Provider</div>
                                    <div className="mt-2 truncate text-sm font-medium capitalize text-foreground">
                                        {walletProviderId ?? "Unknown"}
                                    </div>
                                </div>

                                <div className="min-w-0 rounded-xl border border-border bg-background p-3 sm:p-4">
                                    <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">Balance</div>
                                    <div className="mt-2 truncate text-sm font-medium text-foreground">
                                        {(walletBalance ?? "0.0000000")} XLM
                                    </div>
                                    <div className="mt-1 text-xs text-foreground-soft">Stellar Testnet</div>
                                </div>
                            </div>
                        </div>

                        <button
                            onClick={() => void refreshBalance()}
                            className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-background px-4 py-3 text-sm font-medium text-foreground transition-colors hover:bg-surface-elevated"
                        >
                            <RefreshCw size={14} />
                            Refresh Balance
                        </button>

                        <button
                            onClick={() => void disconnectWallet()}
                            className="inline-flex w-full items-center justify-center rounded-xl border border-border bg-background px-4 py-3 text-sm font-medium text-foreground transition-colors hover:bg-surface-elevated"
                        >
                            Disconnect Wallet
                        </button>
                    </div>
                ) : (
                    <div className="space-y-3 rounded-xl border border-border bg-background p-4">
                        <p className="text-sm text-foreground-soft">
                            No wallet connected. Connect a Stellar testnet wallet to enable agent actions.
                        </p>
                        <ConnectWalletButton className="button-primary w-full" />
                    </div>
                )}
            </div>
        </div>
    )
}
