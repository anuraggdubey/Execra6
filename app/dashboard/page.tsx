// Execra Platform
"use client"

import { useEffect, useMemo, useState } from "react"
import { Loader2 } from "lucide-react"
import { useAgentContext } from "@/lib/AgentContext"
import { useWalletContext } from "@/lib/WalletContext"
import type { TaskRecord } from "@/types/tasks"
import { StatusDot } from "@/components/ui/ExecraIcons"

type PlatformStatus = {
    llm: {
        configured: boolean
        model: string
        available: boolean
        usageWeekly?: number
    }
    tools: {
        github: {
            configured: boolean
        }
    }
    auth: {
        mode: string
    }
}

export default function DashboardPage() {
    const { agents, activities } = useAgentContext()
    const { walletAddress, walletBalance, shortWalletAddress, isHydrated } = useWalletContext()
    const [platformStatus, setPlatformStatus] = useState<PlatformStatus | null>(null)
    const [recentTasks, setRecentTasks] = useState<TaskRecord[]>([])
    const [walletTasks, setWalletTasks] = useState<TaskRecord[]>([])
    const [userCount, setUserCount] = useState(0)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        let cancelled = false

        const load = async () => {
            setLoading(true)
            try {
                const platformPromise = fetch("/api/platform-status", { cache: "no-store" }).then((response) => response.json())
                const recentTasksPromise = fetch("/api/tasks?limit=8", { cache: "no-store" }).then((response) => response.json())
                const userCountPromise = fetch("/api/users", { cache: "no-store" }).then((response) => response.json())
                const walletTasksPromise = walletAddress
                    ? fetch(`/api/tasks?walletAddress=${encodeURIComponent(walletAddress)}&limit=8`, { cache: "no-store" }).then((response) => response.json())
                    : Promise.resolve({ tasks: [] })

                const [platformPayload, recentPayload, userPayload, walletPayload] = await Promise.all([
                    platformPromise,
                    recentTasksPromise,
                    userCountPromise,
                    walletTasksPromise,
                ])

                if (cancelled) return

                setPlatformStatus(platformPayload)
                setRecentTasks(Array.isArray(recentPayload.tasks) ? recentPayload.tasks : [])
                setUserCount(typeof userPayload.count === "number" ? userPayload.count : 0)
                setWalletTasks(Array.isArray(walletPayload.tasks) ? walletPayload.tasks : [])
            } catch (error) {
                console.error("[dashboard] Failed to load metrics", error)
                if (!cancelled) {
                    setPlatformStatus(null)
                    setRecentTasks([])
                    setUserCount(0)
                    setWalletTasks([])
                }
            } finally {
                if (!cancelled) setLoading(false)
            }
        }

        void load()

        return () => {
            cancelled = true
        }
    }, [walletAddress])

    const totalCompletedTasks = useMemo(
        () => agents.reduce((sum, agent) => sum + agent.tasksCompleted, 0),
        [agents]
    )
    const totalAgentEarnings = useMemo(
        () => agents.reduce((sum, agent) => sum + agent.earnings, 0),
        [agents]
    )
    const sponsoredWalletTasks = useMemo(
        () => walletTasks.filter((task) => task.feature_config?.feeMode === "sponsored").length,
        [walletTasks]
    )
    const verifiedWalletTasks = useMemo(
        () => walletTasks.filter((task) => Boolean(task.feature_state?.proofHashHex)).length,
        [walletTasks]
    )

    return (
        <div className="mx-auto max-w-[1440px] space-y-8 px-4 pt-8 sm:px-6 sm:pt-10">
            <div className="flex flex-col gap-4 border-b border-border pb-6 sm:flex-row sm:items-start sm:justify-between">
                <div>
                    <div className="font-heading text-[11px] uppercase tracking-[0.1em] text-muted">Dashboard</div>
                    <div className="mt-3 font-heading text-[13px] tracking-[0.02em] text-foreground-soft">
                        {walletAddress ? `${shortWalletAddress} · ${walletBalance ?? "0"} XLM` : "Connect wallet to see your data"}
                    </div>
                </div>
                {loading && <Loader2 size={16} className="animate-spin text-primary" />}
            </div>

            <section className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
                <MetricCard label="Agents" value={agents.length.toString()} tone="var(--ex-accent)" />
                <MetricCard label="Users" value={userCount.toString()} tone="var(--ex-ink-2)" />
                <MetricCard label="Completed" value={totalCompletedTasks.toString()} tone="var(--ex-success)" />
                <MetricCard label="Earnings" value={`XLM ${totalAgentEarnings}`} tone="var(--ex-xlm)" />
                <MetricCard label="Sponsored" value={walletAddress ? sponsoredWalletTasks.toString() : "0"} tone="var(--ex-chain)" />
                <MetricCard label="Proofs" value={walletAddress ? verifiedWalletTasks.toString() : "0"} tone="var(--ex-accent)" />
            </section>

            <section className="grid gap-4 xl:grid-cols-2">
                <div className="rounded-[6px] border border-border bg-surface px-6 py-5">
                    <SectionHeader title="Platform Status" />
                    <div className="mt-4">
                        <StatusRow label="LLM" value={platformStatus?.llm.configured ? platformStatus.llm.model : "Not configured"} tone={platformStatus?.llm.available ? "success" : "warning"} />
                        <StatusRow label="GITHUB" value={platformStatus?.tools.github.configured ? "Configured" : "Missing"} tone={platformStatus?.tools.github.configured ? "success" : "warning"} />
                        <StatusRow label="AUTH" value={platformStatus?.auth.mode ?? "wallet"} tone={isHydrated ? "success" : "warning"} />
                        <StatusRow label="EVENTS" value={activities.length.toString()} tone={activities.length > 0 ? "success" : "warning"} />
                    </div>
                </div>

                <div className="rounded-[6px] border border-border bg-surface px-6 py-5">
                    <SectionHeader title="Fee Sponsorship" />
                    <p className="mt-4 text-[13px] text-foreground-soft">
                        Enable sponsored fees in Settings, then run any agent task.
                    </p>
                    <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                        <MiniStat label="Users" value={userCount.toString()} />
                        <MiniStat label="Sponsored" value={walletAddress ? sponsoredWalletTasks.toString() : "0"} />
                        <MiniStat label="Wallet Tasks" value={walletAddress ? walletTasks.length.toString() : "0"} />
                        <MiniStat label="Proofs" value={walletAddress ? verifiedWalletTasks.toString() : "0"} />
                    </div>
                </div>
            </section>

            <section className="grid gap-4 xl:grid-cols-2">
                <TaskTable title="Recent Tasks" tasks={recentTasks} />
                <TaskTable title="Wallet Tasks" tasks={walletTasks} />
            </section>
        </div>
    )
}

