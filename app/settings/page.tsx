"use client"

import { useState } from "react"
import { Check, Copy, RefreshCw, Save, ShieldCheck, Wallet } from "lucide-react"
import { useHasMounted } from "@/lib/useHasMounted"
import ConnectWalletButton from "@/components/wallet/ConnectWalletButton"
import { useWalletContext } from "@/lib/WalletContext"
import {
    DEFAULT_TASK_FEATURE_CONFIG,
    isValidWalletAddress,
    readStoredTaskFeatureConfig,
    writeStoredTaskFeatureConfig,
} from "@/lib/taskFeatures"
import { approveEscrowedTask, registerSmartWalletOnChain } from "@/lib/soroban/taskEscrowClient"
import type { TaskFeatureConfig } from "@/types/tasks"

function parseApprovers(value: string) {
    return value
        .split(",")
        .map((entry) => entry.trim().toUpperCase())
        .filter(Boolean)
}

export default function SettingsPage() {
    const { disconnectWallet, refreshBalance, walletAddress, walletBalance, walletProviderId } = useWalletContext()
    const mounted = useHasMounted()
    const [copied, setCopied] = useState(false)
    const [featureConfig, setFeatureConfig] = useState<TaskFeatureConfig>(() => (
        typeof window === "undefined" ? DEFAULT_TASK_FEATURE_CONFIG : readStoredTaskFeatureConfig()
    ))
    const [saveMessage, setSaveMessage] = useState<string | null>(null)
    const [approvalTaskId, setApprovalTaskId] = useState("")
    const [actionState, setActionState] = useState<string | null>(null)
    const [actionError, setActionError] = useState<string | null>(null)

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

    const handleRegisterSmartWallet = async () => {
        if (!walletAddress || !walletProviderId) {
            setActionError("Connect the owner wallet before registering a smart-wallet delegate.")
            return
        }

        if (!featureConfig.smartWalletAddress || !isValidWalletAddress(featureConfig.smartWalletAddress)) {
            setActionError("Enter a valid Stellar address for the smart-wallet delegate.")
            return
        }

        setActionError(null)
        setActionState("Registering smart wallet on-chain...")
        try {
            const result = await registerSmartWalletOnChain({
                walletAddress,
                walletProviderId,
                smartWalletAddress: featureConfig.smartWalletAddress,
                policy: featureConfig.smartWalletPolicy ?? "delegate",
                featureConfig,
            })
            setActionState(`Smart wallet registered on-chain. TX: ${result.txHash.slice(0, 8)}...`)
        } catch (error) {
            setActionError(error instanceof Error ? error.message : "Failed to register smart wallet.")
            setActionState(null)
        }
    }

    const handleApproveTask = async () => {
        if (!walletAddress || !walletProviderId) {
            setActionError("Connect an approver wallet before approving a multisig task.")
            return
        }

        const normalizedId = approvalTaskId.trim()
        if (!normalizedId) {
            setActionError("Enter an on-chain task ID to approve.")
            return
        }

        setActionError(null)
        setActionState("Submitting multisig approval...")
        try {
            const result = await approveEscrowedTask({
                walletAddress,
                walletProviderId,
                onChainTaskId: BigInt(normalizedId),
                featureConfig,
            })
            setActionState(`Approval submitted. TX: ${result.txHash.slice(0, 8)}...`)
        } catch (error) {
            setActionError(error instanceof Error ? error.message : "Failed to approve task.")
            setActionState(null)
        }
    }

    return (
        <div className="mx-auto max-w-4xl space-y-4 px-1 sm:px-0">
            <div>
                <h1 className="text-2xl font-semibold tracking-tight text-foreground">Settings</h1>
                <p className="text-sm text-foreground-soft">Wallet identity, advanced Soroban task options, and approval tools</p>
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
                                    <div className="text-base font-semibold text-foreground">Advanced Task Features</div>
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

                                <label className="space-y-2 text-sm">
                                    <span className="font-medium text-foreground">Settlement</span>
                                    <select
                                        value={featureConfig.settlementMethod}
                                        onChange={(event) => setFeatureConfig((current) => ({ ...current, settlementMethod: event.target.value as TaskFeatureConfig["settlementMethod"] }))}
                                        className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-foreground"
                                    >
                                        <option value="wallet">Wallet Settlement</option>
                                        <option value="sep24">SEP-24 Anchor</option>
                                        <option value="sep31">SEP-31 Anchor</option>
                                    </select>
                                </label>

                                <label className="space-y-2 text-sm">
                                    <span className="font-medium text-foreground">Approval Mode</span>
                                    <select
                                        value={featureConfig.approvalMode}
                                        onChange={(event) => setFeatureConfig((current) => ({ ...current, approvalMode: event.target.value as TaskFeatureConfig["approvalMode"] }))}
                                        className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-foreground"
                                    >
                                        <option value="single">Single Signer</option>
                                        <option value="multisig">Multi-party Approval</option>
                                    </select>
                                </label>

                                <label className="space-y-2 text-sm">
                                    <span className="font-medium text-foreground">Auth Mode</span>
                                    <select
                                        value={featureConfig.authMode}
                                        onChange={(event) => setFeatureConfig((current) => ({ ...current, authMode: event.target.value as TaskFeatureConfig["authMode"] }))}
                                        className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-foreground"
                                    >
                                        <option value="wallet">Direct Wallet</option>
                                        <option value="smart">Smart Wallet Delegate</option>
                                    </select>
                                </label>

                                <label className="space-y-2 text-sm md:col-span-2">
                                    <span className="font-medium text-foreground">Approver Addresses</span>
                                    <input
                                        value={featureConfig.approvers.join(", ")}
                                        onChange={(event) => setFeatureConfig((current) => ({ ...current, approvers: parseApprovers(event.target.value) }))}
                                        placeholder="Comma-separated Stellar addresses for multisig approvals"
                                        className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-foreground"
                                    />
                                </label>

                                <label className="space-y-2 text-sm">
                                    <span className="font-medium text-foreground">Required Approvals</span>
                                    <input
                                        type="number"
                                        min={1}
                                        max={3}
                                        value={featureConfig.requiredApprovals}
                                        onChange={(event) => setFeatureConfig((current) => ({ ...current, requiredApprovals: Number(event.target.value || 1) }))}
                                        className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-foreground"
                                    />
                                </label>

                                <label className="space-y-2 text-sm">
                                    <span className="font-medium text-foreground">Smart Wallet Address</span>
                                    <input
                                        value={featureConfig.smartWalletAddress ?? ""}
                                        onChange={(event) => setFeatureConfig((current) => ({ ...current, smartWalletAddress: event.target.value.trim().toUpperCase() || null }))}
                                        placeholder="Delegate wallet that can act for the owner"
                                        className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-foreground"
                                    />
                                </label>

                                <label className="space-y-2 text-sm">
                                    <span className="font-medium text-foreground">Smart Wallet Policy</span>
                                    <input
                                        value={featureConfig.smartWalletPolicy ?? ""}
                                        onChange={(event) => setFeatureConfig((current) => ({ ...current, smartWalletPolicy: event.target.value.trim() || "delegate" }))}
                                        placeholder="delegate"
                                        className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-foreground"
                                    />
                                </label>

                                <label className="space-y-2 text-sm">
                                    <span className="font-medium text-foreground">Anchor Name</span>
                                    <input
                                        value={featureConfig.anchor.anchorName ?? ""}
                                        onChange={(event) => setFeatureConfig((current) => ({ ...current, anchor: { ...current.anchor, anchorName: event.target.value.trim() || null } }))}
                                        placeholder="Example Anchor"
                                        className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-foreground"
                                    />
                                </label>

                                <label className="space-y-2 text-sm">
                                    <span className="font-medium text-foreground">Anchor URL</span>
                                    <input
                                        value={featureConfig.anchor.anchorUrl ?? ""}
                                        onChange={(event) => setFeatureConfig((current) => ({ ...current, anchor: { ...current.anchor, anchorUrl: event.target.value.trim() || null } }))}
                                        placeholder="https://anchor.example.com"
                                        className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-foreground"
                                    />
                                </label>

                                <label className="space-y-2 text-sm">
                                    <span className="font-medium text-foreground">Anchor Asset Code</span>
                                    <input
                                        value={featureConfig.anchor.assetCode ?? ""}
                                        onChange={(event) => setFeatureConfig((current) => ({ ...current, anchor: { ...current.anchor, assetCode: event.target.value.trim().toUpperCase() || "USDC" } }))}
                                        placeholder="USDC"
                                        className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-foreground"
                                    />
                                </label>

                                <label className="space-y-2 text-sm">
                                    <span className="font-medium text-foreground">SEP-31 Destination</span>
                                    <input
                                        value={featureConfig.anchor.destination ?? ""}
                                        onChange={(event) => setFeatureConfig((current) => ({ ...current, anchor: { ...current.anchor, destination: event.target.value.trim() || null } }))}
                                        placeholder="Bank account, mobile money handle, or payout reference"
                                        className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-foreground"
                                    />
                                </label>

                                <label className="space-y-2 text-sm md:col-span-2">
                                    <span className="font-medium text-foreground">Sponsor Address (Optional display)</span>
                                    <input
                                        value={featureConfig.sponsorAddress ?? ""}
                                        onChange={(event) => setFeatureConfig((current) => ({ ...current, sponsorAddress: event.target.value.trim().toUpperCase() || null }))}
                                        placeholder="Public sponsor address for UI/display"
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

                        <div className="grid gap-4 lg:grid-cols-2">
                            <div className="rounded-2xl border border-border bg-background p-4 sm:p-5">
                                <div className="flex items-center gap-2 text-base font-semibold text-foreground">
                                    <ShieldCheck size={16} />
                                    Smart Wallet Registration
                                </div>
                                <p className="mt-2 text-sm text-foreground-soft">
                                    Registers the delegate wallet in the contract so tasks created with smart auth can be completed or cancelled by that delegate.
                                </p>
                                <button
                                    onClick={() => void handleRegisterSmartWallet()}
                                    className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-surface px-4 py-3 text-sm font-medium text-foreground transition-colors hover:bg-surface-elevated"
                                >
                                    <ShieldCheck size={14} />
                                    Register Smart Wallet On-Chain
                                </button>
                            </div>

                            <div className="rounded-2xl border border-border bg-background p-4 sm:p-5">
                                <div className="text-base font-semibold text-foreground">Multisig Approval Tool</div>
                                <p className="mt-2 text-sm text-foreground-soft">
                                    Connect as one of the listed approvers, enter the on-chain task ID, and submit your approval transaction.
                                </p>
                                <input
                                    value={approvalTaskId}
                                    onChange={(event) => setApprovalTaskId(event.target.value)}
                                    placeholder="On-chain task ID"
                                    className="mt-4 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-foreground"
                                />
                                <button
                                    onClick={() => void handleApproveTask()}
                                    className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-surface px-4 py-3 text-sm font-medium text-foreground transition-colors hover:bg-surface-elevated"
                                >
                                    <ShieldCheck size={14} />
                                    Approve Multisig Task
                                </button>
                            </div>
                        </div>

                        {actionState && (
                            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-600 dark:text-emerald-400">
                                {actionState}
                            </div>
                        )}

                        {actionError && (
                            <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-600 dark:text-red-400">
                                {actionError}
                            </div>
                        )}

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
