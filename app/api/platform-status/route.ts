import { NextResponse } from "next/server"
import { getGitHubOAuthConfig } from "@/lib/githubAuth"

async function getOpenRouterStatus() {
    const apiKey = process.env.OPENROUTER_API_KEY ?? process.env.OPENAI_API_KEY
    const model = process.env.OPENROUTER_MODEL ?? "openai/gpt-4o-mini"

    if (!apiKey) {
        return { configured: false, model, available: false }
    }

    try {
        const response = await fetch("https://openrouter.ai/api/v1/auth/key", {
            headers: { Authorization: `Bearer ${apiKey}` },
            cache: "no-store",
        })

        if (!response.ok) {
            return { configured: true, model, available: false }
        }

        const payload = await response.json()
        return {
            configured: true,
            model,
            available: true,
            isFreeTier: Boolean(payload?.data?.is_free_tier),
            usageWeekly: payload?.data?.usage_weekly ?? 0,
        }
    } catch {
        return { configured: true, model, available: false }
    }
}

async function getGitHubStatus() {
    const { configured } = getGitHubOAuthConfig()
    return { configured }
}

export async function GET() {
    const [openrouter, github] = await Promise.all([
        getOpenRouterStatus(),
        getGitHubStatus(),
    ])

    return NextResponse.json({
        llm: openrouter,
        tools: {
            github,
        },
        auth: {
            mode: "wallet",
        },
    })
}
