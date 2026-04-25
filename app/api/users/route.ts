import { NextResponse } from "next/server"
import { AgentExecutionError } from "@/lib/agents/shared"
import { getUserCount, upsertUserByWallet } from "@/lib/services/userService"

export async function GET() {
    try {
        const count = await getUserCount()
        return NextResponse.json({ success: true, count })
    } catch (error: unknown) {
        if (error instanceof AgentExecutionError) {
            return NextResponse.json({ error: error.message, code: error.code, details: error.details }, { status: error.status })
        }

        return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to fetch users" }, { status: 500 })
    }
}

export async function POST(req: Request) {
    try {
        const { walletAddress } = await req.json()
        const user = await upsertUserByWallet(walletAddress)
        return NextResponse.json({ success: true, user })
    } catch (error: unknown) {
        if (error instanceof AgentExecutionError) {
            return NextResponse.json({ error: error.message, code: error.code, details: error.details }, { status: error.status })
        }

        return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to upsert user" }, { status: 500 })
    }
}
