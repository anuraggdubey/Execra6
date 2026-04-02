import { NextResponse } from "next/server"
import { getTaskById } from "@/lib/services/taskService"
import type { CodingTaskOutput } from "@/types/tasks"

function getContentType(fileName: string) {
    if (fileName.endsWith(".css")) return "text/css; charset=utf-8"
    if (fileName.endsWith(".js")) return "application/javascript; charset=utf-8"
    return "text/html; charset=utf-8"
}

function isCodingProjectOutput(output: unknown): output is Extract<CodingTaskOutput, { kind: "project" }> {
    return Boolean(
        output &&
        typeof output === "object" &&
        "kind" in output &&
        (output as { kind?: string }).kind === "project" &&
        "files" in output
    )
}

export async function GET(
    req: Request,
    { params }: { params: Promise<{ id: string; asset?: string[] }> }
) {
    try {
        const { id, asset } = await params

        if (!id || id.includes("..")) {
            return NextResponse.json({ error: "Invalid task ID" }, { status: 400 })
        }

        const task = await getTaskById(id)
        if (task.agent_type !== "coding" || task.status !== "completed" || !isCodingProjectOutput(task.output_result)) {
            return NextResponse.json({ error: "Preview not available for this task" }, { status: 404 })
        }

        const assetPath = asset?.length ? asset.join("/") : task.output_result.previewEntry
        const fileContent = task.output_result.files[assetPath as keyof typeof task.output_result.files]

        if (!fileContent) {
            return NextResponse.json({ error: "Preview asset not found" }, { status: 404 })
        }

        // When serving the HTML entry, inline CSS and JS so relative-path
        // resolution (which breaks when Next.js strips trailing slashes) is
        // no longer required.
        if (assetPath === task.output_result.previewEntry) {
            const files = task.output_result.files as Record<string, string>
            let html = fileContent

            const cssContent = files["style.css"] ?? files["styles.css"] ?? ""
            if (cssContent) {
                html = html
                    .replace(/<link[^>]+href=["'][^"']*style[s]?\.css["'][^>]*\/?>/gi, "")
                    .replace(/<\/head>/i, `<style>${cssContent}</style>\n</head>`)
            }

            const jsContent = files["script.js"] ?? files["main.js"] ?? ""
            if (jsContent) {
                html = html
                    .replace(/<script[^>]+src=["'][^"']*script\.js["'][^>]*><\/script>/gi, "")
                    .replace(/<script[^>]+src=["'][^"']*main\.js["'][^>]*><\/script>/gi, "")
                    .replace(/<\/body>/i, `<script>${jsContent}</script>\n</body>`)
            }

            // Strip the <base> tag that is no longer needed
            html = html.replace(/<base[^>]*\/?>/gi, "")

            return new Response(html, {
                headers: {
                    "Content-Type": "text/html; charset=utf-8",
                    "Cache-Control": "no-store",
                    "X-Frame-Options": "SAMEORIGIN",
                },
            })
        }

        return new Response(fileContent, {
            headers: {
                "Content-Type": getContentType(assetPath),
                "Cache-Control": "no-store",
                "X-Frame-Options": "SAMEORIGIN",
            },
        })
    } catch (error: unknown) {
        return NextResponse.json({ error: error instanceof Error ? error.message : "Preview failed" }, { status: 500 })
    }
}
