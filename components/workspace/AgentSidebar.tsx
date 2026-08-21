// Execra Platform
"use client"

type SidebarAgent = {
    id: string
    label: string
    description: string
    badge: string
    icon: React.ElementType
}

type AgentSidebarProps = {
    agents: SidebarAgent[]
    selectedAgentId: string
    onSelect: (agentId: string) => void
}

export default function AgentSidebar({
    agents,
    selectedAgentId,
    onSelect,
}: AgentSidebarProps) {
    const selectedAgent =
        agents.find((agent) => agent.id === selectedAgentId) ?? agents[0]

    return (
        <aside className="shrink-0 border-b border-border bg-[color:var(--ex-surface-2)] sm:w-[260px] sm:border-b-0 sm:border-r">
            <div className="border-b border-border bg-surface px-4 pb-3 pt-4 sm:hidden">
                <div className="font-heading text-[10px] uppercase tracking-[0.1em] text-muted">Workspace agents</div>
                <label htmlFor="agent-select" className="mt-3 block text-[12px] leading-relaxed text-foreground-soft">
                    Select the agent to run.
                </label>
            </div>

            <div className="px-4 py-3 sm:hidden">
                <div className="rounded-[6px] border border-border bg-background px-3 py-3">
                    <div className="mb-2 flex items-center gap-2 text-foreground">
                        <selectedAgent.icon size={14} className="text-[color:var(--ex-accent)]" />
                        <span className="font-heading text-[11px] uppercase tracking-[0.04em]">
                            {selectedAgent.label}
                        </span>
                    </div>
                    <select
                        id="agent-select"
                        value={selectedAgentId}
                        onChange={(event) => onSelect(event.target.value)}
                        className="w-full rounded-[4px] border border-border bg-background px-3 py-3 font-heading text-[12px] text-foreground focus:border-[color:var(--ex-accent)] focus:shadow-[0_0_0_3px_rgba(37,99,235,0.08)]"
                    >
                        {agents.map((agent) => (
                            <option key={agent.id} value={agent.id}>
                                {agent.label}
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            <div className="hidden sm:block">
                <div className="border-b border-border bg-surface px-5 pb-4 pt-5">
                    <div className="font-heading text-[10px] uppercase tracking-[0.1em] text-muted">Agents</div>
                    <div className="mt-1 text-[12px] leading-relaxed text-foreground-soft">Choose an execution workspace.</div>
                </div>

                <div className="space-y-1 p-3">
                    {agents.map((agent) => {
                        const Icon = agent.icon
                        const active = agent.id === selectedAgentId

                        return (
                            <button
                                key={agent.id}
                                onClick={() => onSelect(agent.id)}
                                className={`flex w-full items-start gap-3 rounded-[6px] border px-3 py-3 text-left transition-colors duration-150 ${
                                    active
                                        ? "border-[color:var(--ex-accent)] bg-[color:var(--ex-accent-bg)] shadow-[inset_2px_0_0_var(--ex-accent)]"
                                        : "border-transparent hover:border-border hover:bg-surface"
                                }`}
                            >
                                <Icon size={14} className={`mt-0.5 ${active ? "text-[color:var(--ex-accent)]" : "text-foreground"}`} />
                                <div className="min-w-0">
                                    <div className="font-heading text-[12px] tracking-[0.02em] text-foreground">{agent.label}</div>
                                    <div className="mt-1 font-sans text-[11px] leading-relaxed text-muted">{agent.badge}</div>
                                </div>
                            </button>
                        )
                    })}
                </div>
            </div>
        </aside>
    )
}
