"use client"

import Link from "next/link"
import BrandLogo from "@/components/layout/BrandLogo"
import { StatusDot } from "@/components/ui/ExecraIcons"

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
    const formattedBalance = walletBalance ? Number(walletBalance).toFixed(4) : "0.0000"

    return (
        <header className="top-navbar sticky top-0 z-40 w-full px-4 sm:px-6">
            <div className="mx-auto flex h-full w-full max-w-[1440px] items-center justify-between gap-6">
                <BrandLogo href="/" priority />

                <nav className="hidden items-center gap-8 lg:flex">
                    {NAV_ITEMS.map((item) => (
                        <Link
                            key={item.href}
                            href={item.href}
                            className="font-heading text-[12px] uppercase tracking-[0.06em] text-foreground-soft transition-colors duration-150 hover:text-foreground"
                        >
                            {item.label}
                        </Link>
                    ))}
                </nav>

                <div className="flex items-center gap-2">
                    {mounted && walletAddress && (
                        <div className="hidden items-center gap-2 sm:flex">
                            <div className="inline-flex min-h-[30px] items-center gap-2 rounded-[4px] border border-[color:var(--ex-border-2)] px-[10px] py-[6px] font-heading text-[11px] tracking-[0.02em] text-foreground-soft">
                                <StatusDot tone="success" />
                                <span>{shortWalletAddress}</span>
                            </div>
                            <div className="inline-flex min-h-[30px] items-center gap-2 rounded-[4px] border border-[color:var(--ex-border-2)] px-[10px] py-[6px] font-heading text-[11px] tracking-[0.02em] text-foreground">
                                <span className="text-[color:var(--ex-xlm)]">◈</span>
                                <span>{formattedBalance}</span>
                            </div>
                        </div>
                    )}

                    <Link href="/agents" className="button-primary !min-h-[30px] !px-3 !py-1 !text-[11px]">
                        Open Workspace →
                    </Link>
                </div>
            </div>

            <div className="mx-auto flex w-full max-w-[1440px] items-center gap-6 overflow-x-auto border-t border-[color:var(--ex-border)] lg:hidden">
                {NAV_ITEMS.map((item) => (
                    <Link
                        key={item.href}
                        href={item.href}
                        className="inline-flex shrink-0 items-center py-2 font-heading text-[11px] uppercase tracking-[0.06em] text-foreground-soft transition-colors duration-150 hover:text-foreground"
                    >
                        {item.label}
                    </Link>
                ))}
            </div>
        </header>
    )
}
