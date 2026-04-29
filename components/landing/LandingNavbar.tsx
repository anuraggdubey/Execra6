"use client"

import Link from "next/link"
import { ArrowRight, Activity, BarChart3, Settings, Sparkles, Wallet } from "lucide-react"
import BrandLogo from "@/components/layout/BrandLogo"
import { ThemeToggle } from "@/components/ThemeToggle"

type LandingNavbarProps = {
    mounted: boolean
    walletAddress: string | null
    shortWalletAddress: string | null
    walletBalance: string | null
}

const NAV_ITEMS = [
    { href: "/agents", label: "Workspace" },
    { href: "/dashboard", label: "Dashboard" },
    { href: "/activity", label: "Activity" },
    { href: "/settings", label: "Settings" },
]

export default function LandingNavbar({
    mounted,
    walletAddress,
    shortWalletAddress,
    walletBalance,
}: LandingNavbarProps) {
    return (
        <header className="sticky top-0 z-30 px-3 pt-3 sm:px-5 sm:pt-4">
            <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-3 rounded-xl bg-surface/90 px-4 py-2.5 ring-1 ring-black/5 backdrop-blur-md sm:px-5">
                <div className="flex min-w-0 items-center gap-3">
                    <BrandLogo href="/" priority />
                </div>

                <nav className="hidden items-center gap-0.5 lg:flex">
                    {NAV_ITEMS.map((item) => (
                        <Link
                            key={item.href}
                            href={item.href}
                            className="rounded-lg px-3 py-1.5 text-[12px] font-medium text-foreground-soft transition-colors duration-150 hover:bg-surface-elevated hover:text-foreground"
                        >
                            {item.label}
                        </Link>
                    ))}
                </nav>

                <div className="flex items-center gap-2">
                    <ThemeToggle />

                    {mounted && walletAddress && (
                        <div className="hidden items-center gap-1.5 rounded-lg bg-background/80 px-2.5 py-1.5 text-[11px] text-foreground-soft ring-1 ring-black/5 sm:inline-flex">
                            <Wallet size={12} className="text-primary" />
                            <span>{shortWalletAddress}</span>
                            <span className="rounded-full bg-primary-soft px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                                {walletBalance ?? "0"} XLM
                            </span>
                        </div>
                    )}

                    <Link
                        href="/agents"
                        className="inline-flex min-h-[36px] items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-[12px] font-semibold text-white transition-opacity duration-150 hover:opacity-90"
                    >
                        <Sparkles size={13} />
                        <span className="hidden sm:inline">Open Workspace</span>
                        <span className="sm:hidden">Workspace</span>
                        <ArrowRight size={12} />
                    </Link>
                </div>
            </div>

            {/* Mobile nav row */}
            <div className="mx-auto mt-2 flex w-full max-w-7xl items-center justify-center gap-1.5 overflow-x-auto px-1 pb-1 lg:hidden">
                {NAV_ITEMS.map((item, index) => {
                    const Icon =
                        index === 0 ? Sparkles :
                        index === 1 ? BarChart3 :
                        index === 2 ? Activity :
                        Settings

                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-surface/80 px-2.5 py-1.5 text-[11px] font-medium text-foreground-soft ring-1 ring-black/5 transition-colors duration-150 hover:text-foreground"
                        >
                            <Icon size={12} />
                            {item.label}
                        </Link>
                    )
                })}
            </div>
        </header>
    )
}