function MetricCard({ label, value, tone }: { label: string; value: string; tone: string }) {
    return (
        <div className="rounded-[6px] border border-border bg-surface p-4" style={{ borderLeftWidth: 2, borderLeftColor: tone }}>
            <div className="font-heading text-[10px] uppercase tracking-[0.08em] text-muted">{label}</div>
            <div className="mt-3 font-heading text-[28px] tracking-[-0.01em]" style={{ color: tone }}>
                {value}
            </div>
        </div>
    )
}

function SectionHeader({ title }: { title: string }) {
    return (
        <>
            <div className="font-heading text-[11px] uppercase tracking-[0.08em] text-muted">{title}</div>
            <div className="mt-3 h-px w-full bg-border" />
        </>
    )
}

function StatusRow({ label, value, tone }: { label: string; value: string; tone: "success" | "warning" | "danger" }) {
    return (
        <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3 border-b border-border py-3 last:border-b-0">
            <div className="font-heading text-[11px] tracking-[0.02em] text-muted">{label}</div>
            <div />
            <div className="flex items-center gap-2">
                <StatusDot tone={tone} />
                <span className="font-heading text-[12px] tracking-[0.02em] text-foreground">{value}</span>
            </div>
        </div>
    )
}

function MiniStat({ label, value }: { label: string; value: string }) {
    return (
        <div className="border border-border bg-[color:var(--ex-surface-2)] px-3 py-3 text-center">
            <div className="font-heading text-[10px] uppercase tracking-[0.08em] text-muted">{label}</div>
            <div className="mt-2 font-heading text-[18px] text-foreground">{value}</div>
        </div>
    )
}

function TaskTable({ title, tasks }: { title: string; tasks: TaskRecord[] }) {
    return (
        <div className="rounded-[6px] border border-border bg-surface px-4 py-5 sm:px-6">
            <SectionHeader title={title} />

            {tasks.length === 0 ? (
                <div className="mt-4 border border-border bg-[color:var(--ex-surface-2)] px-3 py-6 text-center text-[13px] text-foreground-soft">
                    No tasks yet
                </div>
            ) : (
                <div className="mt-4 overflow-x-auto border border-border">
                    <table className="w-full min-w-[560px] text-left text-[13px]">
                        <thead className="bg-[color:var(--ex-surface-2)] font-heading text-[10px] uppercase tracking-[0.08em] text-muted">
                            <tr>
                                <th className="px-3 py-2">Agent</th>
                                <th className="px-3 py-2">Status</th>
                                <th className="px-3 py-2">Proof</th>
                                <th className="px-3 py-2">Fee</th>
                            </tr>
                        </thead>
                        <tbody>
                            {tasks.map((task) => (
                                <tr key={task.id} className="border-t border-border">
                                    <td className="px-3 py-3 font-heading capitalize text-foreground">{task.agent_type}</td>
                                    <td className="px-3 py-3">
                                        <ChainStatusBadge status={task.on_chain_status} />
                                    </td>
                                    <td className="px-3 py-3 font-heading text-[11px]">
                                        {task.feature_state?.proofHashHex ? (
                                            <span className="text-[color:var(--ex-success)]">Verified</span>
                                        ) : (
                                            <span className="text-muted">Missing</span>
                                        )}
                                    </td>
                                    <td className="px-3 py-3 font-sans text-foreground-soft">
                                        {task.feature_config?.feeMode === "sponsored" ? "Sponsored" : "User Paid"}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    )
}

function ChainStatusBadge({ status }: { status: string }) {
    const styles =
        status === "completed"
            ? "border-[color:var(--ex-success)] bg-[color:var(--ex-success-bg)] text-[color:var(--ex-success)]"
            : status === "pending"
                ? "border-[color:var(--ex-warning)] bg-[color:var(--ex-warning-bg)] text-[color:var(--ex-warning)]"
                : status === "failed" || status === "cancelled"
                    ? "border-[color:var(--ex-danger)] bg-[color:var(--ex-danger-bg)] text-[color:var(--ex-danger)]"
                    : "border-border bg-[color:var(--ex-surface-2)] text-muted"

    return (
        <span className={`inline-flex rounded-[3px] border px-1.5 py-0.5 font-heading text-[10px] uppercase tracking-[0.06em] ${styles}`}>
            {status}
        </span>
    )
}
