"use client"

import { useEffect, useMemo, useState } from "react"
import { AlertTriangle } from "lucide-react"
import { useAgentContext, type ActivityLog } from "@/lib/AgentContext"
import { useWalletContext } from "@/lib/WalletContext"
import { isValidWalletAddress } from "@/lib/taskFeatures"
import type { TaskRecord } from "@/types/tasks"
import {
    BrowserAgentIcon,
    CodingAgentIcon,
    DocumentAgentIcon,
    EmailAgentIcon,
    GitHubAgentIcon,
    SearchAgentIcon,
} from "@/components/ui/ExecraIcons"

type TabId = "tasks" | "events"

const AGENT_ICONS: Record<string, React.ElementType> = {
    github: GitHubAgentIcon,
    coding: CodingAgentIcon,
    document: DocumentAgentIcon,
    email: EmailAgentIcon,
    search: SearchAgentIcon,
    browser: BrowserAgentIcon,
}

const CHAIN_STATUS_LABELS: Record<string, { label: string; color: string }> = {
    completed: { label: "Confirmed", color: "text-[color:var(--ex-success)]" },
    pending: { label: "Pending", color: "text-[color:var(--ex-warning)]" },
    cancelled: { label: "Cancelled", color: "text-[color:var(--ex-danger)]" },
    failed: { label: "Failed", color: "text-[color:var(--ex-danger)]" },
    uninitialized: { label: "Off-chain", color: "text-muted" },
}

function shortenHash(hash: string | null) {
    if (!hash) return null
    return `${hash.slice(0, 6)}...${hash.slice(-6)}`
}

function explorerUrl(hash: string) {
    const network = process.env.NEXT_PUBLIC_SOROBAN_NETWORK === "mainnet" ? "public" : "testnet"
    return `https://stellar.expert/explorer/${network}/tx/${hash}`
}

function readStoredWalletAddress() {
    if (typeof window === "undefined") return null

    try {
        const raw = window.localStorage.getItem("execra_wallet_session_v1")
        if (!raw) return null
        const parsed = JSON.parse(raw) as { walletAddress?: unknown }
        return isValidWalletAddress(parsed.walletAddress)
            ? parsed.walletAddress.trim().toUpperCase()
            : null
    } catch {
        return null
    }
}

