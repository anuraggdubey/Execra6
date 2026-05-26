"use client"

import { usePathname } from "next/navigation"
import TopNavbar from "@/components/layout/TopNavbar"

export default function AppShell({ children }: { children: React.ReactNode }) {
    const pathname = usePathname()

    if (pathname === "/") {
        return <div className="min-h-screen min-h-dvh bg-background text-foreground">{children}</div>
    }

    /* Agents page: no wrapper padding — handled internally for 3-col layout */
    const isAgentsPage = pathname === "/agents"

    return (
        <div className="min-h-screen min-h-dvh bg-background text-foreground">
            <TopNavbar />
            <main className={`${isAgentsPage ? "" : "px-4 pb-8 pt-10 sm:px-6"}`}>
                {isAgentsPage ? children : (
                    <div className="mx-auto w-full max-w-[1440px]">{children}</div>
                )}
            </main>
        </div>
    )
}
