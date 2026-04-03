import { AgentExecutionError } from "@/lib/agents/shared"
import { completeWithOpenRouter } from "@/lib/llm/openrouter"

export type BrowserAutomationAction =
    | { action: "goto"; url: string }
    | { action: "click"; selector: string }
    | { action: "type"; selector: string; value: string }
    | { action: "press"; key: string }
    | { action: "waitForSelector"; selector: string }
    | { action: "extractText"; selector: string; label?: string }
    | { action: "screenshot"; name?: string }

const MAX_STEPS = 8

function stripCodeFence(input: string) {
    return input.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim()
}

function normalizeStep(step: unknown): BrowserAutomationAction | null {
    if (!step || typeof step !== "object") return null

    const item = step as Record<string, unknown>
    const action = typeof item.action === "string" ? item.action : ""

    if (action === "goto" && typeof item.url === "string" && item.url.trim()) {
        return { action, url: item.url.trim() }
    }

    if (action === "click" && typeof item.selector === "string" && item.selector.trim()) {
        return { action, selector: item.selector.trim() }
    }

    if (
        action === "type" &&
        typeof item.selector === "string" &&
        item.selector.trim() &&
        typeof item.value === "string"
    ) {
        return { action, selector: item.selector.trim(), value: item.value }
    }

    if (action === "press" && typeof item.key === "string" && item.key.trim()) {
        return { action, key: item.key.trim() }
    }

    if (action === "waitForSelector" && typeof item.selector === "string" && item.selector.trim()) {
        return { action, selector: item.selector.trim() }
    }

    if (action === "extractText" && typeof item.selector === "string" && item.selector.trim()) {
        return {
            action,
            selector: item.selector.trim(),
            label: typeof item.label === "string" ? item.label.trim() : undefined,
        }
    }

    if (action === "screenshot") {
        return {
            action,
            name: typeof item.name === "string" ? item.name.trim() : undefined,
        }
    }

    return null
}

function extractUrlFallback(instruction: string) {
    const match = instruction.match(/https?:\/\/[^\s]+/i)
    return match?.[0]?.trim() ?? null
}

function buildDeterministicPlan(instruction: string) {
    const fallbackUrl = extractUrlFallback(instruction)
    if (!fallbackUrl) return null

    const lowered = instruction.toLowerCase()
    const steps: BrowserAutomationAction[] = [{ action: "goto", url: fallbackUrl }]

    const searchMatch = instruction.match(/search\s+for\s+["“]?(.+?)["”]?(?:\s+(?:and|then|on|from)\b|$)/i)
    if (searchMatch?.[1]) {
        const searchSelectors = 'input[type="search"], input[name*="search" i], input[placeholder*="search" i], input[aria-label*="search" i], input[type="text"]'
        steps.push(
            { action: "waitForSelector", selector: searchSelectors },
            { action: "type", selector: searchSelectors, value: searchMatch[1].trim() },
            { action: "press", key: "Enter" }
        )
    }

    const extractMatch = lowered.includes("extract") || lowered.includes("get ") || lowered.includes("read ") || lowered.includes("scrape")
    if (extractMatch) {
        steps.push({
            action: "extractText",
            selector: "main, article, [role='main'], body",
            label: "Extracted content",
        })
    }

    if (lowered.includes("screenshot")) {
        steps.push({ action: "screenshot", name: "page-state" })
    }

    if (steps.length === 1) {
        steps.push(
            { action: "waitForSelector", selector: "body" },
            { action: "extractText", selector: "title, h1, body", label: "Visible page text" }
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
            "Allowed actions: goto, click, type, waitForSelector, extractText, screenshot.",
            "Keep plans safe, short, and concrete.",
            "Use only selectors that are likely stable such as ids, names, aria labels, placeholder text, or text-based CSS when reasonable.",
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
