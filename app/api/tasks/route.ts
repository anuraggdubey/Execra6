import { NextResponse } from "next/server"
import { AgentExecutionError } from "@/lib/agents/shared"
import { getRecentTasks, getUserTasks } from "@/lib/services/taskService"

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url)
        const walletAddress = searchParams.get("walletAddress")
        const limit = Number.parseInt(searchParams.get("limit") ?? "10", 10)

        if (walletAddress) {
            const tasks = await getUserTasks(walletAddress, Number.isNaN(limit) ? 10 : limit)
            return NextResponse.json({ success: true, tasks })
        }

        const tasks = await getRecentTasks(Number.isNaN(limit) ? 10 : limit)
        return NextResponse.json({ success: true, tasks })
    } catch (error: unknown) {
        if (error instanceof AgentExecutionError) {
            return NextResponse.json({ error: error.message, code: error.code, details: error.details }, { status: error.status })
        }

        return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to fetch tasks" }, { status: 500 })
    }
}
