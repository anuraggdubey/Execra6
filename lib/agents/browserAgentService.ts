import { AgentExecutionError } from "@/lib/agents/shared"
import { planBrowserAutomation } from "@/lib/services/automationPlanner"
import { executeBrowserPlan } from "@/lib/services/browserService"
import { completeWithOpenRouter } from "@/lib/llm/openrouter"
import {
    appendBrowserLog,
    completeBrowserSession,
    createBrowserSession,
    failBrowserSession,
    type BrowserStructuredResult,
    type BrowserAgentRunResult,
} from "@/lib/services/browserSessionStore"

function stripCodeFence(input: string) {
    return input.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim()
}

function normalizeStructuredResult(payload: unknown, instruction: string, rawResult: string): BrowserStructuredResult {
    const fallbackSummary = rawResult.split("\n").map((line) => line.trim()).find(Boolean) ?? "Browser task completed."
    const fallbackDetails = rawResult.trim() || "The browser task completed, but no structured details were produced."

    if (!payload || typeof payload !== "object") {
        return {
            summary: fallbackSummary,
            details: fallbackDetails,
            keyPoints: [],
            searchedQuery: instruction,
            suggestions: [],
        }
    }

    const candidate = payload as {
        summary?: unknown
        details?: unknown
        keyPoints?: unknown
        searchedQuery?: unknown
        suggestions?: unknown
    }

    const toList = (value: unknown) =>
        Array.isArray(value)
            ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).slice(0, 6)
            : []

    return {
        summary: typeof candidate.summary === "string" && candidate.summary.trim() ? candidate.summary.trim() : fallbackSummary,
        details: typeof candidate.details === "string" && candidate.details.trim() ? candidate.details.trim() : fallbackDetails,
        keyPoints: toList(candidate.keyPoints),
        searchedQuery: typeof candidate.searchedQuery === "string" && candidate.searchedQuery.trim() ? candidate.searchedQuery.trim() : instruction,
        suggestions: toList(candidate.suggestions),
    }
}

async function synthesizeBrowserAnswer(params: {
    instruction: string
    rawResult: string
    finalUrl?: string
}): Promise<BrowserStructuredResult> {
    const rawResult = params.rawResult.trim()
    if (!rawResult || rawResult === "Browser automation completed without text extraction.") {
        return {
            summary: "No extractable content was found.",
            details: params.rawResult,
            keyPoints: [],
            searchedQuery: params.instruction,
            suggestions: [],
        }
    }

    const completion = await completeWithOpenRouter({
        system: [
            "You structure a browser automation result using only text extracted from the visited page.",
            "Do not invent missing facts or navigation steps.",
            "If the page is a form, identify the fields or questions and suggest what the user should fill in.",
            "For personal details or subjective answers that cannot be inferred from the page, explicitly tell the user they must provide their own information.",
            "If the extracted text does not fully answer the request, say what was found and what remains unclear.",
            "Return strict JSON only with keys: summary (string), details (string), keyPoints (array of short strings), searchedQuery (string), suggestions (array of short strings).",
            "Keep all fields concise, useful, and clean for a UI card layout.",
        ].join(" "),
        user: JSON.stringify({
            instruction: params.instruction,
            finalUrl: params.finalUrl ?? null,
            extractedText: rawResult,
        }),
        temperature: 0.2,
        maxTokens: 500,
    })

    try {
        return normalizeStructuredResult(JSON.parse(stripCodeFence(completion)), params.instruction, rawResult)
    } catch {
        return normalizeStructuredResult(null, params.instruction, completion.trim() || rawResult)
    }
}

export async function runBrowserAgent(params: {
    sessionId: string
    instruction: string
}): Promise<BrowserAgentRunResult> {
    const instruction = params.instruction.trim()
    if (!instruction) {
        throw new AgentExecutionError("INVALID_INPUT", "instruction is required.", 400)
    }

    createBrowserSession(params.sessionId)
    appendBrowserLog(params.sessionId, {
        level: "info",
        message: "Planning browser steps from your instruction...",
    })

    try {
        const steps = await planBrowserAutomation(instruction)
        appendBrowserLog(params.sessionId, {
            level: "info",
            message: `Prepared ${steps.length} browser step${steps.length === 1 ? "" : "s"}.`,
        })
        steps.forEach((step, index) => {
            appendBrowserLog(params.sessionId, {
                level: "info",
                message: `Planned step ${index + 1}: ${step.action}${"url" in step ? ` ${step.url}` : "selector" in step ? ` ${step.selector}` : "key" in step ? ` ${step.key}` : ""}`,
            })
        })

        const execution = await executeBrowserPlan({
            steps,
            onLog: (message, level = "info") => {
                appendBrowserLog(params.sessionId, { level, message })
            },
        })
        appendBrowserLog(params.sessionId, {
            level: "info",
            message: "Summarizing the extracted page content against your request...",
        })

        const synthesizedResult = await synthesizeBrowserAnswer({
            instruction,
            rawResult: execution.result,
            finalUrl: execution.finalUrl,
        }).catch(() => normalizeStructuredResult(null, instruction, execution.result))

        return completeBrowserSession(params.sessionId, {
            plannedSteps: steps.map((step) => ({
                action: step.action,
                detail: String(
                    "url" in step ? step.url :
                    "selector" in step ? step.selector :
                    "value" in step ? step.value :
                    "key" in step ? step.key :
                    ""
                ),
            })),
            stepsExecuted: execution.stepsExecuted,
            result: synthesizedResult,
        })
    } catch (error) {
        const message = error instanceof Error ? error.message : "Browser automation failed"
        failBrowserSession(params.sessionId, message)
        throw error
    }
}
