import { NextResponse } from "next/server"
import { connectGitHub } from "@/lib/agents/githubAgentService"
import { AgentExecutionError } from "@/lib/agents/shared"
import { readGitHubAccessToken } from "@/lib/githubAccessToken"
import { setGitHubConnected, upsertUserByWallet } from "@/lib/services/userService"
import { requireWalletAddress } from "@/lib/services/validation"

export async function GET(req: Request) {
    try {
        const accessToken = readGitHubAccessToken(req)
        const walletAddress = req.headers.get("x-wallet-address")
        if (!accessToken) {
            return NextResponse.json({ error: "GitHub access token is required" }, { status: 401 })
        }

        const normalizedWalletAddress = requireWalletAddress(walletAddress)
        await upsertUserByWallet(normalizedWalletAddress)

        const result = await connectGitHub(accessToken)
        await setGitHubConnected(normalizedWalletAddress, true)
        return NextResponse.json({ success: true, ...result })
    } catch (err: unknown) {
        if (err instanceof AgentExecutionError) {
            return NextResponse.json(
                { error: err.message, code: err.code, details: err.details },
                { status: err.status }
            )
        }

        return NextResponse.json(
            { error: err instanceof Error ? err.message : "Failed to connect" },
            { status: 500 }
        )
    }
}
