"use client"

import Link from "next/link"
import { ArrowRight, Sparkles } from "lucide-react"
import ConnectWalletButton from "@/components/wallet/ConnectWalletButton"

type HeroSectionProps = {
    mounted: boolean
    walletAddress: string | null
}

export default function HeroSection({ mounted, walletAddress }: HeroSectionProps) {
    return (
        <section className="relative overflow-hidden rounded-[32px] bg-[linear-gradient(135deg,rgba(255,255,255,0.92),rgba(245,247,255,0.82))] p-6 shadow-[0_24px_80px_rgba(15,23,42,0.10)] ring-1 ring-white/50 backdrop-blur-[8px] dark:bg-[linear-gradient(135deg,rgba(23,23,23,0.9),rgba(18,18,18,0.82))] sm:p-8 lg:min-h-[68vh] lg:p-12">
            <div className="absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(99,102,241,0.45),transparent)]" />
            <div className="relative flex h-full flex-col justify-center">
                <div className="inline-flex w-fit items-center gap-2 rounded-full bg-primary-soft px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
                    <Sparkles size={14} />
                    Unified execution layer
                </div>

                <h1 className="mt-6 max-w-4xl font-heading text-4xl font-semibold tracking-[-0.05em] text-foreground sm:text-5xl lg:text-7xl">
                    Six Agents. One Intelligent Workspace.
                </h1>

                <p className="mt-5 max-w-2xl text-base leading-8 text-foreground-soft sm:text-lg">
                    Run GitHub, Coding, Document, Email, Search, and Browser agents from a unified execution layer.
                </p>

                <div className="mt-8 flex flex-wrap gap-3">
                    {!mounted ? (
                        <div className="h-12 w-40 rounded-full bg-surface-elevated" />
                    ) : walletAddress ? (
                        <Link
                            href="/agents"
                            className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-full bg-[linear-gradient(135deg,#6366f1,#4f46e5)] px-5 py-3 text-sm font-semibold text-white shadow-[0_14px_36px_rgba(99,102,241,0.35)] transition-transform duration-200 hover:-translate-y-0.5"
                        >
                            Open Workspace
                            <ArrowRight size={15} />
                        </Link>
                    ) : (
                        <ConnectWalletButton className="!min-h-[48px] rounded-full bg-[linear-gradient(135deg,#6366f1,#4f46e5)] !px-5 !py-3 !text-sm !font-semibold text-white shadow-[0_14px_36px_rgba(99,102,241,0.35)]" label="Open Workspace" />
                    )}

                    <Link
                        href="/dashboard"
                        className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-full bg-surface/88 px-5 py-3 text-sm font-semibold text-foreground shadow-[0_8px_24px_rgba(15,23,42,0.08)] ring-1 ring-black/5 transition-transform duration-200 hover:-translate-y-0.5"
                    >
                        Go to Dashboard
                        <ArrowRight size={15} />
                    </Link>
                </div>
            </div>
        </section>
    )
}
