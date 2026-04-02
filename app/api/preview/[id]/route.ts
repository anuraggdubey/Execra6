import { NextResponse } from "next/server"
import { previewTool } from "@/lib/tools/previewTool"

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params

        if (!id || id.includes("..")) {
            return NextResponse.json({ error: "Invalid project ID" }, { status: 400 })
        }

        return NextResponse.redirect(previewTool(id).previewUrl)
    } catch (error: unknown) {
        console.error("[preview] Error:", error)
        return NextResponse.json({ error: error instanceof Error ? error.message : "Preview failed" }, { status: 500 })
    }
}
