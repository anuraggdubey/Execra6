"use client"

import { useEffect, useMemo, useState } from "react"
import { Activity, CheckCircle2, Coins, Loader2, ShieldCheck, Sparkles, Users } from "lucide-react"
import { useAgentContext } from "@/lib/AgentContext"
import { useWalletContext } from "@/lib/WalletContext"
import type { TaskRecord } from "@/types/tasks"

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

    return (
        <div className="mx-auto max-w-5xl space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-lg font-semibold tracking-tight text-foreground">Dashboard</h1>
                    <p className="mt-0.5 text-[13px] text-foreground-soft">
                        {walletAddress ? `${shortWalletAddress} · ${walletBalance ?? "0"} XLM` : "Connect wallet to see your data"}
                    </p>
                </div>
                {loading && <Loader2 size={16} className="animate-spin text-primary" />}
            </div>

            {/* Metric cards */}
            <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
                <MetricCard icon={<Sparkles size={15} />} label="Agents" value={agents.length.toString()} tone="text-primary" />
                <MetricCard icon={<Users size={15} />} label="Users" value={userCount.toString()} tone="text-violet-500" />
                <MetricCard icon={<CheckCircle2 size={15} />} label="Completed" value={totalCompletedTasks.toString()} tone="text-emerald-500" />
                <MetricCard icon={<Coins size={15} />} label="Earnings" value={`${totalAgentEarnings}`} tone="text-amber-500" />
                <MetricCard icon={<ShieldCheck size={15} />} label="Sponsored" value={walletAddress ? sponsoredWalletTasks.toString() : "0"} tone="text-sky-500" />
            </section>

            {/* Platform status */}
            <section className="grid gap-3 xl:grid-cols-2">
                <div className="rounded-xl border border-border bg-surface p-4">
                    <div className="text-[13px] font-semibold text-foreground">Platform Status</div>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        <StatusCard
                            label="LLM"
                            value={platformStatus?.llm.configured ? platformStatus.llm.model : "Not configured"}
                            status={platformStatus?.llm.available ? "Healthy" : "Attention"}
                        />
                        <StatusCard
                            label="GitHub"
                            value={platformStatus?.tools.github.configured ? "Configured" : "Missing"}
                            status={platformStatus?.tools.github.configured ? "Ready" : "Attention"}
                        />
                        <StatusCard
                            label="Auth"
                            value={platformStatus?.auth.mode ?? "wallet"}
                            status={isHydrated ? "Live" : "Loading"}
                        />
                        <StatusCard
                            label="Events"
                            value={activities.length.toString()}
                            status={activities.length > 0 ? "Active" : "Idle"}
                        />
                    </div>
                </div>

                <div className="rounded-xl border border-border bg-surface p-4">
                    <div className="text-[13px] font-semibold text-foreground">Fee Sponsorship</div>
                    <p className="mt-1 text-[12px] text-foreground-soft">
                        Enable sponsored fees in Settings, then run any agent task.
                    </p>
                    <div className="mt-3 grid grid-cols-3 gap-2">
                        <MiniStat label="Users" value={userCount.toString()} />
                        <MiniStat label="Sponsored" value={walletAddress ? sponsoredWalletTasks.toString() : "0"} />
                        <MiniStat label="Wallet Tasks" value={walletAddress ? walletTasks.length.toString() : "0"} />
                    </div>
                </div>
            </section>

            {/* Task tables */}
            <section className="grid gap-3 xl:grid-cols-2">
                <TaskTable title="Recent Tasks" tasks={recentTasks} />
                <TaskTable title="Wallet Tasks" tasks={walletTasks} />
            </section>
        </div>
    )
}

function MetricCard({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string; tone: string }) {
    return (
        <div className="rounded-xl border border-border bg-surface p-3">
            <div className={`flex items-center gap-1.5 text-[11px] font-medium ${tone}`}>{icon}{label}</div>
            <div className="mt-2 text-xl font-semibold tracking-tight text-foreground">{value}</div>
        </div>
    )
}

function StatusCard({ label, value, status }: { label: string; value: string; status: string }) {
    return (
        <div className="rounded-lg border border-border bg-background px-3 py-2.5">
            <div className="text-[10px] font-semibold uppercase tracking-widest text-muted">{label}</div>
            <div className="mt-1 text-[13px] font-medium text-foreground">{value}</div>
            <div className="mt-0.5 text-[11px] text-foreground-soft">{status}</div>
        </div>
    )
}

function MiniStat({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-lg bg-background px-3 py-2 text-center">
            <div className="text-[10px] font-medium uppercase tracking-wider text-muted">{label}</div>
            <div className="mt-1 text-base font-semibold text-foreground">{value}</div>
        </div>
    )
}

function TaskTable({ title, tasks }: { title: string; tasks: TaskRecord[] }) {
    return (
        <div className="rounded-xl border border-border bg-surface p-4">
            <div className="flex items-center gap-1.5 text-[13px] font-semibold text-foreground">
                <Activity size={14} className="text-primary" />
                {title}
            </div>

            {tasks.length === 0 ? (
                <div className="mt-3 rounded-lg border border-dashed border-border bg-background px-3 py-6 text-center text-[13px] text-foreground-soft">
                    No tasks yet
                </div>
            ) : (
                <div className="mt-3 overflow-hidden rounded-lg border border-border">
                    <table className="w-full text-left text-[13px]">
                        <thead className="bg-background text-[10px] uppercase tracking-[0.08em] text-muted">
                            <tr>
                                <th className="px-3 py-2">Agent</th>
                                <th className="px-3 py-2">Status</th>
                                <th className="px-3 py-2">Fee</th>
                            </tr>
                        </thead>
                        <tbody>
                            {tasks.map((task) => (
                                <tr key={task.id} className="border-t border-border">
                                    <td className="px-3 py-2 capitalize text-foreground">{task.agent_type}</td>
                                    <td className="px-3 py-2 text-foreground-soft">{task.on_chain_status}</td>
                                    <td className="px-3 py-2 text-foreground-soft">
                                        {task.feature_config?.feeMode === "sponsored" ? "Sponsored" : "User paid"}
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
