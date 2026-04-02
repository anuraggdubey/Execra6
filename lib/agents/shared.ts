export class AgentExecutionError extends Error {
    code: string
    status: number
    details?: unknown

    constructor(code: string, message: string, status = 500, details?: unknown) {
        super(message)
        this.name = "AgentExecutionError"
        this.code = code
        this.status = status
        this.details = details
    }
}

export function createToolError(tool: string, error: unknown, fallbackMessage: string) {
    const message = error instanceof Error ? error.message : fallbackMessage
    return new AgentExecutionError(
        "TOOL_FAILURE",
        `${tool} failed: ${message}`,
        502,
        { tool }
    )
}

export function createLlmError(error: unknown, fallbackMessage = "LLM request failed") {
    const message = error instanceof Error ? error.message : fallbackMessage
    const normalized = message.toLowerCase()
    const status = normalized.includes("429") || normalized.includes("rate limit")
        ? 429
        : 502

    return new AgentExecutionError(
        "LLM_FAILURE",
        message,
        status
    )
}
