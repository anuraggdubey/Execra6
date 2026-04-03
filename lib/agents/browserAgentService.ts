import { AgentExecutionError } from "@/lib/agents/shared"
import { planBrowserAutomation } from "@/lib/services/automationPlanner"
import { executeBrowserPlan } from "@/lib/services/browserService"
import {
    appendBrowserLog,
    completeBrowserSession,
    createBrowserSession,
    failBrowserSession,
    type BrowserAgentRunResult,
} from "@/lib/services/browserSessionStore"

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

        return completeBrowserSession(params.sessionId, {
            plannedSteps: steps.map((step) => ({
                action: step.action,
                detail: String(
                    "url" in step ? step.url :
                    "selector" in step ? step.selector :
                    "value" in step ? step.value :
                    "key" in step ? step.key :
                    "label" in step && step.label ? step.label :
                    "name" in step && step.name ? step.name :
                    ""
                ),
            })),
            stepsExecuted: execution.stepsExecuted,
            result: execution.result,
        })
    } catch (error) {
        const message = error instanceof Error ? error.message : "Browser automation failed"
        failBrowserSession(params.sessionId, message)
        throw error
    }
}
