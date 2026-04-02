export { parseAgentOutput, runCodingAgent, type ProjectFiles } from "@/lib/agents/codingAgentService"

export interface AgentStep {
    step: number
    title: string
    detail: string
    status: "pending" | "running" | "done"
}

export const AGENT_STEPS: Omit<AgentStep, "status">[] = [
    { step: 1, title: "Understanding Request", detail: "Analyzing your prompt and project requirements..." },
    { step: 2, title: "Structuring Components", detail: "Breaking down into HTML, CSS, and JavaScript layers..." },
    { step: 3, title: "Generating Code", detail: "Producing clean, production-ready files..." },
    { step: 4, title: "Saving Project", detail: "Writing files through fileTool..." },
    { step: 5, title: "Preparing Preview", detail: "Serving the project through previewTool..." },
]
