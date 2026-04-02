import { NextResponse } from "next/server"
import { randomBytes } from "crypto"
import { getGitHubOAuthConfig, storeOAuthState } from "@/lib/githubAuth"

export async function GET(req: Request) {
    const config = getGitHubOAuthConfig()
    const url = new URL(req.url)
    const walletAddress = url.searchParams.get("wallet")

    if (!walletAddress) {
        return NextResponse.json({ error: "Wallet address is required to connect GitHub." }, { status: 400 })
    }

    if (!config.configured || !config.clientId) {
        return NextResponse.json({ error: "GitHub OAuth is not configured" }, { status: 500 })
    }

    const state = randomBytes(24).toString("hex")
    await storeOAuthState({ state, walletAddress })

    const githubUrl = new URL("https://github.com/login/oauth/authorize")
    githubUrl.searchParams.set("client_id", config.clientId)
    githubUrl.searchParams.set("redirect_uri", config.callbackUrl)
    githubUrl.searchParams.set("scope", "read:user repo")
    githubUrl.searchParams.set("state", state)

    return NextResponse.redirect(githubUrl)
}
