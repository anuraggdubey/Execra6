export type AgentType = "github" | "coding" | "document" | "email" | "search" | "browser"

export type TaskStatus = "pending" | "completed" | "failed"
export type OnChainTaskStatus = "uninitialized" | "pending" | "completed" | "cancelled" | "failed"
export type FeeMode = "user" | "sponsored"
export type SettlementMethod = "wallet" | "sep24" | "sep31"
export type ApprovalMode = "single" | "multisig"
export type AuthMode = "wallet" | "smart"
export type CrossBorderStatus = "not_requested" | "pending" | "ready" | "submitted"

export type AnchorConfiguration = {
    anchorName: string | null
    anchorUrl: string | null
    assetCode: string | null
    destination: string | null
}

export type TaskFeatureConfig = {
    feeMode: FeeMode
    settlementMethod: SettlementMethod
    approvalMode: ApprovalMode
    requiredApprovals: number
    approvers: string[]
    authMode: AuthMode
    smartWalletAddress: string | null
    smartWalletPolicy: string | null
    sponsorAddress: string | null
    anchor: AnchorConfiguration
}

export type TaskFeatureState = {
    approvalCount: number
    approvedBy: string[]
    crossBorderStatus: CrossBorderStatus
    crossBorderIntentId: string | null
    crossBorderInstructions: string | null
}

export type CodingTaskOutput =
    | {
        kind: "project"
        files: Record<string, string>
        previewEntry: string
      }
    | {
        kind: "single-file"
        filename: string
        language: string
        code: string
      }

export type TaskOutputResult = CodingTaskOutput | Record<string, unknown> | string | null

export type TaskRecord = {
    id: string
    wallet_address: string
    agent_type: AgentType
    input_prompt: string
    output_result: TaskOutputResult
    status: TaskStatus
    on_chain_task_id: string | null
    reward_stroops: string | null
    contract_id: string | null
    on_chain_status: OnChainTaskStatus
    create_tx_hash: string | null
    complete_tx_hash: string | null
    cancel_tx_hash: string | null
    feature_config: TaskFeatureConfig | null
    feature_state: TaskFeatureState | null
    created_at: string
}
