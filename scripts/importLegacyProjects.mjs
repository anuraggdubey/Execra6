import fs from "fs/promises"
import path from "path"
import { createClient } from "@supabase/supabase-js"

const ROOT_DIR = process.cwd()
const ENV_PATH = path.join(ROOT_DIR, ".env.local")
const PROJECTS_DIR = path.join(ROOT_DIR, "projects")

function parseEnv(content) {
    const entries = {}

    for (const line of content.split(/\r?\n/)) {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith("#")) continue

        const separatorIndex = trimmed.indexOf("=")
        if (separatorIndex === -1) continue

        const key = trimmed.slice(0, separatorIndex).trim()
        const value = trimmed.slice(separatorIndex + 1).trim()
        entries[key] = value
    }

    return entries
}

function inferLanguage(fileName) {
    const extension = path.extname(fileName).toLowerCase()

    return (
        {
            ".ts": "typescript",
            ".tsx": "react",
            ".js": "javascript",
            ".jsx": "react",
            ".py": "python",
            ".go": "go",
            ".rs": "rust",
            ".java": "java",
            ".php": "php",
            ".rb": "ruby",
            ".swift": "swift",
            ".cpp": "cpp",
            ".c": "c",
            ".html": "html",
            ".css": "css",
        }[extension] ?? "text"
    )
}

function buildCreatedAt(projectName) {
    const match = projectName.match(/project-(\d{10,})/)
    if (!match) return new Date().toISOString()

    const timestamp = Number.parseInt(match[1], 10)
    if (Number.isNaN(timestamp)) return new Date().toISOString()

    return new Date(timestamp).toISOString()
}

async function readProjectOutput(projectDir) {
    const entries = await fs.readdir(projectDir, { withFileTypes: true })
    const files = entries.filter((entry) => entry.isFile()).map((entry) => entry.name)

    const hasHtmlBundle =
        files.includes("index.html") &&
        files.includes("style.css") &&
        files.includes("script.js")

    if (hasHtmlBundle) {
        const [html, css, js] = await Promise.all([
            fs.readFile(path.join(projectDir, "index.html"), "utf-8"),
            fs.readFile(path.join(projectDir, "style.css"), "utf-8"),
            fs.readFile(path.join(projectDir, "script.js"), "utf-8"),
        ])

        return {
            kind: "project",
            files: {
                "index.html": html,
                "style.css": css,
                "script.js": js,
            },
            previewEntry: "index.html",
        }
    }

    const primaryFile = files[0]
    if (!primaryFile) return null

    const code = await fs.readFile(path.join(projectDir, primaryFile), "utf-8")
    return {
        kind: "single-file",
        filename: primaryFile,
        language: inferLanguage(primaryFile),
        code,
    }
}

async function main() {
    const env = parseEnv(await fs.readFile(ENV_PATH, "utf-8"))
    const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY
    const walletAddress = env.LEGACY_IMPORT_WALLET_ADDRESS || "legacy-local-import"

    if (!supabaseUrl || !serviceRoleKey) {
        throw new Error("Supabase environment variables are missing from .env.local")
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
    })

    const { error: userError } = await supabase
        .from("users")
        .upsert(
            {
                wallet_address: walletAddress,
                github_connected: false,
            },
            { onConflict: "wallet_address", ignoreDuplicates: false }
        )

    if (userError) {
        throw new Error(`Failed to upsert legacy import user: ${userError.message}`)
    }

    const projectEntries = (await fs.readdir(PROJECTS_DIR, { withFileTypes: true }))
        .filter((entry) => entry.isDirectory() && entry.name.startsWith("project-"))

    let importedCount = 0

    for (const entry of projectEntries) {
        const projectDir = path.join(PROJECTS_DIR, entry.name)
        const outputResult = await readProjectOutput(projectDir)

        if (!outputResult) {
            console.warn(`Skipping ${entry.name}: no readable files found`)
            continue
        }

        const createdAt = buildCreatedAt(entry.name)
        const { error } = await supabase.from("tasks").insert({
            wallet_address: walletAddress,
            agent_type: "coding",
            input_prompt: `Imported legacy coding agent output from ${entry.name}`,
            output_result: {
                source_project_id: entry.name,
                imported_from_local_projects: true,
                ...outputResult,
            },
            status: "completed",
            created_at: createdAt,
        })

        if (error) {
            throw new Error(`Failed to import ${entry.name}: ${error.message}`)
        }

        importedCount += 1
        console.log(`Imported ${entry.name}`)
    }

    console.log(`Legacy project import complete. Imported ${importedCount} project(s) under wallet "${walletAddress}".`)
}

main().catch((error) => {
    console.error(error)
    process.exitCode = 1
})
