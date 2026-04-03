"use client"

import { useEffect, useMemo, useState } from "react"
import {
    Activity,
    CheckCircle2,
    Clock,
    ExternalLink,
    FileText,
    Github,
    Braces,
    Mail,
    Globe2,
    Loader2,
    Search,
    XCircle,
    AlertTriangle,
    Link2,
} from "lucide-react"
import { useAgentContext, type ActivityLog } from "@/lib/AgentContext"
import { useWalletContext } from "@/lib/WalletContext"
import type { TaskRecord } from "@/types/tasks"

type TabId = "tasks" | "events"

const AGENT_ICONS: Record<string, React.ElementType> = {
    github: Github,
    coding: Braces,
    document: FileText,
    email: Mail,
    search: Globe2,
}

const STATUS_CONFIG: Record<string, { icon: React.ElementType; color: string; bg: string }> = {
    completed: { icon: CheckCircle2, color: "text-emerald-500", bg: "bg-emerald-500/10" },
    failed: { icon: XCircle, color: "text-red-500", bg: "bg-red-500/10" },
    pending: { icon: Clock, color: "text-amber-500", bg: "bg-amber-500/10" },
}

const CHAIN_STATUS_LABELS: Record<string, { label: string; color: string }> = {
    completed: { label: "Confirmed", color: "text-emerald-500" },
    pending: { label: "Pending", color: "text-amber-500" },
    cancelled: { label: "Cancelled", color: "text-red-400" },
    failed: { label: "Failed", color: "text-red-500" },
    uninitialized: { label: "Off-chain", color: "text-muted" },
}

function shortenHash(hash: string | null) {
    if (!hash) return null
    return `${hash.slice(0, 6)}…${hash.slice(-6)}`
}

function explorerUrl(hash: string) {
    return `https://stellar.expert/explorer/testnet/tx/${hash}`
}

