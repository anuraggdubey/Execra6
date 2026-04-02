export interface Agent {
    id: string
    name: string
    task: string
    reward: number
    earnings: number
    tasksCompleted: number
    status: "idle" | "running"
}