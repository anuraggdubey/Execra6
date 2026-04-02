import { NextResponse } from "next/server"
import archiver from "archiver"
import { getTaskById } from "@/lib/services/taskService"
import type { CodingTaskOutput } from "@/types/tasks"

function isCodingOutput(output: unknown): output is CodingTaskOutput {
    return Boolean(output && typeof output === "object" && "kind" in output)
}

async function zipFiles(files: Array<{ name: string; content: string }>) {
    return new Promise<Buffer>((resolve, reject) => {
        const archive = archiver("zip", { zlib: { level: 9 } })
        const chunks: Buffer[] = []

        archive.on("data", (chunk: Buffer) => chunks.push(chunk))
        archive.on("end", () => resolve(Buffer.concat(chunks)))
        archive.on("error", reject)

        for (const file of files) {
            archive.append(file.content, { name: file.name })
        }

        archive.finalize().catch(reject)
    })
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params

        if (!id || id.includes("..")) {
            return NextResponse.json({ error: "Invalid task ID" }, { status: 400 })
        }

        const task = await getTaskById(id)
        if (task.agent_type !== "coding" || task.status !== "completed" || !isCodingOutput(task.output_result)) {
            return NextResponse.json({ error: "Download not available for this task" }, { status: 404 })
        }

        const files =
            task.output_result.kind === "project"
                ? Object.entries(task.output_result.files).map(([name, content]) => ({ name, content }))
                : [{ name: task.output_result.filename, content: task.output_result.code }]

        const zipBuffer = await zipFiles(files)

        return new Response(new Uint8Array(zipBuffer), {
            headers: {
                "Content-Type": "application/zip",
                "Content-Disposition": `attachment; filename="${id}.zip"`,
                "Content-Length": String(zipBuffer.length),
            },
        })
    } catch (error: unknown) {
        console.error("[download] Error:", error)
        return NextResponse.json({ error: error instanceof Error ? error.message : "Download failed" }, { status: 500 })
    }
}
