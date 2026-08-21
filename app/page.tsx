// Execra Platform
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
    const tasksCompleted = agents.reduce((sum, agent) => sum + agent.tasksCompleted, 0)

    return (
        <div className="min-h-screen min-h-dvh bg-background pb-16">
            <LandingNavbar
                mounted={mounted}
                walletAddress={walletAddress}
                shortWalletAddress={shortWalletAddress}
                walletBalance={walletBalance}
            />

            <main className="px-4 pb-10 pt-8 sm:px-6 sm:pt-10">
                <div className="mx-auto w-full max-w-[1440px]">
                    <section className="grid border border-border bg-background xl:grid-cols-[minmax(0,3fr)_minmax(360px,2fr)]">
                        <div className="border-b border-border px-6 py-8 xl:border-b-0 xl:border-r xl:px-10 xl:py-10">
                            <HeroSection mounted={mounted} walletAddress={walletAddress} />
                        </div>
                        <div className="min-h-full">
                            <CurrentStatusPanel
                                walletAddress={walletAddress}
                                shortWalletAddress={shortWalletAddress}
                                hasGitHubConnection={hasGitHubConnection}
                                lastActivity={lastActivity}
                            />
                        </div>
                    </section>

                    <SummaryStrip
                        walletAddress={walletAddress}
                        shortWalletAddress={shortWalletAddress}
                        walletBalance={walletBalance}
                        agentCount={agents.length}
                        tasksCompleted={tasksCompleted}
                        eventsCount={activities.length}
                    />

                    <div className="mt-8 space-y-8">
                        <FeatureGrid />
                        <CollapsiblePanel
                            walletConnected={Boolean(walletAddress)}
                            hasCompletedTask={hasCompletedTask}
                            hasGitHubConnection={hasGitHubConnection}
                            agents={AGENT_INFO}
                        />
                    </div>
                </div>
            </main>
        </div>
    )
}
