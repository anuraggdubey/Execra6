import type { FeeMode, TaskFeatureConfig, TaskFeatureState } from "@/types/tasks"

const WALLET_ADDRESS_REGEX = /^[A-Z2-7]{32,70}$/i

export const TASK_FEATURES_STORAGE_KEY = "execra_task_features_v1"

export const DEFAULT_TASK_FEATURE_CONFIG: TaskFeatureConfig = {
    feeMode: "user",
    sponsorAddress: null,
}

export const DEFAULT_TASK_FEATURE_STATE: TaskFeatureState = {}

function isWalletAddress(value: unknown): value is string {
    return typeof value === "string" && WALLET_ADDRESS_REGEX.test(value.trim())
}

function normalizeFeeMode(value: unknown): FeeMode {
    return value === "sponsored" ? "sponsored" : "user"
}

export function normalizeTaskFeatureConfig(value: unknown): TaskFeatureConfig {
    const input = value && typeof value === "object" ? value as Partial<TaskFeatureConfig> : {}

    return {
        feeMode: normalizeFeeMode(input.feeMode),
        sponsorAddress: isWalletAddress(input.sponsorAddress) ? input.sponsorAddress.trim().toUpperCase() : null,
    }
}

export function normalizeTaskFeatureState(value: unknown): TaskFeatureState {
    void value
    return DEFAULT_TASK_FEATURE_STATE
}

export function buildInitialTaskFeatureState(config: TaskFeatureConfig): TaskFeatureState {
    void config
    return DEFAULT_TASK_FEATURE_STATE
}

export function readStoredTaskFeatureConfig() {
    if (typeof window === "undefined") {
        return DEFAULT_TASK_FEATURE_CONFIG
    }

    try {
        const raw = window.localStorage.getItem(TASK_FEATURES_STORAGE_KEY)
        if (!raw) return DEFAULT_TASK_FEATURE_CONFIG
        return normalizeTaskFeatureConfig(JSON.parse(raw))
    } catch {
        return DEFAULT_TASK_FEATURE_CONFIG
    }
}

export function writeStoredTaskFeatureConfig(config: TaskFeatureConfig) {
    if (typeof window === "undefined") return
    window.localStorage.setItem(TASK_FEATURES_STORAGE_KEY, JSON.stringify(config))
}

export function isValidWalletAddress(value: unknown) {
    return isWalletAddress(value)
}
