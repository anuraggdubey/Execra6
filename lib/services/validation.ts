import { AgentExecutionError } from "@/lib/agents/shared"
import type { AgentType, OnChainTaskStatus, TaskStatus } from "@/types/tasks"

const WALLET_ADDRESS_REGEX = /^[A-Z2-7]{32,70}$/i

export function requireWalletAddress(walletAddress: unknown) {
    if (typeof walletAddress !== "string" || !WALLET_ADDRESS_REGEX.test(walletAddress.trim())) {
        throw new AgentExecutionError("INVALID_WALLET", "A valid wallet address is required.", 400)
    }

    return walletAddress.trim()
}

export function requireNonEmptyText(value: unknown, fieldName: string) {
    if (typeof value !== "string" || !value.trim()) {
        throw new AgentExecutionError("INVALID_INPUT", `${fieldName} is required.`, 400)
    }

    return value.trim()
}

export function requireAgentType(value: unknown): AgentType {
    if (value === "github" || value === "coding" || value === "document") {
        return value
    }

    throw new AgentExecutionError("INVALID_AGENT_TYPE", "A valid agent type is required.", 400)
}

export function requireTaskStatus(value: unknown): TaskStatus {
    if (value === "pending" || value === "completed" || value === "failed") {
        return value
    }

    throw new AgentExecutionError("INVALID_TASK_STATUS", "A valid task status is required.", 400)
}

export function requireOnChainTaskStatus(value: unknown): OnChainTaskStatus {
    if (
        value === "uninitialized" ||
        value === "pending" ||
        value === "completed" ||
        value === "cancelled" ||
        value === "failed"
    ) {
        return value
    }

    throw new AgentExecutionError("INVALID_ONCHAIN_STATUS", "A valid on-chain task status is required.", 400)
}
