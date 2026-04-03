"use client"

import Link from "next/link"
import { ArrowRight, Braces, FileText, Github, Globe2, Mail, MonitorPlay } from "lucide-react"
import ConnectWalletButton from "@/components/wallet/ConnectWalletButton"
import { useWalletContext } from "@/lib/WalletContext"
import { useHasMounted } from "@/lib/useHasMounted"

const AGENTS = [
    { label: "GitHub Agent", icon: Github },
    { label: "Coding Agent", icon: Braces },
    { label: "Document Agent", icon: FileText },
    { label: "Email Agent", icon: Mail },
    { label: "Web Search Agent", icon: Globe2 },
    { label: "Browser Agent", icon: MonitorPlay },
]

export default function Home() {
    const { walletAddress, shortWalletAddress, walletBalance } = useWalletContext()
    const mounted = useHasMounted()

    return (
        <div className="flex min-h-screen min-h-dvh flex-col">
            <header className="flex items-center justify-between px-5 py-4 sm:px-8">
                <Link href="/" className="text-sm font-semibold tracking-tight text-foreground">
                    Execra
                </Link>
                <div className="flex items-center gap-2">
                    {!mounted ? (
                        <div className="h-9 w-20" />
                    ) : (
                        <>
                            {walletAddress && (
                                <div className="hidden rounded-lg border border-border px-3 py-2 text-xs text-foreground-soft sm:block">
                                    {shortWalletAddress} | {walletBalance ?? "0.0000000"} XLM
                                </div>
                            )}
                            {walletAddress ? (
                                <Link href="/agents" className="button-primary text-sm">
                                    Open Workspace
                                    <ArrowRight size={14} />
                                </Link>
                            ) : (
                                <ConnectWalletButton className="button-primary text-sm" />
                            )}
                        </>
                    )}
                </div>
            </header>

            <main className="flex flex-1 flex-col items-center justify-center px-5 pb-20 sm:px-6 sm:pb-24">
                <div className="mx-auto max-w-2xl text-center">
                    <h1 className="font-heading text-3xl font-semibold tracking-tight text-foreground sm:text-5xl">
                        Web3 identity first, agent workspace second.
                    </h1>
                    <p className="mx-auto mt-4 max-w-lg text-[15px] leading-relaxed text-foreground-soft sm:text-base">
                        Connect a Stellar testnet wallet to use the GitHub, Coding, Document, Email, Web Search, and Browser agents with a cleaner
                        identity model that is ready for smart contract integration.
                    </p>

                    <div className="mt-8 flex justify-center gap-3">
                        {!mounted ? (
                            <div className="h-11 w-32" />
                        ) : walletAddress ? (
                            <Link href="/agents" className="button-primary">
                                Open Workspace
                                <ArrowRight size={14} />
                            </Link>
                        ) : (
                            <ConnectWalletButton className="button-primary" label="Connect Wallet" />
                        )}
                    </div>
                </div>

                <div className="mt-12 flex flex-wrap justify-center gap-2 sm:mt-16 sm:gap-3">
                    {AGENTS.map((agent) => {
                        const Icon = agent.icon
                        return (
                            <div key={agent.label} className="flex items-center gap-2 rounded-lg bg-surface-elevated px-3 py-2.5 text-xs text-foreground-soft" style={{ minHeight: 40 }}>
                                <Icon size={14} className="text-muted" />
                                {agent.label}
                            </div>
                        )
                    })}
                </div>
            </main>
        </div>
    )
}
