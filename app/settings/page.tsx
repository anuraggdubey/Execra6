"use client"

import { useState } from "react"
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
        <div className="mx-auto max-w-[680px] space-y-4 px-6 py-10">
            <div>
                <div className="font-heading text-[11px] uppercase tracking-[0.1em] text-muted">Settings</div>
                <p className="mt-2 text-[14px] text-foreground-soft">Wallet identity and Soroban transaction defaults.</p>
            </div>

            {!mounted ? (
                <div className="space-y-4 border border-border bg-surface p-6">
                    <div className="skeleton h-6 w-32" />
                    <div className="skeleton h-10 w-full" />
                </div>
            ) : walletAddress ? (
                <>
                    <section className="rounded-[6px] border border-border bg-surface p-6">
                        <SectionTitle title="Connected Wallet" />

                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <div className="font-heading text-[10px] uppercase tracking-[0.1em] text-muted">Wallet Address</div>
                                <div className="mt-2 break-all rounded-[4px] border border-border bg-[color:var(--ex-surface-2)] px-3 py-3 font-heading text-[12px] text-foreground">
                                    {walletAddress}
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => void handleCopy()}
                                className="font-heading text-[11px] tracking-[0.02em] text-[color:var(--ex-accent)] hover:underline"
                                aria-label="Copy wallet address"
                            >
                                {copied ? "Copied" : "Copy"}
                            </button>
                        </div>

                        <div className="mt-4 grid gap-4 sm:grid-cols-2">
                            <Field label="Provider" value={walletProviderId ?? "Unknown"} />
                            <Field label="Balance" value={`${walletBalance ?? "0.0000000"} XLM`} />
                        </div>
                    </section>

                    <section className="rounded-[6px] border border-border bg-surface p-6">
                        <SectionTitle title="Fee Sponsorship" />

                        <div className="grid gap-4">
                            <label className="space-y-2 text-sm">
                                <span className="font-heading text-[10px] uppercase tracking-[0.1em] text-muted">Fee Mode</span>
                                <select
                                    value={featureConfig.feeMode}
                                    onChange={(event) => setFeatureConfig((current) => ({ ...current, feeMode: event.target.value as TaskFeatureConfig["feeMode"] }))}
                                    className="w-full rounded-[4px] border border-border bg-background px-3 py-2.5 font-heading text-[13px] text-foreground"
                                >
                                    <option value="user">User Paid</option>
                                    <option value="sponsored">Sponsored Fee Bump</option>
                                </select>
                            </label>

                            <label className="space-y-2 text-sm">
                                <span className="font-heading text-[10px] uppercase tracking-[0.1em] text-muted">Sponsor Address</span>
                                <input
                                    value={featureConfig.sponsorAddress ?? ""}
                                    onChange={(event) => setFeatureConfig((current) => ({ ...current, sponsorAddress: event.target.value.trim().toUpperCase() || null }))}
                                    placeholder="Public sponsor wallet address for UI and confirmation"
                                    className="w-full rounded-[4px] border border-border bg-background px-3 py-2.5 font-heading text-[13px] text-foreground placeholder:text-muted focus:border-[color:var(--ex-accent)] focus:shadow-[0_0_0_3px_rgba(37,99,235,0.1)]"
                                />
                            </label>

                            <div>
                                <button onClick={saveConfig} className="button-primary">
                                    Save
                                </button>
                            </div>
                        </div>

                        {saveMessage && (
                            <div className="mt-4 border border-[color:var(--ex-success)] bg-[color:var(--ex-success-bg)] px-4 py-3 text-sm text-[color:var(--ex-success)]">
                                {saveMessage}
                            </div>
                        )}
                    </section>

                    <div className="space-y-3">
                        <button
                            onClick={() => void refreshBalance()}
                            className="inline-flex min-h-[42px] w-full items-center justify-center rounded-[4px] border border-border bg-transparent px-4 py-3 font-heading text-[12px] tracking-[0.04em] text-foreground-soft transition-colors duration-150 hover:border-[color:var(--ex-border-2)]"
                        >
                            Refresh Balance
                        </button>

                        <button
                            onClick={() => void disconnectWallet()}
                            className="inline-flex min-h-[42px] w-full items-center justify-center rounded-[4px] border border-[color:var(--ex-danger)] bg-transparent px-4 py-3 font-heading text-[12px] tracking-[0.04em] text-[color:var(--ex-danger)] transition-colors duration-150 hover:bg-[color:var(--ex-danger-bg)]"
                        >
                            Disconnect Wallet
                        </button>
                    </div>
                </>
            ) : (
                <section className="rounded-[6px] border border-border bg-surface p-6">
                    <p className="text-sm text-foreground-soft">
                        No wallet connected. Connect a Stellar testnet wallet to enable agent actions.
                    </p>
                    <div className="mt-4">
                        <ConnectWalletButton className="button-primary w-full" />
                    </div>
                </section>
            )}
        </div>
    )
}

function SectionTitle({ title }: { title: string }) {
    return (
        <>
            <div className="font-heading text-[12px] tracking-[0.06em] text-foreground">{title}</div>
            <div className="my-5 h-px w-full bg-border" />
        </>
    )
}

function Field({ label, value }: { label: string; value: string }) {
    return (
        <div>
            <div className="font-heading text-[10px] uppercase tracking-[0.1em] text-muted">{label}</div>
            <div className="mt-2 rounded-[4px] border border-border bg-[color:var(--ex-surface-2)] px-3 py-3 font-heading text-[12px] text-foreground">
                {value}
            </div>
        </div>
    )
}
