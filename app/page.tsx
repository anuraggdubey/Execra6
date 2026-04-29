"use client"

import LandingNavbar from "@/components/landing/LandingNavbar"
import HeroSection from "@/components/landing/HeroSection"
import SummaryStrip from "@/components/landing/SummaryStrip"
import FeatureGrid from "@/components/landing/FeatureGrid"
import CollapsiblePanel from "@/components/landing/CollapsiblePanel"
import CurrentStatusPanel from "@/components/landing/CurrentStatusPanel"
import { useAgentContext } from "@/lib/AgentContext"
import { useWalletContext } from "@/lib/WalletContext"
import { useHasMounted } from "@/lib/useHasMounted"
import { getGitHubSession } from "@/lib/wallet/githubSession"

const AGENT_INFO = [
    {
        label: "GitHub Agent",
        description: "Connect repositories, inspect code, and review architecture without leaving the workspace.",
    },
    {
        label: "Coding Agent",
        description: "Generate build-ready project artifacts and previews for the next implementation step.",
    },
    {
        label: "Document Agent",
        description: "Upload product docs, specs, or data files and turn them into concise working context.",
    },
    {
        label: "Email Agent",
        description: "Draft and send escrow-backed email workflows through the existing delivery setup.",
    },
    {
        label: "Web Search Agent",
        description: "Run live web research and get source-backed summaries inside the same execution layer.",
    },
    {
        label: "Browser Agent",
        description: "Control a visible browser session and stream actions back into the product workflow.",
    },
]

export default function Home() {
    const mounted = useHasMounted()
    const { agents, activities } = useAgentContext()
    const { walletAddress, shortWalletAddress, walletBalance } = useWalletContext()

    const hasGitHubConnection = Boolean(getGitHubSession(walletAddress)?.accessToken)
    const hasCompletedTask = agents.some((agent) => agent.tasksCompleted > 0)
    const lastActivity = activities[0]?.message ?? null

    return (
        <div className="min-h-screen min-h-dvh bg-[radial-gradient(circle_at_top_left,rgba(99,102,241,0.12),transparent_26%),radial-gradient(circle_at_bottom_right,rgba(15,118,110,0.10),transparent_24%),var(--background)] pb-16">
            <LandingNavbar
                mounted={mounted}
                walletAddress={walletAddress}
                shortWalletAddress={shortWalletAddress}
                walletBalance={walletBalance}
            />

            <main className="px-4 pt-4 sm:px-6 sm:pt-6">
                <div className="mx-auto grid w-full max-w-7xl gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
                    <div className="space-y-6">
                        <HeroSection mounted={mounted} walletAddress={walletAddress} />

                        <SummaryStrip
                            walletAddress={walletAddress}
                            shortWalletAddress={shortWalletAddress}
                            walletBalance={walletBalance}
                            agentCount={agents.length}
                        />

                        <FeatureGrid />

                        <CollapsiblePanel
                            walletConnected={Boolean(walletAddress)}
                            hasCompletedTask={hasCompletedTask}
                            hasGitHubConnection={hasGitHubConnection}
                            agents={AGENT_INFO}
                        />
                    </div>

                    <CurrentStatusPanel
                        walletAddress={walletAddress}
                        shortWalletAddress={shortWalletAddress}
                        hasGitHubConnection={hasGitHubConnection}
                        lastActivity={lastActivity}
                    />
                </div>
            </main>
        </div>
    )
}
