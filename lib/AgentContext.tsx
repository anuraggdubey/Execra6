"use client"

import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useState,
    type ReactNode,
} from "react"
import { v4 as uuidv4 } from "uuid"
import { Agent } from "@/types/agent"

export interface ActivityLog {
    id: string
    type: "system" | "execution" | "transfer"
    agent: string
    message: string
    reward: number | null
    time: string
    status: "success" | "info" | "error" | "warning"
}

interface AgentContextType {
    agents: Agent[]
    activities: ActivityLog[]
    startAgentRun: (agentId: string, detail: string) => void
    completeAgentRun: (agentId: string, detail: string, reward?: number) => void
    failAgentRun: (agentId: string, detail: string) => void
    logAgentEvent: (
        agentId: string,
        detail: string,
        options?: {
            status?: ActivityLog["status"]
            type?: ActivityLog["type"]
            reward?: number | null
        }
    ) => void
}

const STORAGE_KEYS = {
    agents: "execra_platform_agents_v3",
    activities: "execra_platform_activities_v3",
}

const LEGACY_AGENT_KEYS = [
    "workinggent_platform_agents_v3",
    "workinggent_platform_agents_v2",
    "agentforge_platform_agents_v2",
]

const LEGACY_ACTIVITY_KEYS = [
    "workinggent_platform_activities_v3",
    "workinggent_platform_activities_v2",
    "agentforge_platform_activities_v2",
]

const PLATFORM_AGENTS: Agent[] = [
    {
        id: "github",
        name: "GitHub Agent",
        task: "Connects to GitHub, indexes repository context, and analyzes real code.",
        reward: 5,
        earnings: 0,
        tasksCompleted: 0,
        status: "idle",
    },
    {
        id: "coding",
        name: "Coding Agent",
        task: "Generates implementation-ready project files and previewable build outputs.",
        reward: 4,
        earnings: 0,
        tasksCompleted: 0,
        status: "idle",
    },
    {
        id: "document",
        name: "Document Agent",
        task: "Uploads documents, parses supported files, and returns concise structured analysis.",
        reward: 3,
        earnings: 0,
        tasksCompleted: 0,
        status: "idle",
    },
    {
        id: "email",
        name: "Email Agent",
        task: "Generates escrow-gated email drafts and sends them through the configured SMTP mailbox.",
        reward: 2,
        earnings: 0,
        tasksCompleted: 0,
        status: "idle",
    },
    {
        id: "search",
        name: "Web Search Agent",
        task: "Verifies escrow on-chain, runs web search, and returns summarized source-backed results with optional videos.",
        reward: 2,
        earnings: 0,
        tasksCompleted: 0,
        status: "idle",
    },
]

const AgentContext = createContext<AgentContextType | undefined>(undefined)

function getNow() {
    return new Date().toLocaleTimeString("en-US", { hour12: false })
}

function readStorage<T>(key: string, fallback: T, legacyKeys: string[] = []): T {
    if (typeof window === "undefined") return fallback

    try {
        const raw =
            window.localStorage.getItem(key) ??
            legacyKeys.map((legacyKey) => window.localStorage.getItem(legacyKey)).find(Boolean) ??
            null

        return raw ? (JSON.parse(raw) as T) : fallback
    } catch {
        return fallback
    }
}

function normalizeAgents(input: Agent[]): Agent[] {
    const byId = new Map(input.map((agent) => [agent.id, agent]))

    return PLATFORM_AGENTS.map((baseAgent) => {
        const saved = byId.get(baseAgent.id)
        if (!saved) return baseAgent

        return {
            ...baseAgent,
            reward: Number(saved.reward) || baseAgent.reward,
            task: saved.task || baseAgent.task,
            earnings: Number(saved.earnings) || 0,
            tasksCompleted: Number(saved.tasksCompleted) || 0,
            status: saved.status === "running" ? "running" : "idle",
        }
    })
}

