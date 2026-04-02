export function readGitHubAccessToken(request: Request) {
    const authHeader = request.headers.get("authorization") ?? request.headers.get("Authorization")
    if (!authHeader) return null

    const match = authHeader.match(/^Bearer\s+(.+)$/i)
    return match?.[1]?.trim() || null
}
