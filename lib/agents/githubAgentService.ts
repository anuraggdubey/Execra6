import { completeWithOpenRouter } from "@/lib/llm/openrouter"
import { AgentExecutionError, createToolError } from "@/lib/agents/shared"
import { githubTool, type GitHubRepo, type GitHubTreeNode, type GitHubTreeResponse } from "@/lib/tools/githubTool"

const IMPORTANT_FILES = new Set([
    "readme.md",
    "package.json",
    "package-lock.json",
    "requirements.txt",
    "cargo.toml",
    "go.mod",
    "pom.xml",
    "dockerfile",
    ".env.example",
    "tsconfig.json",
    "vite.config.ts",
    "vite.config.js",
    "next.config.ts",
    "next.config.js",
])

const SOURCE_EXTENSIONS = new Set([
    ".ts", ".tsx", ".js", ".jsx", ".py", ".go", ".rs", ".java", ".c", ".cpp",
    ".cs", ".rb", ".php", ".swift", ".kt", ".vue", ".svelte", ".html", ".css", ".scss",
])

const MAX_FILE_SIZE = 80_000
const MAX_TOTAL_SIZE = 200_000
const MAX_FILES = 30

function isSourceFile(filePath: string) {
    const lower = filePath.toLowerCase()
    if (["node_modules/", ".git/", "dist/", "build/", ".next/"].some((part) => lower.includes(part))) {
        return false
    }

    const name = lower.split("/").pop() ?? ""
    if (IMPORTANT_FILES.has(name)) return true
    const ext = `.${name.split(".").pop() ?? ""}`
    return SOURCE_EXTENSIONS.has(ext)
}

function priority(filePath: string) {
    const lower = filePath.toLowerCase()
    if (lower === "readme.md") return 0
    if (lower === "package.json") return 1
    if (lower.includes("src/") || lower.includes("app/")) return 2
    if (lower.includes("lib/") || lower.includes("utils/")) return 3
    return 4
}

export async function connectGitHub(accessToken: string) {
    const tool = githubTool({ accessToken })

    try {
        const [user, repos] = await Promise.all([
            tool.getAuthenticatedUser(),
            tool.listRepos(),
        ])

        return {
            user: {
                login: user.login,
                name: user.name,
                avatarUrl: user.avatar_url,
            },
            repos: (Array.isArray(repos) ? repos : []).map((repo: GitHubRepo) => ({
                id: repo.id,
                name: repo.name,
                fullName: repo.full_name,
                description: repo.description ?? "",
                language: repo.language ?? "Unknown",
                stars: repo.stargazers_count ?? 0,
                isPrivate: Boolean(repo.private),
                updatedAt: repo.pushed_at,
                defaultBranch: repo.default_branch ?? "main",
            })),
        }
    } catch (error) {
        throw createToolError("githubTool", error, "Unable to connect to GitHub")
    }
}

export async function resolveRepository(config: { accessToken?: string | null; owner: string; repo: string }) {
    const tool = githubTool(config)

    try {
        const repo = await tool.getRepo()
        return {
            id: repo.id,
            name: repo.name,
            fullName: repo.full_name,
            description: repo.description ?? "",
            language: repo.language ?? "Unknown",
            stars: repo.stargazers_count ?? 0,
            isPrivate: Boolean(repo.private),
            updatedAt: repo.pushed_at,
            defaultBranch: repo.default_branch ?? "main",
        }
    } catch (error) {
        const message = error instanceof Error ? error.message.toLowerCase() : ""
        if (message.includes("not found")) {
            throw new AgentExecutionError("INVALID_GITHUB_REPO", "Invalid GitHub repo.", 404)
        }

        throw createToolError("githubTool", error, "Unable to load repository")
    }
}

export async function fetchRepoContext(config: { accessToken?: string | null; owner: string; repo: string; ref?: string }) {
    const tool = githubTool(config)
    const treeRef = config.ref?.trim() || "HEAD"

    let treeData: GitHubTreeResponse
    try {
        treeData = await tool.getTree(treeRef)
    } catch (error) {
        throw createToolError("githubTool", error, "Unable to fetch repository tree")
    }

    const blobs: { path: string; size: number }[] = (treeData.tree ?? [])
        .filter((item: GitHubTreeNode) => item.type === "blob" && isSourceFile(item.path) && item.size < MAX_FILE_SIZE)
        .sort((a, b) => priority(a.path) - priority(b.path))
        .slice(0, MAX_FILES)

    let totalChars = 0
    const fileContents: { path: string; content: string }[] = []

    await Promise.all(
        blobs.map(async (blob) => {
            if (totalChars >= MAX_TOTAL_SIZE) return

            try {
                const data = await tool.getContent(blob.path)
                if (data.encoding !== "base64" || !data.content) return

                const decoded = Buffer.from(data.content, "base64").toString("utf-8")
                if (totalChars + decoded.length > MAX_TOTAL_SIZE) return

                totalChars += decoded.length
                fileContents.push({ path: blob.path, content: decoded })
            } catch {
                // Skip unreadable files.
            }
        })
    )

    fileContents.sort((a, b) => priority(a.path) - priority(b.path))

    const context = fileContents
        .map((file) => `### File: ${file.path}\n\`\`\`\n${file.content}\n\`\`\``)
        .join("\n\n")

    return {
        fileCount: fileContents.length,
        totalChars,
        files: fileContents.map((file) => file.path),
        context,
    }
}

const ANALYZE_SYSTEM_PROMPT = `You analyze repositories using only the supplied repository context.

Return markdown with:
## Overview
## Core Purpose
## Architecture And Design
## Important Files And Modules
## Data And Control Flow
## Strengths
## Issues Found
## Risks And Edge Cases
## Security Notes
## Performance And Scalability
## Testing And Gaps
## Suggestions
## Security Notes
## Quick Wins

Be very detailed, concrete, and repository-specific.
Reference files and implementation patterns from the provided context wherever possible.
Do not invent code that is not present in the supplied context.`

export async function analyzeRepository(input: {
    owner: string
    repo: string
    context: string
}) {
    return completeWithOpenRouter({
        system: ANALYZE_SYSTEM_PROMPT,
        user: `Analyze the repository ${input.owner}/${input.repo} using only this fetched context:\n\n${input.context}`,
        maxTokens: 2000,
        temperature: 0.3,
    })
}

const ASK_SYSTEM_PROMPT = `You answer questions about a repository using only the supplied repository context.

Be very detailed and specific.
When useful, structure the response with:
## Direct Answer
## Evidence From The Repository
## Relevant Files
## Risks Or Limitations
## Recommendations

If the answer is not present in the provided code, say that clearly.`

export async function askRepositoryQuestion(input: {
    owner: string
    repo: string
    question: string
    context: string
}) {
    return completeWithOpenRouter({
        system: ASK_SYSTEM_PROMPT,
        user: `Repository: ${input.owner}/${input.repo}\n\nContext:\n${input.context}\n\nQuestion: ${input.question}`,
        maxTokens: 1500,
        temperature: 0.3,
    })
}
