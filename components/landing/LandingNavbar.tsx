"use client"

import { useState } from "react"
import Link from "next/link"
import { Menu, X } from "lucide-react"
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
    const [mobileOpen, setMobileOpen] = useState(false)
    const formattedBalance = walletBalance ? Number(walletBalance).toFixed(4) : "0.0000"

    return (
        <header className="top-navbar sticky top-0 z-40 w-full px-4 sm:px-6">
            <div className="mx-auto flex h-[64px] w-full max-w-[1440px] items-center justify-between gap-6">
                <BrandLogo href="/" priority />

                <nav className="hidden items-center gap-9 lg:flex">
                    {NAV_ITEMS.map((item) => (
                        <Link
                            key={item.href}
                            href={item.href}
                            className="font-heading text-[12px] uppercase tracking-[0.08em] text-foreground-soft transition-colors duration-150 hover:text-foreground"
                        >
                            {item.label}
                        </Link>
                    ))}
                </nav>

                <div className="hidden items-center gap-3 lg:flex">
                    {mounted && walletAddress && (
                        <div className="flex items-center gap-2">
                            <div className="inline-flex min-h-[40px] items-center gap-2 rounded-[5px] border border-border bg-surface px-3 font-heading text-[11px] tracking-[0.03em] text-foreground-soft shadow-[0_1px_0_rgba(15,23,42,0.03)]">
                                <StatusDot tone="success" />
                                <span>{shortWalletAddress}</span>
                            </div>
                            <div className="inline-flex min-h-[40px] items-center gap-2 rounded-[5px] border border-border bg-surface px-3 font-heading text-[11px] tracking-[0.03em] text-foreground shadow-[0_1px_0_rgba(15,23,42,0.03)]">
                                <span className="text-[color:var(--ex-xlm)]">XLM</span>
                                <span>{formattedBalance}</span>
                            </div>
                        </div>
                    )}

                    <Link href="/agents" className="button-primary !min-h-[40px] !px-4 !py-2 !text-[11px]">
                        Open Workspace -&gt;
                    </Link>
                </div>

                <button
                    type="button"
                    onClick={() => setMobileOpen((open) => !open)}
                    className="inline-flex min-h-[40px] min-w-[40px] items-center justify-center rounded-[5px] border border-border bg-surface text-foreground transition-colors duration-150 hover:border-[color:var(--ex-border-2)] lg:hidden"
                    aria-label={mobileOpen ? "Close landing menu" : "Open landing menu"}
                    aria-expanded={mobileOpen}
                >
                    {mobileOpen ? <X size={18} /> : <Menu size={18} />}
                </button>
            </div>

            {mobileOpen && (
                <div className="mx-auto mb-3 w-full max-w-[1440px] rounded-[6px] border border-border bg-surface p-3 shadow-[0_12px_36px_rgba(15,23,42,0.08)] lg:hidden">
                    <nav className="grid gap-1">
                        {NAV_ITEMS.map((item) => (
                            <Link
                                key={item.href}
                                href={item.href}
                                onClick={() => setMobileOpen(false)}
                                className="rounded-[4px] px-3 py-3 font-heading text-[12px] uppercase tracking-[0.08em] text-foreground-soft transition-colors duration-150 hover:bg-[color:var(--ex-surface-2)] hover:text-foreground"
                            >
                                {item.label}
                            </Link>
                        ))}
                    </nav>

                    <div className="mt-3 border-t border-border pt-3">
                        {mounted && walletAddress ? (
                            <div className="grid gap-2">
                                <div className="flex min-h-[38px] items-center justify-between rounded-[4px] border border-border bg-background px-3 font-heading text-[11px] tracking-[0.03em]">
                                    <span className="text-muted">Wallet</span>
                                    <span className="flex items-center gap-2 text-foreground-soft">
                                        <StatusDot tone="success" />
                                        {shortWalletAddress}
                                    </span>
                                </div>
                                <div className="flex min-h-[38px] items-center justify-between rounded-[4px] border border-border bg-background px-3 font-heading text-[11px] tracking-[0.03em]">
                                    <span className="text-[color:var(--ex-xlm)]">XLM</span>
                                    <span className="text-foreground">{formattedBalance}</span>
                                </div>
                            </div>
                        ) : (
                            <div className="rounded-[4px] border border-border bg-background px-3 py-3 text-[12px] text-foreground-soft">
                                Connect a wallet to show account details.
                            </div>
                        )}

                        <Link
                            href="/agents"
                            onClick={() => setMobileOpen(false)}
                            className="button-primary mt-3 w-full !min-h-[40px] !text-[11px]"
                        >
                            Open Workspace -&gt;
                        </Link>
                    </div>
                </div>
            )}
        </header>
    )
}