export default function ActivityPage() {
    const [searchTerm, setSearchTerm] = useState("")
    const [activeTab, setActiveTab] = useState<TabId>("tasks")
    const { activities } = useAgentContext()
    const { walletAddress, isHydrated } = useWalletContext()

    const [tasks, setTasks] = useState<TaskRecord[]>([])
    const [tasksLoading, setTasksLoading] = useState(false)
    const [stableWalletAddress, setStableWalletAddress] = useState<string | null>(null)
    const [tasksError, setTasksError] = useState<string | null>(null)

    useEffect(() => {
        if (isValidWalletAddress(walletAddress)) {
            setStableWalletAddress(walletAddress.trim().toUpperCase())
            return
        }

        if (isHydrated) {
            setStableWalletAddress(readStoredWalletAddress())
        }
    }, [isHydrated, walletAddress])

    const effectiveWalletAddress = walletAddress ?? stableWalletAddress

    useEffect(() => {
        if (!isHydrated) {
            return
        }

        if (!effectiveWalletAddress) {
            setTasks([])
            setTasksError(null)
            return
        }

        let cancelled = false

        const fetchTasks = async () => {
            setTasksLoading(true)
            setTasksError(null)
            try {
                const response = await fetch(`/api/tasks?walletAddress=${encodeURIComponent(effectiveWalletAddress)}&limit=50`)
                const data = await response.json()
                if (!response.ok) throw new Error(data.error ?? "Failed to load tasks")
                if (!cancelled) setTasks(Array.isArray(data.tasks) ? data.tasks : [])
            } catch (error) {
                console.error("[activity] Failed to fetch tasks", error)
                if (!cancelled) {
                    setTasks([])
                    setTasksError(error instanceof Error ? error.message : "Failed to load task history.")
                }
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
    }, [effectiveWalletAddress, isHydrated])

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
        <div className="mx-auto max-w-[900px] space-y-6 px-6 py-10">
            <div>
                <div className="font-heading text-[11px] uppercase tracking-[0.1em] text-muted">Activity</div>
                <p className="mt-2 text-[14px] text-foreground-soft">Complete execution history and on-chain task records</p>
            </div>

            <div className="space-y-3">
                <input
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="search activity..."
                    className="w-full rounded-[4px] border border-border bg-surface px-3 py-2.5 font-heading text-[13px] text-foreground placeholder:text-muted focus:border-[color:var(--ex-accent)] focus:shadow-[0_0_0_3px_rgba(37,99,235,0.1)]"
                />

                <div className="flex items-center gap-5">
                    {(["tasks", "events"] as TabId[]).map((tab) => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={`pb-1 font-heading text-[12px] uppercase tracking-[0.06em] ${
                                activeTab === tab
                                    ? "border-b-[1.5px] border-[color:var(--ex-accent)] text-foreground"
                                    : "text-muted"
                            }`}
                        >
                            {tab}
                        </button>
                    ))}
                </div>
            </div>

            {activeTab === "tasks" && (
                <div className="space-y-2">
                    {!isHydrated && (
                        <div className="py-12 text-center">
                            <div className="scan-label">Loading Activity...</div>
                            <div className="mt-3 text-sm text-foreground-soft">Restoring wallet session...</div>
                        </div>
                    )}

                    {isHydrated && !effectiveWalletAddress && (
                        <NoticeBox tone="warning" title="Connect a wallet to view task history" body="Tasks are linked to your Stellar wallet identity." />
                    )}

                    {isHydrated && effectiveWalletAddress && tasksError && (
                        <NoticeBox tone="danger" title="Could not load task history" body={tasksError} />
                    )}

                    {isHydrated && effectiveWalletAddress && tasksLoading && tasks.length === 0 && (
                        <div className="py-12 text-center">
                            <div className="scan-label">Loading Tasks...</div>
                        </div>
                    )}

                    {isHydrated && effectiveWalletAddress && !tasksLoading && !tasksError && filteredTasks.length === 0 && (
                        <div className="border border-border bg-surface px-4 py-10 text-center text-sm text-foreground-soft">
                            No tasks found.
                        </div>
                    )}

                    {filteredTasks.map((task) => (
                        <TaskCard key={task.id} task={task} />
                    ))}
                </div>
            )}

            {activeTab === "events" && (
                <div className="space-y-2">
                    {filteredEvents.length === 0 ? (
                        <div className="border border-border bg-surface px-4 py-10 text-center text-sm text-foreground-soft">
                            No matching events.
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

function NoticeBox({ tone, title, body }: { tone: "warning" | "danger"; title: string; body: string }) {
    const classes =
        tone === "warning"
            ? "border-[color:var(--ex-warning)] bg-[color:var(--ex-warning-bg)] text-[color:var(--ex-warning)]"
            : "border-[color:var(--ex-danger)] bg-[color:var(--ex-danger-bg)] text-[color:var(--ex-danger)]"

    return (
        <div className={`border px-4 py-4 text-center ${classes}`}>
            <AlertTriangle size={18} className="mx-auto mb-2" />
            <p className="font-heading text-[12px] uppercase tracking-[0.04em]">{title}</p>
            <p className="mt-2 text-[12px] leading-[1.5]">{body}</p>
        </div>
    )
}

function TaskCard({ task }: { task: TaskRecord }) {
    const AgentIcon = AGENT_ICONS[task.agent_type] ?? DocumentAgentIcon
    const chainCfg = CHAIN_STATUS_LABELS[task.on_chain_status] ?? CHAIN_STATUS_LABELS.uninitialized
    const rewardXlm = task.reward_stroops ? (Number(task.reward_stroops) / 10_000_000).toFixed(7) : null
    const proofHash = task.feature_state?.proofHashHex ?? null
    const proofTxHash = task.feature_state?.proofTxHash ?? null
    const statusBorder =
        task.status === "completed"
            ? "var(--ex-success)"
            : task.status === "failed"
                ? "var(--ex-danger)"
                : "var(--ex-warning)"

    return (
        <div className="rounded-[6px] border border-border bg-surface px-6 py-5" style={{ borderLeftWidth: 3, borderLeftColor: statusBorder }}>
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                    <AgentIcon size={14} className="text-foreground" />
                    <span className="font-heading text-[13px] tracking-[0.02em] text-foreground capitalize">{task.agent_type} Agent</span>
                </div>
                <StatusBadge status={task.status} />
            </div>

            <p className="my-3 text-[14px] leading-[1.5] text-foreground-soft">{task.input_prompt}</p>

            <div className="grid gap-3 sm:grid-cols-2">
                <DetailItem label="Created" value={new Date(task.created_at).toLocaleString()} />
                {rewardXlm && <DetailItem label="Reward" value={`◈ ${rewardXlm}`} highlight="xlm" />}
                <DetailItem label="Chain" value={chainCfg.label} className={chainCfg.color} />
                {task.create_tx_hash && <TxHashLink label="Create TX" hash={task.create_tx_hash} />}
                {task.complete_tx_hash && <TxHashLink label="Complete TX" hash={task.complete_tx_hash} />}
                {task.cancel_tx_hash && <TxHashLink label="Cancel TX" hash={task.cancel_tx_hash} />}
                {proofTxHash && <TxHashLink label="Proof TX" hash={proofTxHash} />}
                {task.contract_id && <DetailItem label="Contract" value={shortenHash(task.contract_id) ?? "-"} />}
                {task.on_chain_task_id && <DetailItem label="On-chain ID" value={task.on_chain_task_id} />}
                {proofHash && <DetailItem label="Proof Hash" value={shortenHash(proofHash) ?? proofHash} className="text-[color:var(--ex-accent)]" />}
            </div>

            {proofHash && (
                <div className="mt-4 border border-border bg-[color:var(--ex-surface-2)] px-3 py-3">
                    <div className="font-heading text-[10px] uppercase tracking-[0.08em] text-muted">Verified Output Proof</div>
                    <div className="mt-2 break-all font-mono text-[11px] text-foreground-soft">{proofHash}</div>
                    <p className="mt-2 text-[12px] leading-[1.5] text-foreground-soft">
                        Hash the output you received and compare it with this on-chain SHA-256 proof to confirm the result was not changed after execution.
                    </p>
                </div>
            )}
        </div>
    )
}

function StatusBadge({ status }: { status: string }) {
    const styles =
        status === "completed"
            ? "border-[color:var(--ex-success)] bg-[color:var(--ex-success-bg)] text-[color:var(--ex-success)]"
            : status === "failed"
                ? "border-[color:var(--ex-danger)] bg-[color:var(--ex-danger-bg)] text-[color:var(--ex-danger)]"
                : "border-[color:var(--ex-warning)] bg-[color:var(--ex-warning-bg)] text-[color:var(--ex-warning)]"

    return (
        <span className={`inline-flex rounded-[3px] border px-1.5 py-0.5 font-heading text-[10px] uppercase tracking-[0.06em] ${styles}`}>
            {status}
        </span>
    )
}

function DetailItem({ label, value, highlight, className = "" }: { label: string; value: string; highlight?: "xlm"; className?: string }) {
    return (
        <div>
            <div className="font-heading text-[10px] uppercase tracking-[0.08em] text-muted">{label}</div>
            <div className={`mt-1 font-heading text-[11px] ${highlight === "xlm" ? "text-[color:var(--ex-xlm)]" : "text-foreground-soft"} ${className}`}>
                {value}
            </div>
        </div>
    )
}

function TxHashLink({ label, hash }: { label: string; hash: string }) {
    return (
        <div>
            <div className="font-heading text-[10px] uppercase tracking-[0.08em] text-muted">{label}</div>
            <a
                href={explorerUrl(hash)}
                target="_blank"
                rel="noreferrer"
                className="mt-1 inline-flex items-center gap-1 font-heading text-[11px] text-[color:var(--ex-accent)] hover:underline"
            >
                {shortenHash(hash)} ↗
            </a>
        </div>
    )
}

function EventRow({ event }: { event: ActivityLog }) {
    const tone =
        event.status === "success"
            ? "border-[color:var(--ex-success)] bg-[color:var(--ex-success-bg)] text-[color:var(--ex-success)]"
            : event.status === "error"
                ? "border-[color:var(--ex-danger)] bg-[color:var(--ex-danger-bg)] text-[color:var(--ex-danger)]"
                : "border-border bg-[color:var(--ex-surface-2)] text-muted"

    return (
        <div className="rounded-[6px] border border-border bg-surface px-5 py-4">
            <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                        <span className="font-heading text-[12px] uppercase tracking-[0.04em] text-foreground">{event.agent}</span>
                        <span className={`inline-flex rounded-[3px] border px-1.5 py-0.5 font-heading text-[10px] uppercase tracking-[0.06em] ${tone}`}>
                            {event.status}
                        </span>
                    </div>
                    <p className="mt-2 text-[13px] leading-[1.5] text-foreground-soft">{event.message}</p>
                </div>
                <div className="shrink-0 text-right">
                    <div className="font-heading text-[10px] uppercase tracking-[0.08em] text-muted">{event.time}</div>
                    {event.reward !== null && (
                        <div className="mt-1 font-heading text-[11px] text-[color:var(--ex-xlm)]">◈ {event.reward}</div>
                    )}
                </div>
            </div>
        </div>
    )
}
