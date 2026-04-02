import { getSupabaseServerClient } from "@/lib/supabaseServer"
import { requireWalletAddress } from "@/lib/services/validation"
import { AgentExecutionError } from "@/lib/agents/shared"

function normalizeError(error: unknown, fallback: string) {
    return error instanceof Error ? error.message : fallback
}

export async function upsertUserByWallet(walletAddressInput: unknown) {
    const walletAddress = requireWalletAddress(walletAddressInput)
    const supabase = getSupabaseServerClient()

    const { data, error } = await supabase
        .from("users")
        .upsert(
            {
                wallet_address: walletAddress,
            },
            {
                onConflict: "wallet_address",
                ignoreDuplicates: false,
            }
        )
        .select("id, wallet_address, github_connected, created_at")
        .single()

    if (error) {
        throw new AgentExecutionError("DB_USER_UPSERT_FAILED", normalizeError(error, "Failed to upsert user."), 500)
    }

    return data
}

export async function setGitHubConnected(walletAddressInput: unknown, githubConnected: boolean) {
    const walletAddress = requireWalletAddress(walletAddressInput)
    const supabase = getSupabaseServerClient()

    const { data, error } = await supabase
        .from("users")
        .upsert(
            {
                wallet_address: walletAddress,
                github_connected: githubConnected,
            },
            {
                onConflict: "wallet_address",
                ignoreDuplicates: false,
            }
        )
        .select("id, wallet_address, github_connected, created_at")
        .single()

    if (error) {
        throw new AgentExecutionError("DB_USER_UPDATE_FAILED", normalizeError(error, "Failed to update GitHub status."), 500)
    }

    return data
}