function createActivity(
    agentName: string,
    message: string,
    type: ActivityLog["type"],
    status: ActivityLog["status"],
    reward: number | null = null
): ActivityLog {
    return {
        id: uuidv4(),
        agent: agentName,
        message,
        type,
        reward,
        status,
        time: getNow(),
    }
}

export function AgentProvider({ children }: { children: ReactNode }) {
    const [agents, setAgents] = useState<Agent[]>(() =>
        normalizeAgents(readStorage(STORAGE_KEYS.agents, PLATFORM_AGENTS, LEGACY_AGENT_KEYS))
    )
    const [activities, setActivities] = useState<ActivityLog[]>(() =>
        readStorage<ActivityLog[]>(STORAGE_KEYS.activities, [], LEGACY_ACTIVITY_KEYS)
    )

    useEffect(() => {
        if (typeof window === "undefined") return
        window.localStorage.setItem(STORAGE_KEYS.agents, JSON.stringify(agents))
    }, [agents])

    useEffect(() => {
        if (typeof window === "undefined") return
        window.localStorage.setItem(STORAGE_KEYS.activities, JSON.stringify(activities))
    }, [activities])

    const findAgent = useCallback(
        (agentIdOrName: string) =>
            agents.find(
                (agent) =>
                    agent.id === agentIdOrName ||
                    agent.name.toLowerCase() === agentIdOrName.toLowerCase()
            ),
        [agents]
    )

    const appendActivity = useCallback((entry: ActivityLog) => {
        setActivities((prev) => [entry, ...prev].slice(0, 80))
    }, [])

    const logAgentEvent: AgentContextType["logAgentEvent"] = useCallback(
        (agentId, detail, options) => {
            const agent = findAgent(agentId)
            appendActivity(
                createActivity(
                    agent?.name ?? agentId,
                    detail,
                    options?.type ?? "system",
                    options?.status ?? "info",
                    options?.reward ?? null
                )
            )
        },
        [appendActivity, findAgent]
    )

    const startAgentRun: AgentContextType["startAgentRun"] = useCallback(
        (agentId, detail) => {
            const agent = findAgent(agentId)
            if (!agent) return

            setAgents((prev) =>
                prev.map((entry) =>
                    entry.id === agent.id ? { ...entry, status: "running" } : entry
                )
            )
            appendActivity(createActivity(agent.name, detail, "execution", "info"))
        },
        [appendActivity, findAgent]
    )

    const completeAgentRun: AgentContextType["completeAgentRun"] = useCallback(
        (agentId, detail, reward) => {
            const agent = findAgent(agentId)
            if (!agent) return

            const score = reward ?? agent.reward

            setAgents((prev) =>
                prev.map((entry) =>
                    entry.id === agent.id
                        ? {
                            ...entry,
                            status: "idle",
                            earnings: entry.earnings + score,
                            tasksCompleted: entry.tasksCompleted + 1,
                        }
                        : entry
                )
            )

            appendActivity(createActivity(agent.name, detail, "execution", "success", score))
        },
        [appendActivity, findAgent]
    )

    const failAgentRun: AgentContextType["failAgentRun"] = useCallback(
        (agentId, detail) => {
            const agent = findAgent(agentId)
            if (!agent) return

            setAgents((prev) =>
                prev.map((entry) =>
                    entry.id === agent.id ? { ...entry, status: "idle" } : entry
                )
            )
            appendActivity(createActivity(agent.name, detail, "execution", "error"))
        },
        [appendActivity, findAgent]
    )

    return (
        <AgentContext.Provider
            value={{
                agents,
                activities,
                startAgentRun,
                completeAgentRun,
                failAgentRun,
                logAgentEvent,
            }}
        >
            {children}
        </AgentContext.Provider>
    )
}

export function useAgentContext() {
    const context = useContext(AgentContext)
    if (context === undefined) {
        throw new Error("useAgentContext must be used within an AgentProvider")
    }
    return context
}
