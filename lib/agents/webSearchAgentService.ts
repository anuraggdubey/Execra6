import { AgentExecutionError } from "@/lib/agents/shared"
import { completeWithOpenRouter } from "@/lib/llm/openrouter"
import { searchWeb, type SearchDepth, type SearchResult } from "@/lib/services/searchService"
import { fetchRelevantVideos, type VideoResult } from "@/lib/services/videoService"

type WebSearchRequest = {
    query: string
    depth: SearchDepth
    includeVideos: boolean
}

type SummaryShape = {
    summary: string
    keyInsights: string[]
}

export type WebSearchAgentResponse = {
    summary: string
    keyInsights: string[]
    results: SearchResult[]
    videos: VideoResult[]
}

function stripCodeFence(input: string) {
    return input.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim()
}

function normalizeSummaryPayload(payload: unknown, fallbackSummary: string): SummaryShape {
    if (!payload || typeof payload !== "object") {
        return { summary: fallbackSummary, keyInsights: [] }
    }

    const summary = typeof (payload as { summary?: unknown }).summary === "string"
        ? (payload as { summary: string }).summary.trim()
        : fallbackSummary
    const keyInsights = Array.isArray((payload as { keyInsights?: unknown }).keyInsights)
        ? (payload as { keyInsights: unknown[] }).keyInsights
            .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
            .slice(0, 4)
        : []

    return {
        summary: summary || fallbackSummary,
        keyInsights,
    }
}

async function summarizeResults(params: {
    query: string
    depth: SearchDepth
    results: SearchResult[]
    videos: VideoResult[]
}) {
    const fallbackSummary = params.results.length > 0
        ? `Found ${params.results.length} source-backed result${params.results.length === 1 ? "" : "s"} for "${params.query}".`
        : `No reliable web results were found for "${params.query}".`

    if (params.results.length === 0) {
        return {
            summary: fallbackSummary,
            keyInsights: [],
        }
    }

    const completion = await completeWithOpenRouter({
        system: [
            "You summarize search results for an escrow-gated web search agent.",
            "Use only the provided search results and videos.",
            "Do not invent facts, dates, claims, or sources.",
            "Return strict JSON with keys: summary (string), keyInsights (array of up to 4 strings).",
            "Keep the summary concise and factual.",
        ].join(" "),
        user: JSON.stringify({
            query: params.query,
            depth: params.depth,
            results: params.results,
            videos: params.videos,
        }),
        temperature: 0.2,
        maxTokens: 450,
    })

    try {
        return normalizeSummaryPayload(JSON.parse(stripCodeFence(completion)), fallbackSummary)
    } catch {
        return {
            summary: completion.trim() || fallbackSummary,
            keyInsights: [],
        }
    }
}

export async function runWebSearchAgent(input: WebSearchRequest): Promise<WebSearchAgentResponse> {
    const query = input.query.trim()
    if (!query) {
        throw new AgentExecutionError("INVALID_QUERY", "Query is required.", 400)
    }

    const results = await searchWeb(query, input.depth)
    const videos = input.includeVideos ? await fetchRelevantVideos(query) : []
    const summary = await summarizeResults({
        query,
        depth: input.depth,
        results,
        videos,
    })

    return {
        summary: summary.summary,
        keyInsights: summary.keyInsights,
        results,
        videos,
    }
}
