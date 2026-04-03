import { createToolError } from "@/lib/agents/shared"

export type VideoResult = {
    title: string
    url: string
}

const VIDEO_CACHE_TTL_MS = 5 * 60 * 1000
const videoCache = new Map<string, { expiresAt: number; results: VideoResult[] }>()

function getCachedVideos(key: string) {
    const cached = videoCache.get(key)
    if (!cached) return null

    if (cached.expiresAt <= Date.now()) {
        videoCache.delete(key)
        return null
    }

    return cached.results
}

function setCachedVideos(key: string, results: VideoResult[]) {
    videoCache.set(key, {
        expiresAt: Date.now() + VIDEO_CACHE_TTL_MS,
        results,
    })
}

function normalizeVideo(title: unknown, url: unknown): VideoResult | null {
    if (typeof title !== "string" || typeof url !== "string") return null

    const normalizedTitle = title.trim()
    const normalizedUrl = url.trim()
    if (!normalizedTitle || !normalizedUrl) return null

    return {
        title: normalizedTitle,
        url: normalizedUrl,
    }
}

async function fetchWithYouTubeDataApi(query: string, limit: number) {
    const apiKey = process.env.YOUTUBE_DATA_API_KEY
    if (!apiKey) return null

    const endpoint = new URL("https://www.googleapis.com/youtube/v3/search")
    endpoint.searchParams.set("part", "snippet")
    endpoint.searchParams.set("type", "video")
    endpoint.searchParams.set("maxResults", String(limit))
    endpoint.searchParams.set("q", query)
    endpoint.searchParams.set("key", apiKey)

    try {
        const response = await fetch(endpoint.toString(), {
            headers: { Accept: "application/json" },
            cache: "no-store",
        })
        const payload = await response.json() as {
            error?: { message?: string }
            items?: Array<{
                id?: { videoId?: string }
                snippet?: { title?: string }
            }>
        }

        if (!response.ok) {
            throw new Error(payload.error?.message ?? `YouTube Data API request failed with status ${response.status}`)
        }

        return (payload.items ?? [])
            .map((item) => normalizeVideo(
                item.snippet?.title,
                item.id?.videoId ? `https://www.youtube.com/watch?v=${item.id.videoId}` : null
            ))
            .filter((item): item is VideoResult => Boolean(item))
            .slice(0, limit)
    } catch (error) {
        throw createToolError("YouTube Data API", error, "Unable to fetch related videos.")
    }
}

async function fetchWithSerpApiFallback(query: string, limit: number) {
    const apiKey = process.env.SERPAPI_API_KEY
    if (!apiKey) return []

    const endpoint = new URL("https://serpapi.com/search.json")
    endpoint.searchParams.set("engine", "google")
    endpoint.searchParams.set("q", `${query} site:youtube.com/watch`)
    endpoint.searchParams.set("num", String(limit))
    endpoint.searchParams.set("api_key", apiKey)

    try {
        const response = await fetch(endpoint.toString(), {
            headers: { Accept: "application/json" },
            cache: "no-store",
        })
        const payload = await response.json() as {
            organic_results?: Array<{
                title?: string
                link?: string
            }>
        }

        if (!response.ok) {
            throw new Error(`SerpAPI video fallback failed with status ${response.status}`)
        }

        return (payload.organic_results ?? [])
            .map((item) => normalizeVideo(item.title, item.link))
            .filter((item): item is VideoResult => Boolean(item))
            .filter((item) => /youtube\.com|youtu\.be/i.test(item.url))
            .slice(0, limit)
    } catch (error) {
        throw createToolError("SerpAPI video fallback", error, "Unable to fetch related videos.")
    }
}

export async function fetchRelevantVideos(query: string, limit = 4): Promise<VideoResult[]> {
    const normalizedQuery = query.trim()
    const cacheKey = `${limit}:${normalizedQuery.toLowerCase()}`
    const cached = getCachedVideos(cacheKey)
    if (cached) {
        return cached
    }

    const results =
        await fetchWithYouTubeDataApi(normalizedQuery, limit) ??
        await fetchWithSerpApiFallback(normalizedQuery, limit)

    setCachedVideos(cacheKey, results)
    return results
}
