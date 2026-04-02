"use client"

const STORAGE_KEY = "execra_github_sessions_v1"
const LEGACY_STORAGE_KEYS = ["workinggent_github_sessions_v1"]

export type GitHubWalletSession = {
    accessToken: string
    login?: string
    connectedAt: number
}

type GitHubWalletSessionMap = Record<string, GitHubWalletSession>

function readSessionMap(): GitHubWalletSessionMap {
    if (typeof window === "undefined") return {}

    try {
        const raw =
            window.localStorage.getItem(STORAGE_KEY) ??
            LEGACY_STORAGE_KEYS.map((key) => window.localStorage.getItem(key)).find(Boolean) ??
            null
        if (!raw) return {}
        return JSON.parse(raw) as GitHubWalletSessionMap
    } catch {
        return {}
    }
}

function writeSessionMap(sessions: GitHubWalletSessionMap) {
    if (typeof window === "undefined") return
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions))
    for (const key of LEGACY_STORAGE_KEYS) {
        window.localStorage.removeItem(key)
    }
}

export function getGitHubSession(walletAddress: string | null) {
    if (!walletAddress) return null
    return readSessionMap()[walletAddress] ?? null
}

export function saveGitHubSession(walletAddress: string, session: GitHubWalletSession) {
    const sessions = readSessionMap()
    sessions[walletAddress] = session
    writeSessionMap(sessions)
}

export function clearGitHubSession(walletAddress: string) {
    const sessions = readSessionMap()
    delete sessions[walletAddress]
    writeSessionMap(sessions)
}
