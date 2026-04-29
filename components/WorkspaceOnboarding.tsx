"use client"

import UnifiedProgressFlow from "@/components/workspace/UnifiedProgressFlow"

type WorkspaceAgentId = "github" | "coding" | "document" | "email" | "search" | "browser"

type WorkspaceOnboardingProps = {
    walletConnected: boolean
    hasGitHubConnection: boolean
    selectedAgentId: WorkspaceAgentId
    hasCompletedTask: boolean
}

export default function WorkspaceOnboarding(props: WorkspaceOnboardingProps) {
    return <UnifiedProgressFlow {...props} />
}
