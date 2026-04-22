import { getSupabaseServerClient } from "@/lib/supabaseServer"
import { requireWalletAddress } from "@/lib/services/validation"
import { AgentExecutionError } from "@/lib/agents/shared"

function normalizeError(error: unknown, fallback: string) {
    return error instanceof Error ? error.message : fallback
}

let hasWarnedAboutMissingUsersTable = false

function isMissingUsersTableError(error: unknown) {
    if (!error || typeof error !== "object") return false

    const maybeError = error as { code?: string; message?: string }
    const message = maybeError.message?.toLowerCase() ?? ""

    return (
        maybeError.code === "PGRST205" ||
        maybeError.code === "42P01" ||
        message.includes("could not find the table 'public.users'") ||
        message.includes("relation \"public.users\" does not exist")
    )
}

function createFallbackUser(walletAddress: string, githubConnected = false) {
    return {
        id: null,
        wallet_address: walletAddress,
        github_connected: githubConnected,
        created_at: new Date().toISOString(),
        persisted: false,
    }
}

function warnAboutMissingUsersTable() {
    if (hasWarnedAboutMissingUsersTable) return

    hasWarnedAboutMissingUsersTable = true
    console.warn(
        "[supabase] public.users is missing. Run supabase/schema.sql in your Supabase project to enable user persistence."
    )
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
        if (isMissingUsersTableError(error)) {
            warnAboutMissingUsersTable()
            return createFallbackUser(walletAddress)
        }

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
        if (isMissingUsersTableError(error)) {
            warnAboutMissingUsersTable()
            return createFallbackUser(walletAddress, githubConnected)
        }

        throw new AgentExecutionError("DB_USER_UPDATE_FAILED", normalizeError(error, "Failed to update GitHub status."), 500)
    }

    return data
}
