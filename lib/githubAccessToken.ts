function readBearerToken(request: Request) {
    const authHeader = request.headers.get("authorization") ?? request.headers.get("Authorization")
    if (!authHeader) return null

    const match = authHeader.match(/^Bearer\s+(.+)$/i)
    return match?.[1]?.trim() || null
}

function readServerGitHubAccessToken() {
    return process.env.GITHUB_PERSONAL_ACCESS_TOKEN?.trim()
        || process.env.GITHUB_SERVER_ACCESS_TOKEN?.trim()
        || null
}

export function readGitHubAccessToken(request: Request, options?: { allowServerFallback?: boolean }) {
    const bearerToken = readBearerToken(request)
    if (bearerToken) return bearerToken

    if (options?.allowServerFallback) {
        return readServerGitHubAccessToken()
    }

    return null
}
