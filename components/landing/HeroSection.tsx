"use client"

import Link from "next/link"
import ConnectWalletButton from "@/components/wallet/ConnectWalletButton"

type HeroSectionProps = {
    mounted: boolean
    walletAddress: string | null
}

export default function HeroSection({ mounted, walletAddress }: HeroSectionProps) {
    return (
        <section className="flex min-h-[420px] flex-col justify-center pr-8 sm:pr-12">
            <div className="font-heading text-[11px] uppercase tracking-[0.1em] text-muted">
                Six Agents · One Execution Layer
            </div>

            <h1 className="mt-8 font-heading text-[44px] font-normal leading-none tracking-[-0.03em] text-foreground sm:text-[56px] lg:text-[64px]">
                <span className="block">Intelligent</span>
                <span className="block">Execution.</span>
            </h1>

            <p className="mt-6 max-w-[420px] text-[16px] leading-[1.6] text-foreground-soft">
                Run GitHub, Coding, Document, Email, Search, and Browser agents. Each task is escrowed on Stellar and confirmed on-chain.
            </p>

            <div className="mt-10 flex flex-wrap gap-3">
                {!mounted ? (
                    <div className="h-[44px] w-40 rounded-[4px] border border-border bg-surface" />
                ) : walletAddress ? (
                    <Link href="/agents" className="button-primary">
                        Open Workspace →
                    </Link>
                ) : (
                    <ConnectWalletButton className="button-primary" label="Open Workspace" />
                )}

                <Link href="/dashboard" className="button-secondary">
                    View Dashboard
                </Link>
            </div>
        </section>
    )
}
