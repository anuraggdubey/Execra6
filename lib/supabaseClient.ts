"use client"

import { createClient } from "@supabase/supabase-js"

let browserClient: ReturnType<typeof createClient> | null = null

export function getSupabaseBrowserClient() {
    if (browserClient) return browserClient

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!url || !anonKey) {
        throw new Error("Supabase browser environment variables are not configured")
    }

    browserClient = createClient(url, anonKey)
    return browserClient
}
