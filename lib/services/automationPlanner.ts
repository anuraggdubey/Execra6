import { AgentExecutionError } from "@/lib/agents/shared"
import { completeWithOpenRouter } from "@/lib/llm/openrouter"

export type BrowserAutomationAction =
    | { action: "goto"; url: string }
    | { action: "click"; selector: string }
    | { action: "type"; selector: string; value: string }
    | { action: "press"; key: string }
    | { action: "waitForSelector"; selector: string }
    | { action: "extractText"; selector: string; label?: string }

const MAX_STEPS = 8

function stripCodeFence(input: string) {
    return input.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim()
}

function humanizeRouteSegment(value: string) {
    return value
        .replace(/^\/+|\/+$/g, "")
        .split(/[/?#]/)[0]
        .replace(/[-_]+/g, " ")
        .replace(/\s+/g, " ")
        .trim()
}

function sanitizeSelector(selector: string) {
    const trimmed = selector.trim()
    const hrefMatch = trimmed.match(/^a\s*\[\s*href\s*=\s*['"]([^'"]+)['"]\s*\]$/i)
    if (hrefMatch?.[1]) {
        const humanized = humanizeRouteSegment(hrefMatch[1])
        if (humanized) return humanized
    }

    if (/^\/[a-z0-9/_-]+$/i.test(trimmed)) {
        const humanized = humanizeRouteSegment(trimmed)
        if (humanized) return humanized
    }

    return trimmed
}

function normalizeStep(step: unknown): BrowserAutomationAction | null {
    if (!step || typeof step !== "object") return null

    const item = step as Record<string, unknown>
    const action = typeof item.action === "string" ? item.action : ""

    if (action === "goto" && typeof item.url === "string" && item.url.trim()) {
        return { action, url: item.url.trim() }
    }

    if (action === "click" && typeof item.selector === "string" && item.selector.trim()) {
        return { action, selector: sanitizeSelector(item.selector) }
    }

    if (
        action === "type" &&
        typeof item.selector === "string" &&
        item.selector.trim() &&
        typeof item.value === "string"
    ) {
        return { action, selector: sanitizeSelector(item.selector), value: item.value }
    }

    if (action === "press" && typeof item.key === "string" && item.key.trim()) {
        return { action, key: item.key.trim() }
    }

    if (action === "waitForSelector" && typeof item.selector === "string" && item.selector.trim()) {
        return { action, selector: sanitizeSelector(item.selector) }
    }

    if (action === "extractText" && typeof item.selector === "string" && item.selector.trim()) {
        return {
            action,
            selector: sanitizeSelector(item.selector),
            label: typeof item.label === "string" ? item.label.trim() : undefined,
        }
    }

    return null
}

function extractUrlFallback(instruction: string) {
    const match = instruction.match(/https?:\/\/[^\s]+/i)
    return match?.[0]?.trim() ?? null
}

function extractSearchIntent(instruction: string) {
    const patterns = [
        /search\s+for\s+["“]?(.+?)["”]?(?:\s+(?:and|then|on|from)\b|$)/i,
        /(?:find|look\s+for|search|watch|play)\s+["“]?(.+?)["”]?(?:\s+(?:on|in|from|and|then)\b|$)/i,
        /(?:open|go\s+to|visit)\s+https?:\/\/[^\s]+\s+(?:and\s+)?(?:find|search(?:\s+for)?|watch|play)\s+["“]?(.+?)["”]?$/i,
    ]

    for (const pattern of patterns) {
        const match = instruction.match(pattern)
        if (match?.[1]?.trim()) {
            return match[1].trim()
        }
    }

    return null
}

function buildDeterministicPlan(instruction: string) {
    const fallbackUrl = extractUrlFallback(instruction)
    if (!fallbackUrl) return null

    const lowered = instruction.toLowerCase()
    const steps: BrowserAutomationAction[] = [{ action: "goto", url: fallbackUrl }]
    let hostname = ""

    try {
        hostname = new URL(fallbackUrl).hostname.toLowerCase()
    } catch {
        hostname = ""
    }

    const searchIntent = extractSearchIntent(instruction)
    if (searchIntent) {
        const searchSelectors = hostname.includes("youtube.com")
            ? 'input[name="search_query"], textarea[name="search_query"], input#search, input[placeholder*="Search" i], input[type="search"], input[type="text"]'
            : 'input[type="search"], input[name*="search" i], input[placeholder*="search" i], input[aria-label*="search" i], input[type="text"]'

        steps.push(
            { action: "waitForSelector", selector: searchSelectors },
            { action: "type", selector: searchSelectors, value: searchIntent },
            { action: "press", key: "Enter" }
        )

        if (hostname.includes("youtube.com")) {
            steps.push({
                action: "extractText",
                selector: "ytd-video-renderer, ytd-item-section-renderer, #contents, main, body",
                label: "Search results",
            })
        }
    }

    const extractMatch = lowered.includes("extract") || lowered.includes("get ") || lowered.includes("read ") || lowered.includes("scrape")
    if (extractMatch && !steps.some((step) => step.action === "extractText")) {
        steps.push({
            action: "extractText",
            selector: "main, article, [role='main'], body",
            label: "Extracted content",
        })
    }

    if (steps.length === 1) {
        steps.push(
            { action: "waitForSelector", selector: "body" },
            { action: "extractText", selector: "main, form, [role='main'], body", label: "Visible page text" }
        )
    }

    return steps.slice(0, MAX_STEPS)
}

export async function planBrowserAutomation(instruction: string) {
    const normalizedInstruction = instruction.trim()
    if (!normalizedInstruction) {
        throw new AgentExecutionError("INVALID_INPUT", "instruction is required.", 400)
    }

    const completion = await completeWithOpenRouter({
        system: [
            "You convert browser automation instructions into a strict JSON array of steps.",
            "Allowed actions: goto, click, type, waitForSelector, extractText.",
            "Keep plans safe, short, and concrete.",
            "Use only selectors that are likely stable such as visible link or button text, ids, names, aria labels, or placeholder text.",
            "Prefer human-readable visible labels like Points Table, Standings, Search, or Pricing over CSS paths and href fragments.",
            "Recognize search intent from phrases like find, look for, search, search for, watch, or play when the user names an item to locate on the site.",
            "For search-heavy websites like YouTube, prefer using the site's search box instead of guessing a destination URL.",
            "Do not convert the user's information request into a guessed URL path, route slug, or href selector such as /points-table or a[href='/points-table'].",
            "If the user wants information from the page, prefer extracting text from the relevant visible section instead of inventing a navigation target.",
            "Do not include screenshot steps.",
            "Do not include credentials or invented secrets.",
            `Return at most ${MAX_STEPS} steps.`,
            "Return JSON only.",
        ].join(" "),
        user: JSON.stringify({
            instruction: normalizedInstruction,
            maxSteps: MAX_STEPS,
        }),
        temperature: 0.1,
        maxTokens: 600,
    })

    try {
        const parsed = JSON.parse(stripCodeFence(completion)) as unknown[]
        const steps = Array.isArray(parsed)
            ? parsed.map(normalizeStep).filter((item): item is BrowserAutomationAction => Boolean(item)).slice(0, MAX_STEPS)
            : []

        if (steps.length > 0) {
            return steps
        }
    } catch {
        // fall through to fallback
    }

    const fallbackSteps = buildDeterministicPlan(normalizedInstruction)
    if (fallbackSteps) {
        return fallbackSteps
    }

    throw new AgentExecutionError(
        "PLANNING_FAILED",
        "The Browser Automation Agent could not derive safe browser steps from that instruction. Try including the website URL and the exact actions to take.",
        422
    )
}
