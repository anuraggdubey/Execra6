"use client"

import { useEffect, useMemo, useState } from "react"
import { Activity, CheckCircle2, Coins, Loader2, ShieldCheck, Sparkles, Users, Wallet } from "lucide-react"
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
        <div className="mx-auto max-w-6xl space-y-6">
            <section className="rounded-2xl border border-border bg-surface px-5 py-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                    <div>
                        <div className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Metrics Dashboard</div>
                        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">Workspace health and fee sponsorship status</h1>
                        <p className="mt-2 max-w-2xl text-sm text-foreground-soft">
                            This view pulls runtime configuration, recent task activity, wallet state, and sponsorship usage into one place for demo and monitoring proof.
                        </p>
                    </div>
                    <div className="rounded-xl border border-border bg-background px-4 py-3 text-sm text-foreground-soft">
                        {walletAddress ? `Wallet: ${shortWalletAddress} | ${walletBalance ?? "0"} XLM` : "Connect a wallet to load your sponsorship usage"}
                    </div>
                </div>
            </section>

            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                <MetricCard
                    icon={<Sparkles size={16} />}
                    label="Agents Configured"
                    value={agents.length.toString()}
                    tone="text-primary"
                />
                <MetricCard
                    icon={<Users size={16} />}
                    label="Total Users"
                    value={userCount.toString()}
                    tone="text-violet-500"
                />
                <MetricCard
                    icon={<CheckCircle2 size={16} />}
                    label="Completed Runs"
                    value={totalCompletedTasks.toString()}
                    tone="text-emerald-500"
                />
                <MetricCard
                    icon={<Coins size={16} />}
                    label="Agent Earnings"
                    value={`${totalAgentEarnings}`}
                    tone="text-amber-500"
                />
                <MetricCard
                    icon={<ShieldCheck size={16} />}
                    label="Sponsored Wallet Tasks"
                    value={walletAddress ? sponsoredWalletTasks.toString() : "0"}
                    tone="text-sky-500"
                />
            </section>

            <section className="grid gap-4 xl:grid-cols-[1.3fr_1fr]">
                <div className="rounded-2xl border border-border bg-surface p-5">
                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <div className="text-sm font-semibold text-foreground">Platform Monitoring</div>
                            <div className="mt-1 text-sm text-foreground-soft">Live status from the platform status route and the local workspace context.</div>
                        </div>
                        {loading && <Loader2 size={16} className="animate-spin text-primary" />}
                    </div>

                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                        <StatusCard
                            label="LLM Provider"
                            value={platformStatus?.llm.configured ? platformStatus.llm.model : "Not configured"}
                            status={platformStatus?.llm.available ? "Healthy" : "Attention"}
                        />
                        <StatusCard
                            label="GitHub OAuth"
                            value={platformStatus?.tools.github.configured ? "Configured" : "Missing"}
                            status={platformStatus?.tools.github.configured ? "Ready" : "Attention"}
                        />
                        <StatusCard
                            label="Wallet Auth"
                            value={platformStatus?.auth.mode ?? "wallet"}
                            status={isHydrated ? "Live" : "Loading"}
                        />
                        <StatusCard
                            label="Recent Activity Events"
                            value={activities.length.toString()}
                            status={activities.length > 0 ? "Active" : "Idle"}
                        />
                    </div>
                </div>

                <div className="rounded-2xl border border-border bg-surface p-5">
                    <div className="text-sm font-semibold text-foreground">Fee Sponsorship Usage</div>
                    <div className="mt-1 text-sm text-foreground-soft">
                        Use `/settings` to switch `Fee Mode` to `Sponsored Fee Bump`, optionally save a sponsor address for display, then run any agent flow as usual.
                    </div>

                    <div className="mt-4 space-y-3 text-sm">
                        <InfoRow label="Step 1" value="Connect a Freighter, xBull, or Albedo wallet." />
                        <InfoRow label="Step 2" value="Open Settings and save Sponsorship mode." />
                        <InfoRow label="Step 3" value="Run a task from the workspace." />
                        <InfoRow label="Step 4" value="The app routes the signed transaction through /api/soroban/sponsor." />
                    </div>

                    <div className="mt-4 rounded-xl border border-border bg-background p-4 text-sm text-foreground-soft">
                        <div className="flex items-center gap-2 font-medium text-foreground">
                            <Wallet size={15} className="text-primary" />
                            Wallet-specific usage
                        </div>
                        <div className="mt-2">Total users / wallets connected: {userCount}</div>
                        <div className="mt-1">Sponsored tasks for this wallet: {walletAddress ? sponsoredWalletTasks : 0}</div>
                        <div className="mt-1">Recent wallet tasks loaded: {walletAddress ? walletTasks.length : 0}</div>
                    </div>
                </div>
            </section>

            <section className="grid gap-4 xl:grid-cols-2">
                <TaskTable title="Recent Network Tasks" tasks={recentTasks} />
                <TaskTable title="Connected Wallet Tasks" tasks={walletTasks} />
            </section>
        </div>
    )
}

function MetricCard({
    icon,
    label,
    value,
    tone,
}: {
    icon: React.ReactNode
    label: string
    value: string
    tone: string
}) {
    return (
        <div className="rounded-2xl border border-border bg-surface p-4">
            <div className={`flex items-center gap-2 text-sm font-medium ${tone}`}>{icon}{label}</div>
            <div className="mt-3 text-2xl font-semibold tracking-tight text-foreground">{value}</div>
        </div>
    )
}

function StatusCard({ label, value, status }: { label: string; value: string; status: string }) {
    return (
        <div className="rounded-xl border border-border bg-background p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.1em] text-muted">{label}</div>
            <div className="mt-2 text-sm font-semibold text-foreground">{value}</div>
            <div className="mt-1 text-xs text-foreground-soft">{status}</div>
        </div>
    )
}

function InfoRow({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex items-start gap-3 rounded-xl border border-border bg-background px-3 py-3">
            <div className="min-w-14 text-xs font-semibold uppercase tracking-[0.08em] text-muted">{label}</div>
            <div className="text-sm text-foreground-soft">{value}</div>
        </div>
    )
}

function TaskTable({ title, tasks }: { title: string; tasks: TaskRecord[] }) {
    return (
        <div className="rounded-2xl border border-border bg-surface p-5">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Activity size={16} className="text-primary" />
                {title}
            </div>

            {tasks.length === 0 ? (
                <div className="mt-4 rounded-xl border border-dashed border-border bg-background px-4 py-8 text-center text-sm text-foreground-soft">
                    No task data yet.
                </div>
            ) : (
                <div className="mt-4 overflow-hidden rounded-xl border border-border">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-background text-xs uppercase tracking-[0.08em] text-muted">
                            <tr>
                                <th className="px-4 py-3">Agent</th>
                                <th className="px-4 py-3">Status</th>
                                <th className="px-4 py-3">Fee</th>
                            </tr>
                        </thead>
                        <tbody>
                            {tasks.map((task) => (
                                <tr key={task.id} className="border-t border-border">
                                    <td className="px-4 py-3 capitalize text-foreground">{task.agent_type}</td>
                                    <td className="px-4 py-3 text-foreground-soft">{task.on_chain_status}</td>
                                    <td className="px-4 py-3 text-foreground-soft">
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
