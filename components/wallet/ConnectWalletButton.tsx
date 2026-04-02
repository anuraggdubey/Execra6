"use client"

import { useState } from "react"
import Image from "next/image"
import { ArrowUpRight, Loader2, Wallet, X } from "lucide-react"
import { useWalletContext } from "@/lib/WalletContext"
import { extractWalletError } from "@/lib/wallet/stellarWallets"

type ConnectWalletButtonProps = {
    className?: string
    label?: string
}

export default function ConnectWalletButton({
    className,
    label = "Connect Wallet",
}: ConnectWalletButtonProps) {
    const {
        connectWallet,
        disconnectWallet,
        isConnecting,
        supportedWallets,
        walletAddress,
        walletError,
        walletProviderId,
        shortWalletAddress,
    } = useWalletContext()
    const [open, setOpen] = useState(false)
    const [localError, setLocalError] = useState<string | null>(null)

    const actionLabel = walletAddress ? shortWalletAddress ?? "Wallet Connected" : label

    return (
        <>
            <button
                onClick={() => setOpen(true)}
                className={className ?? "button-primary"}
            >
                <Wallet size={14} />
                {actionLabel}
            </button>

            {open && (
                <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/55 px-4 backdrop-blur-sm">
                    <div className="panel w-full max-w-lg overflow-hidden">
                        <div className="flex items-center justify-between border-b border-border px-5 py-4">
                            <div>
                                <div className="eyebrow">Stellar Testnet</div>
                                <div className="mt-1 text-lg font-semibold text-foreground">Connect your wallet</div>
                            </div>
                            <button onClick={() => setOpen(false)} className="button-ghost h-10 w-10 rounded-full p-0" aria-label="Close wallet modal">
                                <X size={16} />
                            </button>
                        </div>

                        <div className="space-y-4 p-5">
                            <p className="text-sm leading-relaxed text-foreground-soft">
                                Execra uses your Stellar wallet address as the primary identity across the app.
                            </p>

                            {walletAddress && (
                                <div className="rounded-xl border border-border bg-surface-elevated px-4 py-3 text-sm">
                                    <div className="font-semibold text-foreground">Connected wallet</div>
                                    <div className="mt-1 text-foreground-soft">{walletAddress}</div>
                                    <div className="mt-2 text-xs uppercase tracking-[0.08em] text-muted">
                                        Provider: {walletProviderId ?? "unknown"}
                                    </div>
                                </div>
                            )}

                            <div className="space-y-2">
                                {supportedWallets.map((wallet) => (
                                    <button
                                        key={wallet.id}
                                        onClick={async () => {
                                            setLocalError(null)
                                            try {
                                                await connectWallet(wallet.id)
                                                setOpen(false)
                                            } catch (error) {
                                                setLocalError(extractWalletError(error))
                                            }
                                        }}
                                        disabled={isConnecting}
                                        className="flex w-full items-center justify-between rounded-xl border border-border bg-background px-4 py-3 text-left transition-colors hover:bg-surface-elevated disabled:opacity-50"
                                    >
                                        <div className="flex items-center gap-3">
                                            <Image src={wallet.icon} alt="" width={32} height={32} className="h-8 w-8 rounded-full" unoptimized />
                                            <div>
                                                <div className="text-sm font-semibold text-foreground">{wallet.name}</div>
                                                <div className="mt-1 text-xs text-muted">
                                                    {wallet.isAvailable ? "Detected in this browser" : "Open install or external wallet flow"}
                                                </div>
                                            </div>
                                        </div>
                                        <span className="inline-flex items-center gap-1 text-xs font-medium text-foreground-soft">
                                            {isConnecting ? <Loader2 size={14} className="animate-spin" /> : <ArrowUpRight size={14} />}
                                            Connect
                                        </span>
                                    </button>
                                ))}
                            </div>

                            {(localError || walletError) && (
                                <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-600 dark:text-red-400">
                                    {localError ?? walletError}
                                </div>
                            )}

                            {walletAddress && (
                                <button
                                    onClick={async () => {
                                        await disconnectWallet()
                                        setOpen(false)
                                    }}
                                    className="button-secondary w-full"
                                >
                                    Disconnect Wallet
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </>
    )
}
