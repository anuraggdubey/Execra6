// Execra Platform
import { AgentExecutionError } from "@/lib/agents/shared"
import {
    AGENT_TYPES,
    ON_CHAIN_TASK_STATUSES,
    TASK_STATUSES,
    type AgentType,
    type OnChainTaskStatus,
    type TaskStatus,
} from "@/types/tasks"

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

const EMAIL_ADDRESS_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function requireEmailAddress(value: unknown, fieldName: string) {
    const email = requireNonEmptyText(value, fieldName).toLowerCase()

    if (!EMAIL_ADDRESS_REGEX.test(email)) {
        throw new AgentExecutionError("INVALID_EMAIL", `${fieldName} must be a valid email address.`, 400)
    }

    return email
}

export function requireAgentType(value: unknown): AgentType {
    const agentType = value as AgentType
    if (typeof value === "string" && AGENT_TYPES.includes(agentType)) {
        return agentType
    }

    throw new AgentExecutionError("INVALID_AGENT_TYPE", "A valid agent type is required.", 400)
}

export function requireTaskStatus(value: unknown): TaskStatus {
    const taskStatus = value as TaskStatus
    if (typeof value === "string" && TASK_STATUSES.includes(taskStatus)) {
        return taskStatus
    }

    throw new AgentExecutionError("INVALID_TASK_STATUS", "A valid task status is required.", 400)
}

export function requireOnChainTaskStatus(value: unknown): OnChainTaskStatus {
    const onChainTaskStatus = value as OnChainTaskStatus
    if (typeof value === "string" && ON_CHAIN_TASK_STATUSES.includes(onChainTaskStatus)) {
        return onChainTaskStatus
    }

    throw new AgentExecutionError("INVALID_ONCHAIN_STATUS", "A valid on-chain task status is required.", 400)
}
