import fs from "fs/promises"
import os from "os"
import path from "path"
import archiver from "archiver"

export interface FileToolWriteFile {
    name: string
    content: string
}

function getProjectsRoot() {
    return path.join(os.tmpdir(), "execra-projects")
}

export async function fileTool(projectId: string, files: FileToolWriteFile[]) {
    const projectDir = path.join(getProjectsRoot(), projectId)
    await fs.mkdir(projectDir, { recursive: true })

    await Promise.all(
        files.map((file) =>
            fs.writeFile(path.join(projectDir, file.name), file.content, "utf-8")
        )
    )

    return {
        projectId,
        projectDir,
        files: files.map((file) => file.name),
    }
}

export async function readProjectFile(projectId: string, fileName: string) {
    const projectDir = path.join(getProjectsRoot(), projectId)
    return fs.readFile(path.join(projectDir, fileName), "utf-8")
}

export async function projectExists(projectId: string) {
    try {
        await fs.access(path.join(getProjectsRoot(), projectId))
        return true
    } catch {
        return false
    }
}

export async function zipProject(projectId: string) {
    const projectDir = path.join(getProjectsRoot(), projectId)

    return new Promise<Buffer>((resolve, reject) => {
        const archive = archiver("zip", { zlib: { level: 9 } })
        const chunks: Buffer[] = []

        archive.on("data", (chunk: Buffer) => chunks.push(chunk))
        archive.on("end", () => resolve(Buffer.concat(chunks)))
        archive.on("error", reject)

        archive.directory(projectDir, projectId)
        archive.finalize().catch(reject)
    })
}
