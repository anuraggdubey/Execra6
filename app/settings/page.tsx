"use client"

import { useState } from "react"
import { Check, Copy, RefreshCw, Save, Wallet } from "lucide-react"
import { useHasMounted } from "@/lib/useHasMounted"
import ConnectWalletButton from "@/components/wallet/ConnectWalletButton"
import { useWalletContext } from "@/lib/WalletContext"
import {
    DEFAULT_TASK_FEATURE_CONFIG,
    readStoredTaskFeatureConfig,
    writeStoredTaskFeatureConfig,
} from "@/lib/taskFeatures"
import type { TaskFeatureConfig } from "@/types/tasks"

export default function SettingsPage() {
    const { disconnectWallet, refreshBalance, walletAddress, walletBalance, walletProviderId } = useWalletContext()
    const mounted = useHasMounted()
    const [copied, setCopied] = useState(false)
    const [featureConfig, setFeatureConfig] = useState<TaskFeatureConfig>(() => (
        typeof window === "undefined" ? DEFAULT_TASK_FEATURE_CONFIG : readStoredTaskFeatureConfig()
    ))
    const [saveMessage, setSaveMessage] = useState<string | null>(null)

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

    const saveConfig = () => {
        writeStoredTaskFeatureConfig(featureConfig)
        setSaveMessage("Advanced task settings saved. New tasks will use them.")
        window.setTimeout(() => setSaveMessage(null), 2400)
    }

    return (
        <div className="mx-auto max-w-4xl space-y-4 px-1 sm:px-0">
            <div>
                <h1 className="text-2xl font-semibold tracking-tight text-foreground">Settings</h1>
                <p className="text-sm text-foreground-soft">Wallet identity and sponsored Soroban transaction settings</p>
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

                        <div className="rounded-2xl border border-border bg-background p-4 sm:p-5">
                            <div className="flex items-start justify-between gap-4">
                                <div>
                                    <div className="text-base font-semibold text-foreground">Fee Sponsorship</div>
                                    <p className="mt-1 text-sm text-foreground-soft">
                                        These defaults are applied automatically to new Soroban escrow tasks across the workspace.
                                    </p>
                                </div>
                                <button
                                    onClick={saveConfig}
                                    className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-surface-elevated"
                                >
                                    <Save size={14} />
                                    Save
                                </button>
                            </div>

                            <div className="mt-4 grid gap-4 md:grid-cols-2">
                                <label className="space-y-2 text-sm">
                                    <span className="font-medium text-foreground">Fee Mode</span>
                                    <select
                                        value={featureConfig.feeMode}
                                        onChange={(event) => setFeatureConfig((current) => ({ ...current, feeMode: event.target.value as TaskFeatureConfig["feeMode"] }))}
                                        className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-foreground"
                                    >
                                        <option value="user">User Paid</option>
                                        <option value="sponsored">Sponsored Fee Bump</option>
                                    </select>
                                </label>

                                <label className="space-y-2 text-sm md:col-span-2">
                                    <span className="font-medium text-foreground">Sponsor Address</span>
                                    <input
                                        value={featureConfig.sponsorAddress ?? ""}
                                        onChange={(event) => setFeatureConfig((current) => ({ ...current, sponsorAddress: event.target.value.trim().toUpperCase() || null }))}
                                        placeholder="Public sponsor wallet address for UI and confirmation"
                                        className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-foreground"
                                    />
                                </label>
                            </div>

                            {saveMessage && (
                                <div className="mt-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-600 dark:text-emerald-400">
                                    {saveMessage}
                                </div>
                            )}
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
