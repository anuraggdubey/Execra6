export function previewTool(projectId: string) {
    const baseUrl = process.env.APP_URL ?? "http://localhost:3001"
    return {
        projectId,
        previewUrl: `${baseUrl.replace(/\/$/, "")}/preview/${projectId}/`,
    }
}
