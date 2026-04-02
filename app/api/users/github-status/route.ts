import { NextResponse } from "next/server"
import { AgentExecutionError } from "@/lib/agents/shared"
import { setGitHubConnected } from "@/lib/services/userService"

export async function POST(req: Request) {
    try {
        const { walletAddress, githubConnected } = await req.json()
        const user = await setGitHubConnected(walletAddress, Boolean(githubConnected))
        return NextResponse.json({ success: true, user })
    } catch (error: unknown) {
        if (error instanceof AgentExecutionError) {
            return NextResponse.json({ error: error.message, code: error.code, details: error.details }, { status: error.status })
        }

        return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to update GitHub status" }, { status: 500 })
    }
}
