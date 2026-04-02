import OpenAI from "openai"
import { AgentExecutionError, createLlmError } from "@/lib/agents/shared"

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"
const DEFAULT_MODEL = process.env.OPENROUTER_MODEL ?? "openai/gpt-4o-mini"
const FALLBACK_MODELS = [
    DEFAULT_MODEL,
    "openai/gpt-4o-mini",
    "openai/gpt-4o-mini-2024-07-18",
    "google/gemma-3-27b-it:free",
    "mistralai/mistral-small-3.1-24b-instruct:free",
]

function getApiKey() {
    const apiKey = process.env.OPENROUTER_API_KEY ?? process.env.OPENAI_API_KEY

    if (!apiKey) {
        throw new Error("OpenRouter API key is not configured")
    }

    return apiKey
}

export function getOpenRouterClient() {
    return new OpenAI({
        apiKey: getApiKey(),
        baseURL: OPENROUTER_BASE_URL,
        defaultHeaders: {
            "HTTP-Referer": process.env.APP_URL ?? "http://localhost:3001",
            "X-Title": "Execra",
        },
    })
}

export async function completeWithOpenRouter(options: {
    system: string
    user: string
    model?: string
    maxTokens?: number
    temperature?: number
}) {
    const client = getOpenRouterClient()
    const models = options.model ? [options.model] : FALLBACK_MODELS
    let lastError: unknown

    for (const model of models) {
        try {
            const completion = await client.chat.completions.create({
                model,
                messages: [
                    { role: "system", content: options.system },
                    { role: "user", content: options.user },
                ],
                max_tokens: options.maxTokens ?? 1500,
                temperature: options.temperature ?? 0.4,
            })

            const content = completion.choices[0]?.message?.content?.trim()
            if (!content) {
                throw new AgentExecutionError("LLM_EMPTY", "LLM returned an empty response", 502)
            }

            return content
        } catch (error) {
            lastError = error
            if (!isRetryableProviderError(error) || model === models[models.length - 1]) {
                break
            }
        }
    }

    throw createLlmError(
        lastError,
        "OpenRouter request failed after exhausting fallback models"
    )
}

export { DEFAULT_MODEL }

function isRetryableProviderError(error: unknown) {
    if (!(error instanceof Error)) return false
    const message = error.message.toLowerCase()
    return (
        message.includes("429") ||
        message.includes("rate limit") ||
        message.includes("provider returned error")
    )
}
