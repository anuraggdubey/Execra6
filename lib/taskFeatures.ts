import type {
    AnchorConfiguration,
    ApprovalMode,
    AuthMode,
    CrossBorderStatus,
    FeeMode,
    SettlementMethod,
    TaskFeatureConfig,
    TaskFeatureState,
} from "@/types/tasks"

const WALLET_ADDRESS_REGEX = /^[A-Z2-7]{32,70}$/i

export const TASK_FEATURES_STORAGE_KEY = "execra_task_features_v1"

export const DEFAULT_ANCHOR_CONFIGURATION: AnchorConfiguration = {
    anchorName: null,
    anchorUrl: null,
    assetCode: "USDC",
    destination: null,
}

export const DEFAULT_TASK_FEATURE_CONFIG: TaskFeatureConfig = {
    feeMode: "user",
    settlementMethod: "wallet",
    approvalMode: "single",
    requiredApprovals: 1,
    approvers: [],
    authMode: "wallet",
    smartWalletAddress: null,
    smartWalletPolicy: "delegate",
    sponsorAddress: null,
    anchor: DEFAULT_ANCHOR_CONFIGURATION,
}

export const DEFAULT_TASK_FEATURE_STATE: TaskFeatureState = {
    approvalCount: 0,
    approvedBy: [],
    crossBorderStatus: "not_requested",
    crossBorderIntentId: null,
    crossBorderInstructions: null,
}

function isWalletAddress(value: unknown): value is string {
    return typeof value === "string" && WALLET_ADDRESS_REGEX.test(value.trim())
}

function normalizeFeeMode(value: unknown): FeeMode {
    return value === "sponsored" ? "sponsored" : "user"
}

function normalizeSettlementMethod(value: unknown): SettlementMethod {
    return value === "sep24" || value === "sep31" ? value : "wallet"
}

function normalizeApprovalMode(value: unknown): ApprovalMode {
    return value === "multisig" ? "multisig" : "single"
}

function normalizeAuthMode(value: unknown): AuthMode {
    return value === "smart" ? "smart" : "wallet"
}

function normalizeCrossBorderStatus(value: unknown): CrossBorderStatus {
    if (value === "pending" || value === "ready" || value === "submitted") {
        return value
    }

    return "not_requested"
}

function normalizeText(value: unknown) {
    if (typeof value !== "string") return null
    const trimmed = value.trim()
    return trimmed ? trimmed : null
}

function normalizeApprovers(value: unknown) {
    if (!Array.isArray(value)) return [] as string[]

    return value
        .filter(isWalletAddress)
        .map((entry) => entry.trim().toUpperCase())
        .filter((entry, index, all) => all.indexOf(entry) === index)
        .slice(0, 3)
}

export function normalizeTaskFeatureConfig(value: unknown): TaskFeatureConfig {
    const input = value && typeof value === "object" ? value as Partial<TaskFeatureConfig> : {}
    const approvalMode = normalizeApprovalMode(input.approvalMode)
    const approvers = normalizeApprovers(input.approvers)
    const requiredApprovals = approvalMode === "multisig"
        ? Math.min(Math.max(Number(input.requiredApprovals) || approvers.length || 2, 2), Math.max(approvers.length, 2))
        : 1
    const authMode = normalizeAuthMode(input.authMode)

    return {
        feeMode: normalizeFeeMode(input.feeMode),
        settlementMethod: normalizeSettlementMethod(input.settlementMethod),
        approvalMode,
        requiredApprovals,
        approvers,
        authMode,
        smartWalletAddress: authMode === "smart" && isWalletAddress(input.smartWalletAddress) ? input.smartWalletAddress.trim().toUpperCase() : null,
        smartWalletPolicy: normalizeText(input.smartWalletPolicy) ?? "delegate",
        sponsorAddress: isWalletAddress(input.sponsorAddress) ? input.sponsorAddress.trim().toUpperCase() : null,
        anchor: {
            anchorName: normalizeText(input.anchor?.anchorName),
            anchorUrl: normalizeText(input.anchor?.anchorUrl),
            assetCode: normalizeText(input.anchor?.assetCode) ?? "USDC",
            destination: normalizeText(input.anchor?.destination),
        },
    }
}

export function normalizeTaskFeatureState(value: unknown): TaskFeatureState {
    const input = value && typeof value === "object" ? value as Partial<TaskFeatureState> : {}
    const approvedBy = Array.isArray(input.approvedBy)
        ? input.approvedBy.filter(isWalletAddress).map((entry) => entry.trim().toUpperCase())
        : []

    return {
        approvalCount: Math.max(Number(input.approvalCount) || approvedBy.length, 0),
        approvedBy,
        crossBorderStatus: normalizeCrossBorderStatus(input.crossBorderStatus),
        crossBorderIntentId: normalizeText(input.crossBorderIntentId),
        crossBorderInstructions: normalizeText(input.crossBorderInstructions),
    }
}

export function buildInitialTaskFeatureState(config: TaskFeatureConfig): TaskFeatureState {
    return {
        ...DEFAULT_TASK_FEATURE_STATE,
        crossBorderStatus: config.settlementMethod === "wallet" ? "not_requested" : "pending",
    }
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
