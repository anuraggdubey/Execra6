// Execra Platform
"use client"

import { useState } from "react"
import { usePathname } from "next/navigation"
import Link from "next/link"
import { Menu, X } from "lucide-react"
import BrandLogo from "@/components/layout/BrandLogo"
import ConnectWalletButton from "@/components/wallet/ConnectWalletButton"
import { useWalletContext } from "@/lib/WalletContext"
import { useHasMounted } from "@/lib/useHasMounted"
import { StatusDot } from "@/components/ui/ExecraIcons"

const NAV_ITEMS = [
    { href: "/agents", label: "Workspace" },
    { href: "/dashboard", label: "Dashboard" },
    { href: "/activity", label: "Activity" },
    { href: "/settings", label: "Settings" },
]

export default function TopNavbar() {
    const [mobileOpen, setMobileOpen] = useState(false)
    const mounted = useHasMounted()
    const { disconnectWallet, shortWalletAddress, walletAddress, walletBalance } = useWalletContext()
    const pathname = usePathname()
    const formattedBalance = walletBalance ? Number(walletBalance).toFixed(4) : "0.0000"

    return (
        <header className="top-navbar sticky top-0 z-40 w-full px-4 sm:px-6">
            <div className="mx-auto flex min-h-[52px] w-full max-w-[1440px] flex-wrap items-center justify-between gap-3 py-2 sm:flex-nowrap sm:gap-6 sm:py-0">
                <BrandLogo href="/" />

                <nav className="hidden items-center gap-8 lg:flex">
                    {NAV_ITEMS.map((item) => (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={`relative pb-[2px] font-heading text-[12px] uppercase tracking-[0.06em] transition-colors duration-150 ${
                                pathname === item.href
                                    ? "text-foreground after:absolute after:bottom-[-17px] after:left-0 after:h-[1.5px] after:w-full after:bg-[color:var(--ex-accent)] after:content-['']"
                                    : "text-foreground-soft hover:text-foreground"
                            }`}
                        >
                            {item.label}
                        </Link>
                    ))}
                </nav>

                <div className="ml-auto hidden items-center gap-2 lg:flex">
                    {mounted && walletAddress && (
                        <div className="flex items-center gap-2">
                            <div className="inline-flex min-h-[30px] max-w-[140px] items-center gap-2 rounded-[4px] border border-[color:var(--ex-border-2)] px-[10px] py-[6px] font-heading text-[11px] tracking-[0.02em] text-foreground-soft">
                                <StatusDot tone="success" />
                                <span className="truncate">{shortWalletAddress}</span>
                            </div>
                            <div className="inline-flex min-h-[30px] items-center gap-2 rounded-[4px] border border-[color:var(--ex-border-2)] px-[10px] py-[6px] font-heading text-[11px] tracking-[0.02em] text-foreground">
                                <span className="text-[color:var(--ex-xlm)]">XLM</span>
                                <span>{formattedBalance}</span>
                            </div>
                        </div>
                    )}

                    {mounted ? (
                        <div className="flex items-center gap-2">
                            {!walletAddress && (
                                <ConnectWalletButton className="button-primary !min-h-[30px] !px-3 !py-1 !text-[11px]" />
                            )}
                            {walletAddress && (
                                <button
                                    onClick={() => void disconnectWallet()}
                                    className="font-heading text-[11px] tracking-[0.02em] text-muted transition-colors duration-150 hover:text-[color:var(--ex-danger)]"
                                >
                                    disconnect
                                </button>
                            )}
                        </div>
                    ) : null}
                </div>

                <button
                    type="button"
                    onClick={() => setMobileOpen((open) => !open)}
                    className="ml-auto inline-flex min-h-[38px] min-w-[38px] items-center justify-center rounded-[5px] border border-border bg-surface text-foreground transition-colors duration-150 hover:border-[color:var(--ex-border-2)] lg:hidden"
                    aria-label={mobileOpen ? "Close navigation menu" : "Open navigation menu"}
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
                                className={`rounded-[4px] px-3 py-3 font-heading text-[12px] uppercase tracking-[0.08em] transition-colors duration-150 ${
                                    pathname === item.href
                                        ? "bg-[color:var(--ex-accent-bg)] text-foreground"
                                        : "text-foreground-soft hover:bg-[color:var(--ex-surface-2)] hover:text-foreground"
                                }`}
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
                                    <span className="flex min-w-0 items-center gap-2 text-foreground-soft">
                                        <StatusDot tone="success" />
                                        <span className="truncate">{shortWalletAddress}</span>
                                    </span>
                                </div>
                                <div className="flex min-h-[38px] items-center justify-between rounded-[4px] border border-border bg-background px-3 font-heading text-[11px] tracking-[0.03em]">
                                    <span className="text-[color:var(--ex-xlm)]">XLM</span>
                                    <span className="text-foreground">{formattedBalance}</span>
                                </div>
                                <button
                                    onClick={() => {
                                        setMobileOpen(false)
                                        void disconnectWallet()
                                    }}
                                    className="flex min-h-[38px] items-center justify-center rounded-[4px] border border-[color:var(--ex-danger)] bg-transparent px-3 font-heading text-[11px] tracking-[0.04em] text-[color:var(--ex-danger)] transition-colors duration-150 hover:bg-[color:var(--ex-danger-bg)]"
                                >
                                    Disconnect
                                </button>
                            </div>
                        ) : mounted ? (
                            <ConnectWalletButton className="button-primary w-full !min-h-[40px] !text-[11px]" />
                        ) : null}
                    </div>
                </div>
            )}
        </header>
    )
}
