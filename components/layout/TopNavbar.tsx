"use client"

import { usePathname } from "next/navigation"
import Link from "next/link"
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
    const mounted = useHasMounted()
    const { disconnectWallet, shortWalletAddress, walletAddress, walletBalance } = useWalletContext()
    const pathname = usePathname()
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
            </div>

            <div className="mx-auto flex w-full max-w-[1440px] items-center gap-6 overflow-x-auto border-t border-[color:var(--ex-border)] lg:hidden">
                {NAV_ITEMS.map((item) => (
                    <Link
                        key={item.href}
                        href={item.href}
                        className={`inline-flex shrink-0 items-center py-2 font-heading text-[11px] uppercase tracking-[0.06em] transition-colors duration-150 ${
                            pathname === item.href
                                ? "border-b-[1.5px] border-[color:var(--ex-accent)] text-foreground"
                                : "text-foreground-soft hover:text-foreground"
                        }`}
                    >
                        {item.label}
                    </Link>
                ))}
            </div>
        </header>
    )
}
