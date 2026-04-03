import { AgentExecutionError, createToolError } from "@/lib/agents/shared"

export type SearchDepth = "basic" | "detailed"

export type SearchResult = {
    title: string
    link: string
    description: string
}

const SEARCH_CACHE_TTL_MS = 5 * 60 * 1000
const searchCache = new Map<string, { expiresAt: number; results: SearchResult[] }>()

function getCachedResults(key: string) {
    const cached = searchCache.get(key)
    if (!cached) return null

    if (cached.expiresAt <= Date.now()) {
        searchCache.delete(key)
        return null
    }

    return cached.results
}

function setCachedResults(key: string, results: SearchResult[]) {
    searchCache.set(key, {
        expiresAt: Date.now() + SEARCH_CACHE_TTL_MS,
        results,
    })
}

function getResultLimit(depth: SearchDepth) {
    return depth === "detailed" ? 8 : 5
}

function normalizeResult(input: Partial<SearchResult> | null | undefined): SearchResult | null {
    if (!input) return null

    const title = typeof input.title === "string" ? input.title.trim() : ""
    const link = typeof input.link === "string" ? input.link.trim() : ""
    const description = typeof input.description === "string" ? input.description.trim() : ""

    if (!title || !link) {
        return null
    }

    return {
        title,
        link,
        description,
    }
}

async function searchWithSerpApi(query: string, depth: SearchDepth) {
    const apiKey = process.env.SERPAPI_API_KEY
    if (!apiKey) return null

    const limit = getResultLimit(depth)
    const endpoint = new URL("https://serpapi.com/search.json")
    endpoint.searchParams.set("engine", "google")
    endpoint.searchParams.set("q", query)
    endpoint.searchParams.set("num", String(limit))
    endpoint.searchParams.set("api_key", apiKey)

    try {
        const response = await fetch(endpoint.toString(), {
            headers: { Accept: "application/json" },
            cache: "no-store",
        })
        const payload = await response.json() as {
            error?: string
            organic_results?: Array<{
                title?: string
                link?: string
                snippet?: string
            }>
        }

        if (!response.ok) {
            throw new Error(payload.error ?? `SerpAPI request failed with status ${response.status}`)
        }

        const deduped = new Map<string, SearchResult>()
        for (const item of payload.organic_results ?? []) {
            const normalized = normalizeResult({
                title: item.title,
                link: item.link,
                description: item.snippet,
            })
            if (normalized && !deduped.has(normalized.link)) {
                deduped.set(normalized.link, normalized)
            }
        }

        return Array.from(deduped.values()).slice(0, limit)
    } catch (error) {
        throw createToolError("SerpAPI search", error, "Unable to fetch web search results.")
    }
}

async function searchWithBrave(query: string, depth: SearchDepth) {
    const apiKey = process.env.BRAVE_SEARCH_API_KEY
    if (!apiKey) return null

    const limit = getResultLimit(depth)
    const endpoint = new URL("https://api.search.brave.com/res/v1/web/search")
    endpoint.searchParams.set("q", query)
    endpoint.searchParams.set("count", String(limit))

    try {
        const response = await fetch(endpoint.toString(), {
            headers: {
                Accept: "application/json",
                "X-Subscription-Token": apiKey,
            },
            cache: "no-store",
        })
        const payload = await response.json() as {
            web?: {
                results?: Array<{
                    title?: string
                    url?: string
                    description?: string
                }>
            }
        }

        if (!response.ok) {
            throw new Error(`Brave Search request failed with status ${response.status}`)
        }

        const deduped = new Map<string, SearchResult>()
        for (const item of payload.web?.results ?? []) {
            const normalized = normalizeResult({
                title: item.title,
                link: item.url,
                description: item.description,
            })
            if (normalized && !deduped.has(normalized.link)) {
                deduped.set(normalized.link, normalized)
            }
        }

        return Array.from(deduped.values()).slice(0, limit)
    } catch (error) {
        throw createToolError("Brave Search", error, "Unable to fetch web search results.")
    }
}

export async function searchWeb(query: string, depth: SearchDepth): Promise<SearchResult[]> {
    const normalizedQuery = query.trim()
    if (!normalizedQuery) {
        throw new AgentExecutionError("INVALID_QUERY", "Query is required.", 400)
    }

    const cacheKey = `${depth}:${normalizedQuery.toLowerCase()}`
    const cached = getCachedResults(cacheKey)
    if (cached) {
        return cached
    }

    const results =
        await searchWithSerpApi(normalizedQuery, depth) ??
        await searchWithBrave(normalizedQuery, depth)

    if (!results) {
        throw new AgentExecutionError(
            "SEARCH_PROVIDER_NOT_CONFIGURED",
            "Configure SERPAPI_API_KEY or BRAVE_SEARCH_API_KEY before using the Web Search Agent.",
            500
        )
    }

    setCachedResults(cacheKey, results)
    return results
}