export default function ActivityPage() {
    const [searchTerm, setSearchTerm] = useState("")
    const [activeTab, setActiveTab] = useState<TabId>("tasks")
    const { activities } = useAgentContext()
    const { walletAddress } = useWalletContext()

    const [tasks, setTasks] = useState<TaskRecord[]>([])
    const [tasksLoading, setTasksLoading] = useState(false)

    // Fetch task history from Supabase when wallet connected
    useEffect(() => {
        if (!walletAddress) {
            setTasks([])
            return
        }

        let cancelled = false

        const fetchTasks = async () => {
            setTasksLoading(true)
            try {
                const response = await fetch(`/api/tasks?walletAddress=${encodeURIComponent(walletAddress)}&limit=50`)
                const data = await response.json()
                if (!response.ok) throw new Error(data.error ?? "Failed to load tasks")
                if (!cancelled) setTasks(Array.isArray(data.tasks) ? data.tasks : [])
            } catch (error) {
                console.error("[activity] Failed to fetch tasks", error)
                if (!cancelled) setTasks([])
            } finally {
                if (!cancelled) setTasksLoading(false)
            }
        }

        void fetchTasks()
        const interval = window.setInterval(() => void fetchTasks(), 20000)

        return () => {
            cancelled = true
            window.clearInterval(interval)
        }
    }, [walletAddress])

    // Filter tasks by search
    const filteredTasks = useMemo(() => {
        if (!searchTerm.trim()) return tasks
        const q = searchTerm.toLowerCase()
        return tasks.filter(
            (t) =>
                t.agent_type.toLowerCase().includes(q) ||
                t.input_prompt.toLowerCase().includes(q) ||
                t.status.toLowerCase().includes(q) ||
                t.on_chain_status.toLowerCase().includes(q)
        )
    }, [tasks, searchTerm])

    // Filter events by search
    const filteredEvents = useMemo(() => {
        if (!searchTerm.trim()) return activities
        const q = searchTerm.toLowerCase()
        return activities.filter(
            (e) =>
                e.agent.toLowerCase().includes(q) ||
                e.message.toLowerCase().includes(q)
        )
    }, [activities, searchTerm])

    return (
        <div className="mx-auto max-w-5xl space-y-4 px-3 py-4 sm:px-6 sm:py-5">
            {/* Header */}
            <div>
                <h1 className="text-lg font-semibold text-foreground">Activity</h1>
                <p className="text-sm text-foreground-soft">Complete execution history and on-chain task records</p>
            </div>

            {/* Search + Tabs */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="input-shell flex flex-1 items-center gap-2 px-3 py-2 sm:max-w-sm">
                    <Search size={14} className="text-muted" />
                    <input
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Search activity..."
                        className="w-full bg-transparent text-sm text-foreground placeholder:text-muted"
                    />
                </div>
                <div className="flex items-center gap-1">
                    {([
                        { id: "tasks" as TabId, label: "Tasks", icon: Activity },
                        { id: "events" as TabId, label: "Events", icon: Clock },
                    ]).map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                                activeTab === tab.id
                                    ? "bg-primary-soft text-foreground"
                                    : "text-muted hover:text-foreground"
                            }`}
                        >
                            <tab.icon size={13} />
                            {tab.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Tasks Tab */}
            {activeTab === "tasks" && (
                <div className="space-y-3">
                    {!walletAddress && (
                        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-4 text-center">
                            <AlertTriangle size={18} className="mx-auto mb-2 text-amber-500" />
                            <p className="text-sm font-medium text-foreground">Connect a wallet to view task history</p>
                            <p className="mt-1 text-xs text-foreground-soft">Tasks are linked to your Stellar wallet identity.</p>
                        </div>
                    )}

                    {walletAddress && tasksLoading && tasks.length === 0 && (
                        <div className="flex items-center justify-center gap-2 py-12 text-sm text-foreground-soft">
                            <Loader2 size={16} className="animate-spin text-primary" />
                            Loading tasks…
                        </div>
                    )}

                    {walletAddress && !tasksLoading && filteredTasks.length === 0 && (
                        <div className="py-12 text-center">
                            <Activity size={24} className="mx-auto mb-3 text-muted" />
                            <p className="text-sm font-medium text-foreground">No tasks found</p>
                            <p className="mt-1 text-xs text-foreground-soft">Run any agent from the workspace to see tasks here.</p>
                        </div>
                    )}

                    {filteredTasks.map((task) => (
                        <TaskCard key={task.id} task={task} />
                    ))}
                </div>
            )}

            {/* Events Tab */}
            {activeTab === "events" && (
                <div className="space-y-1">
                    {filteredEvents.length === 0 ? (
                        <div className="py-16 text-center">
                            <p className="text-sm text-muted">No matching events</p>
                        </div>
                    ) : (
                        filteredEvents.map((event) => (
                            <EventRow key={event.id} event={event} />
                        ))
                    )}
                </div>
            )}
        </div>
    )
}

/* ── Task Detail Card ────────────────────────────────────── */

function TaskCard({ task }: { task: TaskRecord }) {
    const AgentIcon = AGENT_ICONS[task.agent_type] ?? FileText
    const statusCfg = STATUS_CONFIG[task.status] ?? STATUS_CONFIG.pending
    const StatusIcon = statusCfg.icon
    const chainCfg = CHAIN_STATUS_LABELS[task.on_chain_status] ?? CHAIN_STATUS_LABELS.uninitialized
    const rewardXlm = task.reward_stroops ? (Number(task.reward_stroops) / 10_000_000).toFixed(7) : null

    return (
        <div className="rounded-xl border border-border bg-surface p-4 transition-colors hover:bg-surface-elevated">
            {/* Top row: agent type + status */}
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary-soft text-primary">
                        <AgentIcon size={14} />
                    </div>
                    <span className="text-sm font-semibold capitalize text-foreground">{task.agent_type} Agent</span>
                </div>
                <div className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${statusCfg.bg} ${statusCfg.color}`}>
                    <StatusIcon size={12} />
                    {task.status}
                </div>
            </div>

            {/* Prompt */}
            <p className="mt-3 text-sm leading-relaxed text-foreground-soft">{task.input_prompt}</p>

            {/* Detail grid */}
            <div className="mt-3 grid gap-x-6 gap-y-2 text-xs sm:grid-cols-2 lg:grid-cols-3">
                {/* Created */}
                <DetailItem label="Created" value={new Date(task.created_at).toLocaleString()} />

                {/* Reward */}
                {rewardXlm && <DetailItem label="Reward" value={`${rewardXlm} XLM`} highlight />}

                {/* On-chain status */}
                <div className="flex items-center gap-2">
                    <span className="font-medium text-muted">Chain:</span>
                    <span className={`font-semibold ${chainCfg.color}`}>{chainCfg.label}</span>
                </div>

                {/* Create TX */}
                {task.create_tx_hash && (
                    <TxHashLink label="Create TX" hash={task.create_tx_hash} />
                )}

                {/* Complete TX */}
                {task.complete_tx_hash && (
                    <TxHashLink label="Complete TX" hash={task.complete_tx_hash} />
                )}

                {/* Cancel TX */}
                {task.cancel_tx_hash && (
                    <TxHashLink label="Cancel TX" hash={task.cancel_tx_hash} />
                )}

                {/* Contract */}
                {task.contract_id && (
                    <DetailItem label="Contract" value={shortenHash(task.contract_id) ?? "—"} />
                )}

                {/* On-chain Task ID */}
                {task.on_chain_task_id && (
                    <DetailItem label="On-chain ID" value={task.on_chain_task_id} />
                )}
            </div>
        </div>
    )
}

function DetailItem({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
    return (
        <div className="flex items-center gap-2">
            <span className="font-medium text-muted">{label}:</span>
            <span className={highlight ? "font-semibold text-primary" : "text-foreground-soft"}>{value}</span>
        </div>
    )
}

function TxHashLink({ label, hash }: { label: string; hash: string }) {
    return (
        <div className="flex items-center gap-2">
            <span className="font-medium text-muted">{label}:</span>
            <a
                href={explorerUrl(hash)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 font-mono text-primary hover:underline"
            >
                <Link2 size={10} />
                {shortenHash(hash)}
                <ExternalLink size={9} className="opacity-60" />
            </a>
        </div>
    )
}

/* ── Event Row (original activities) ──────────────────────── */

function EventRow({ event }: { event: ActivityLog }) {
    return (
        <div className="flex items-start justify-between gap-4 rounded-lg px-3 py-3 hover:bg-surface-elevated">
            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-foreground">{event.agent}</span>
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                        event.status === "success" ? "bg-emerald-500/10 text-emerald-500"
                        : event.status === "error" ? "bg-red-500/10 text-red-500"
                        : "bg-surface-elevated text-muted"
                    }`}>
                        {event.status}
                    </span>
                </div>
                <p className="mt-1 truncate text-xs text-foreground-soft">{event.message}</p>
            </div>
            <div className="shrink-0 text-right">
                <div className="text-[10px] text-muted">{event.time}</div>
                {event.reward !== null && (
                    <div className="mt-0.5 text-xs font-medium text-success">+{event.reward}</div>
                )}
            </div>
        </div>
    )
}
