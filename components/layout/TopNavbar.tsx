"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Activity, BarChart3, Settings, Sparkles, Wallet } from "lucide-react"
import { ThemeToggle } from "@/components/ThemeToggle"
import ConnectWalletButton from "@/components/wallet/ConnectWalletButton"
import { useWalletContext } from "@/lib/WalletContext"
import { useHasMounted } from "@/lib/useHasMounted"

export default function TopNavbar() {
    const mounted = useHasMounted()
    const { disconnectWallet, shortWalletAddress, walletAddress, walletBalance, walletProviderId } = useWalletContext()
    const pathname = usePathname()

    return (
        <header className="flex h-11 shrink-0 items-center justify-between border-b border-border bg-surface/85 px-3 backdrop-blur-md sm:h-14 sm:px-6">
            <div className="flex items-center gap-3 sm:gap-5">
                <Link href="/agents" className="text-[13px] font-bold tracking-tight text-foreground sm:text-sm">
                    Execra
                </Link>

                <nav className="hidden items-center gap-1 sm:flex">
                    <NavLink href="/agents" label="Workspace" icon={<Sparkles size={14} />} active={pathname === "/agents"} />
                    <NavLink href="/dashboard" label="Dashboard" icon={<BarChart3 size={14} />} active={pathname === "/dashboard"} />
                    <NavLink href="/activity" label="Activity" icon={<Activity size={14} />} active={pathname === "/activity"} />
                    <NavLink href="/settings" label="Settings" icon={<Settings size={14} />} active={pathname === "/settings"} />
                </nav>
            </div>

            <div className="flex items-center gap-1 sm:gap-2">
                <ThemeToggle />

                {!mounted ? (
                    <div className="h-8 w-8 rounded-lg sm:w-20" />
                ) : (
                    <div className="flex items-center gap-1 sm:gap-1.5">
                        {walletAddress && (
                            <div className="hidden items-center gap-2 rounded-lg border border-border px-2.5 py-1.5 text-[11px] sm:flex sm:text-xs">
                                <Wallet size={12} className="text-primary" />
                                <span className="max-w-[180px] truncate text-foreground-soft">
                                    {shortWalletAddress} | {walletBalance ?? "0"} XLM
                                </span>
                                <span className="text-muted uppercase">{walletProviderId}</span>
                            </div>
                        )}
                        <ConnectWalletButton className={`${walletAddress ? "button-secondary" : "button-primary"} !min-h-[36px] !px-3 !py-1.5 !text-[11px] sm:!min-h-[44px] sm:!px-4 sm:!py-2.5 sm:!text-xs`} />
                        {walletAddress && (
                            <button onClick={() => void disconnectWallet()} className="button-ghost !min-h-[36px] !px-2 !text-[11px] sm:!min-h-[44px] sm:!px-3 sm:!text-xs">
                                Disconnect
                            </button>
                        )}
                    </div>
                )}
            </div>
        </header>
    )
}

function NavLink({ href, label, icon, active }: { href: string; label: string; icon: React.ReactNode; active: boolean }) {
    return (
        <Link
            href={href}
            className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
                active
                    ? "bg-primary-soft text-foreground"
                    : "text-foreground-soft hover:text-foreground"
            }`}
        >
            {icon}
            {label}
        </Link>
    )
}
