const GITHUB_API_VERSION = "2022-11-28"

export interface GitHubUser {
    login: string
    name: string | null
    avatar_url: string
}

export interface GitHubRepo {
    id: number
    name: string
    full_name: string
    description: string | null
    language: string | null
    stargazers_count: number
    private: boolean
    pushed_at: string
    default_branch: string | null
}

export interface GitHubTreeNode {
    path: string
    type: string
    size: number
}

export interface GitHubTreeResponse {
    tree?: GitHubTreeNode[]
}

export interface GitHubContentResponse {
    encoding?: string
    content?: string
}

function getHeaders(accessToken: string) {
    return {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": GITHUB_API_VERSION,
    }
}

function getOptionalHeaders(accessToken?: string | null) {
    return {
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": GITHUB_API_VERSION,
    }
}

async function githubRequest<T>(url: string, accessToken: string): Promise<T> {
    const response = await fetch(url, {
        headers: getHeaders(accessToken),
        cache: "no-store",
    })

    if (!response.ok) {
        let message = `GitHub request failed with status ${response.status}`
        try {
            const payload = await response.json()
            if (typeof payload?.message === "string") {
                message = payload.message
            }
        } catch {
            // Keep the status-based message.
        }
        throw new Error(message)
    }

    return response.json()
}

async function githubRequestOptional<T>(url: string, accessToken?: string | null): Promise<T> {
    const response = await fetch(url, {
        headers: getOptionalHeaders(accessToken),
        cache: "no-store",
    })

    if (!response.ok) {
        let message = `GitHub request failed with status ${response.status}`
        try {
            const payload = await response.json()
            if (typeof payload?.message === "string") {
                message = payload.message
            }
        } catch {
            // Keep the status-based message.
        }
        throw new Error(message)
    }

    return response.json()
}

export function githubTool(config: { accessToken?: string | null; owner?: string; repo?: string }) {
    const { accessToken, owner, repo } = config

    return {
        getAuthenticatedUser: () =>
            accessToken
                ? githubRequest<GitHubUser>("https://api.github.com/user", accessToken)
                : Promise.reject(new Error("GitHub access token is required")),
        listRepos: () =>
            accessToken
                ? githubRequest<GitHubRepo[]>("https://api.github.com/user/repos?per_page=100&sort=pushed&type=all", accessToken)
                : Promise.reject(new Error("GitHub access token is required")),
        getRepo: () => {
            if (!owner || !repo) throw new Error("owner and repo are required")
            return githubRequestOptional<GitHubRepo>(
                `https://api.github.com/repos/${owner}/${repo}`,
                accessToken
            )
        },
        getTree: (ref = "HEAD") => {
            if (!owner || !repo) throw new Error("owner and repo are required")
            return githubRequestOptional<GitHubTreeResponse>(
                `https://api.github.com/repos/${owner}/${repo}/git/trees/${encodeURIComponent(ref)}?recursive=1`,
                accessToken
            )
        },
        getContent: (filePath: string) => {
            if (!owner || !repo) throw new Error("owner and repo are required")
            return githubRequestOptional<GitHubContentResponse>(
                `https://api.github.com/repos/${owner}/${repo}/contents/${filePath.split("/").map(encodeURIComponent).join("/")}`,
                accessToken
            )
        },
    }
}
