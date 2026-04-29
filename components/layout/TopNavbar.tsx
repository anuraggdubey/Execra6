"use client"

import { usePathname } from "next/navigation"
import { Activity, BarChart3, Settings, Sparkles, Wallet } from "lucide-react"
import Link from "next/link"
import BrandLogo from "@/components/layout/BrandLogo"
import { ThemeToggle } from "@/components/ThemeToggle"
import ConnectWalletButton from "@/components/wallet/ConnectWalletButton"
import { useWalletContext } from "@/lib/WalletContext"
import { useHasMounted } from "@/lib/useHasMounted"

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

    return (
        <header className="sticky top-0 z-30 shrink-0 px-3 pt-3 sm:px-5 sm:pt-4">
            <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-3 rounded-xl bg-surface/90 px-4 py-2.5 ring-1 ring-border backdrop-blur-md sm:px-5">
                <div className="flex min-w-0 items-center gap-3">
                    <BrandLogo href="/" priority />
                </div>

                <nav className="hidden items-center gap-0.5 lg:flex">
                    {NAV_ITEMS.map((item) => (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={`rounded-lg px-3 py-1.5 text-[12px] font-medium transition-colors duration-150 ${
                                pathname === item.href
                                    ? "bg-primary-soft text-foreground"
                                    : "text-foreground-soft hover:bg-surface-elevated hover:text-foreground"
                            }`}
                        >
                            {item.label}
                        </Link>
                    ))}
                </nav>

                <div className="flex items-center gap-2">
                    <ThemeToggle />

                    {mounted && walletAddress && (
                        <div className="hidden items-center gap-1.5 rounded-lg bg-background/80 px-2.5 py-1.5 text-[11px] text-foreground-soft ring-1 ring-border sm:inline-flex">
                            <Wallet size={12} className="text-primary" />
                            <span>{shortWalletAddress}</span>
                            <span className="rounded-full bg-primary-soft px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                                {walletBalance ?? "0"} XLM
                            </span>
                        </div>
                    )}

                    {mounted && (
                        <div className="flex items-center gap-1.5">
                            <ConnectWalletButton className={`${walletAddress ? "button-secondary" : "button-primary"} !min-h-[32px] !rounded-lg !px-3 !py-1 !text-[11px] sm:!min-h-[36px] sm:!px-3 sm:!py-1.5 sm:!text-xs`} />
                            {walletAddress && (
                                <button onClick={() => void disconnectWallet()} className="button-ghost !min-h-[32px] !rounded-lg !px-2 !text-[11px] sm:!min-h-[36px] sm:!px-2.5 sm:!text-xs">
                                    Disconnect
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Mobile nav row — matches landing navbar style */}
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
                            className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-medium ring-1 ring-border transition-colors duration-150 ${
                                pathname === item.href
                                    ? "bg-primary-soft text-foreground"
                                    : "bg-surface/80 text-foreground-soft hover:text-foreground"
                            }`}
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
