import { cookies } from "next/headers"
import { timingSafeEqual } from "crypto"

const GITHUB_OAUTH_STATE_COOKIE = "execra_github_oauth_state"
const LEGACY_GITHUB_OAUTH_STATE_COOKIES = [
    "workinggent_github_oauth_state",
    "agentforge_github_oauth_state",
]

type OAuthStatePayload = {
    state: string
    walletAddress: string
}

export function getGitHubOAuthConfig() {
    const clientId = process.env.GITHUB_CLIENT_ID
    const clientSecret = process.env.GITHUB_CLIENT_SECRET
    const appUrl = process.env.APP_URL ?? "http://localhost:3001"
    const callbackUrl = process.env.GITHUB_OAUTH_CALLBACK_URL ?? `${appUrl}/api/auth/github/callback`

    return {
        clientId,
        clientSecret,
        appUrl,
        callbackUrl,
        configured: Boolean(clientId && clientSecret),
    }
}

export async function storeOAuthState(payload: OAuthStatePayload) {
    const store = await cookies()
    store.set(GITHUB_OAUTH_STATE_COOKIE, JSON.stringify(payload), {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 600,
    })
}

export async function consumeOAuthState(expected: string) {
    const store = await cookies()
    const raw =
        store.get(GITHUB_OAUTH_STATE_COOKIE)?.value ??
        LEGACY_GITHUB_OAUTH_STATE_COOKIES.map((cookieName) => store.get(cookieName)?.value).find(Boolean)

    for (const cookieName of [GITHUB_OAUTH_STATE_COOKIE, ...LEGACY_GITHUB_OAUTH_STATE_COOKIES]) {
        store.set(cookieName, "", {
            httpOnly: true,
            sameSite: "lax",
            secure: process.env.NODE_ENV === "production",
            path: "/",
            expires: new Date(0),
        })
    }

    if (!raw) return null

    try {
        const payload = JSON.parse(raw) as OAuthStatePayload
        const actualBuffer = Buffer.from(payload.state)
        const expectedBuffer = Buffer.from(expected)

        if (actualBuffer.length !== expectedBuffer.length) return null
        if (!timingSafeEqual(actualBuffer, expectedBuffer)) return null
        if (!payload.walletAddress) return null

        return payload
    } catch {
        return null
    }
}
