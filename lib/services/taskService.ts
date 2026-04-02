import { AgentExecutionError } from "@/lib/agents/shared"
import { getSupabaseServerClient } from "@/lib/supabaseServer"
import {
    requireAgentType,
    requireOnChainTaskStatus,
    requireTaskStatus,
    requireWalletAddress,
} from "@/lib/services/validation"
import type { OnChainTaskStatus, TaskOutputResult, TaskRecord, TaskStatus } from "@/types/tasks"

type CreateTaskInput = {
    walletAddress: unknown
    agentType: unknown
    inputPrompt: unknown
    status?: unknown
    blockchain?: {
        onChainTaskId?: string | null
        rewardStroops?: string | null
        contractId?: string | null
        onChainStatus?: OnChainTaskStatus
        createTxHash?: string | null
        completeTxHash?: string | null
        cancelTxHash?: string | null
    }
}

type UpdateTaskInput = {
    taskId: string
    outputResult?: TaskOutputResult
    status: unknown
    blockchain?: {
        onChainTaskId?: string | null
        rewardStroops?: string | null
        contractId?: string | null
        onChainStatus?: OnChainTaskStatus
        createTxHash?: string | null
        completeTxHash?: string | null
        cancelTxHash?: string | null
    }
}

function normalizeError(error: unknown, fallback: string) {
    return error instanceof Error ? error.message : fallback
}

export async function createTask(input: CreateTaskInput) {
    const walletAddress = requireWalletAddress(input.walletAddress)
    const agentType = requireAgentType(input.agentType)
    const inputPrompt = typeof input.inputPrompt === "string" ? input.inputPrompt.trim() : ""
    const status = input.status ? requireTaskStatus(input.status) : "pending"
    const supabase = getSupabaseServerClient()

    const { data, error } = await supabase
        .from("tasks")
        .insert({
            wallet_address: walletAddress,
            agent_type: agentType,
            input_prompt: inputPrompt,
            status,
            on_chain_task_id: input.blockchain?.onChainTaskId ?? null,
            reward_stroops: input.blockchain?.rewardStroops ?? null,
            contract_id: input.blockchain?.contractId ?? null,
            on_chain_status: input.blockchain?.onChainStatus ?? "uninitialized",
            create_tx_hash: input.blockchain?.createTxHash ?? null,
            complete_tx_hash: input.blockchain?.completeTxHash ?? null,
            cancel_tx_hash: input.blockchain?.cancelTxHash ?? null,
        })
        .select("id, wallet_address, agent_type, input_prompt, output_result, status, on_chain_task_id, reward_stroops, contract_id, on_chain_status, create_tx_hash, complete_tx_hash, cancel_tx_hash, created_at")
        .single()

    if (error) {
        throw new AgentExecutionError("DB_TASK_CREATE_FAILED", normalizeError(error, "Failed to create task."), 500)
    }

    return data as TaskRecord
}

export async function updateTask(input: UpdateTaskInput) {
    const status = requireTaskStatus(input.status)
    const supabase = getSupabaseServerClient()

    const updates: {
        output_result?: TaskOutputResult
        status: TaskStatus
        on_chain_task_id?: string | null
        reward_stroops?: string | null
        contract_id?: string | null
        on_chain_status?: OnChainTaskStatus
        create_tx_hash?: string | null
        complete_tx_hash?: string | null
        cancel_tx_hash?: string | null
    } = { status }

    if (input.outputResult !== undefined) {
        updates.output_result = input.outputResult
    }

    if (input.blockchain) {
        if ("onChainTaskId" in input.blockchain) updates.on_chain_task_id = input.blockchain.onChainTaskId ?? null
        if ("rewardStroops" in input.blockchain) updates.reward_stroops = input.blockchain.rewardStroops ?? null
        if ("contractId" in input.blockchain) updates.contract_id = input.blockchain.contractId ?? null
        if ("onChainStatus" in input.blockchain && input.blockchain.onChainStatus !== undefined) {
            updates.on_chain_status = requireOnChainTaskStatus(input.blockchain.onChainStatus)
        }
        if ("createTxHash" in input.blockchain) updates.create_tx_hash = input.blockchain.createTxHash ?? null
        if ("completeTxHash" in input.blockchain) updates.complete_tx_hash = input.blockchain.completeTxHash ?? null
        if ("cancelTxHash" in input.blockchain) updates.cancel_tx_hash = input.blockchain.cancelTxHash ?? null
    }

    const { data, error } = await supabase
        .from("tasks")
        .update(updates)
        .eq("id", input.taskId)
        .select("id, wallet_address, agent_type, input_prompt, output_result, status, on_chain_task_id, reward_stroops, contract_id, on_chain_status, create_tx_hash, complete_tx_hash, cancel_tx_hash, created_at")
        .single()

    if (error) {
        throw new AgentExecutionError("DB_TASK_UPDATE_FAILED", normalizeError(error, "Failed to update task."), 500)
    }

    return data as TaskRecord
}

export async function failTask(taskId: string, message: string) {
    return updateTask({
        taskId,
        status: "failed",
        outputResult: { error: message },
    })
}

export async function createAgentRun(taskId: string, executionLogs: unknown, duration: number) {
    const supabase = getSupabaseServerClient()

    const { data, error } = await supabase
        .from("agent_runs")
        .insert({
            task_id: taskId,
            execution_logs: executionLogs,
            duration,
        })
        .select("id, task_id, created_at")
        .single()

    if (error) {
        throw new AgentExecutionError("DB_AGENT_RUN_CREATE_FAILED", normalizeError(error, "Failed to create agent run."), 500)
    }

    return data
}

export async function getUserTasks(walletAddressInput: unknown, limit = 20) {
    const walletAddress = requireWalletAddress(walletAddressInput)
    const supabase = getSupabaseServerClient()

    const { data, error } = await supabase
        .from("tasks")
        .select("id, wallet_address, agent_type, input_prompt, output_result, status, on_chain_task_id, reward_stroops, contract_id, on_chain_status, create_tx_hash, complete_tx_hash, cancel_tx_hash, created_at")
        .eq("wallet_address", walletAddress)
        .order("created_at", { ascending: false })
        .limit(limit)

    if (error) {
        throw new AgentExecutionError("DB_TASK_FETCH_FAILED", normalizeError(error, "Failed to fetch tasks."), 500)
    }

    return (data ?? []) as TaskRecord[]
}

export async function getRecentTasks(limit = 10) {
    const supabase = getSupabaseServerClient()

    const { data, error } = await supabase
        .from("tasks")
        .select("id, wallet_address, agent_type, input_prompt, output_result, status, on_chain_task_id, reward_stroops, contract_id, on_chain_status, create_tx_hash, complete_tx_hash, cancel_tx_hash, created_at")
        .order("created_at", { ascending: false })
        .limit(limit)

    if (error) {
        throw new AgentExecutionError("DB_RECENT_TASK_FETCH_FAILED", normalizeError(error, "Failed to fetch recent tasks."), 500)
    }

    return (data ?? []) as TaskRecord[]
}

export async function getTaskById(taskId: string) {
    const supabase = getSupabaseServerClient()

    const { data, error } = await supabase
        .from("tasks")
        .select("id, wallet_address, agent_type, input_prompt, output_result, status, on_chain_task_id, reward_stroops, contract_id, on_chain_status, create_tx_hash, complete_tx_hash, cancel_tx_hash, created_at")
        .eq("id", taskId)
        .single()

    if (error) {
        throw new AgentExecutionError("DB_TASK_LOOKUP_FAILED", normalizeError(error, "Failed to fetch task."), 404)
    }

    return data as TaskRecord
}
