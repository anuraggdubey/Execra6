"use client"

import { usePathname } from "next/navigation"
import Link from "next/link"
import { Activity, Settings, Sparkles } from "lucide-react"
import TopNavbar from "@/components/layout/TopNavbar"

export default function AppShell({ children }: { children: React.ReactNode }) {
    const pathname = usePathname()

    if (pathname === "/") {
        return <div className="min-h-screen min-h-dvh bg-background text-foreground">{children}</div>
    }

    /* Agents page: no wrapper padding — handled internally for 3-col layout */
    const isAgentsPage = pathname === "/agents"

    return (
        <div className="flex h-screen h-dvh flex-col overflow-hidden bg-background text-foreground">
            <TopNavbar />
            <main className={`flex-1 overflow-x-hidden overflow-y-auto ${isAgentsPage ? "" : "px-4 py-6 sm:px-6 lg:px-8"}`}>
                {isAgentsPage ? children : (
                    <div className="mx-auto w-full max-w-[1520px]">{children}</div>
                )}
            </main>

            {/* Mobile bottom nav */}
            <nav className="flex h-14 shrink-0 items-center justify-around border-t border-border bg-surface safe-bottom sm:hidden">
                <MobileNavItem href="/agents" icon={<Sparkles size={18} />} label="Workspace" active={pathname === "/agents"} />
                <MobileNavItem href="/activity" icon={<Activity size={18} />} label="Activity" active={pathname === "/activity"} />
                <MobileNavItem href="/settings" icon={<Settings size={18} />} label="Settings" active={pathname === "/settings"} />
            </nav>
        </div>
    )
}

function MobileNavItem({ href, icon, label, active }: { href: string; icon: React.ReactNode; label: string; active: boolean }) {
    return (
        <Link
            href={href}
            className={`flex min-h-[44px] min-w-[44px] flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors ${
                active ? "text-primary" : "text-muted"
            }`}
        >
            {icon}
            {label}
        </Link>
    )
}
