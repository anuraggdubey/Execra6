// Execra Platform
import type { AgentType, TaskFeatureState } from "@/types/tasks"

const TASK_ID_SUFFIX_LENGTH = 4

function normalizeProofValue(value: unknown): unknown {
    if (value === null) return null
    if (value === undefined) return null
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value
    if (typeof value === "bigint") return value.toString()

    if (Array.isArray(value)) {
        return value.map((item) => normalizeProofValue(item))
    }

    if (value && typeof value === "object") {
        const entries = Object.entries(value as Record<string, unknown>)
            .filter(([, entryValue]) => entryValue !== undefined)
            .sort(([left], [right]) => left.localeCompare(right))

        return Object.fromEntries(entries.map(([key, entryValue]) => [key, normalizeProofValue(entryValue)]))
    }

    return String(value)
}

export function serializeTaskOutputForProof(output: unknown) {
    return JSON.stringify(normalizeProofValue(output))
}

export function buildOnChainTaskId(agentType: AgentType) {
    const prefix = agentType.slice(0, 3).toLowerCase()
    const timestamp = Date.now().toString(36)
    const entropy = Math.random().toString(36).slice(2, 2 + TASK_ID_SUFFIX_LENGTH)
    return `${prefix}${timestamp}${entropy}`.slice(0, 32)
}

export function mapAgentTypeToAgentId(agentType: AgentType) {
    if (agentType === "search") return "websearch_agent"
    return `${agentType}_agent`
}

export function hexToBytes(hex: string) {
    const normalized = hex.trim().toLowerCase()
    if (!/^[0-9a-f]{64}$/.test(normalized)) {
        throw new Error("Proof hash must be a 32-byte hex string.")
    }

    return Uint8Array.from(normalized.match(/.{2}/g)!.map((byte) => Number.parseInt(byte, 16)))
}

export function withProofFeatureState(
    featureState: TaskFeatureState,
    proof: {
        proofHashHex: string
        proofTxHash: string
    }
): TaskFeatureState {
    return {
        ...featureState,
        proofHashHex: proof.proofHashHex,
        proofTxHash: proof.proofTxHash,
    }
}
