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
    return (
        <aside className="bg-[color:var(--ex-surface-2)] sm:sticky sm:top-[52px] sm:h-[calc(100vh-52px)] sm:w-[220px] sm:border-r sm:border-border">
            <div className="px-4 pb-2 pt-5 font-heading text-[10px] uppercase tracking-[0.1em] text-muted">
                Agents
            </div>

            <div className="flex gap-2 overflow-x-auto border-b border-border px-4 pb-3 sm:hidden">
                {agents.map((agent) => {
                    const Icon = agent.icon
                    const active = agent.id === selectedAgentId
                    return (
                        <button
                            key={agent.id}
                            onClick={() => onSelect(agent.id)}
                            className={`inline-flex shrink-0 items-center gap-2 border px-3 py-2 font-heading text-[11px] uppercase tracking-[0.04em] ${
                                active
                                    ? "border-[color:var(--ex-accent)] bg-[color:var(--ex-accent-bg)] text-foreground"
                                    : "border-border bg-surface text-foreground-soft"
                            }`}
                        >
                            <Icon size={14} />
                            {agent.label.replace(" Agent", "")}
                        </button>
                    )
                })}
            </div>

            <div className="hidden sm:block">
                {agents.map((agent) => {
                    const Icon = agent.icon
                    const active = agent.id === selectedAgentId

                    return (
                        <button
                            key={agent.id}
                            onClick={() => onSelect(agent.id)}
                            className={`flex h-[52px] w-full items-center gap-3 border-l-2 px-4 text-left transition-colors duration-150 ${
                                active
                                    ? "border-l-[color:var(--ex-accent)] bg-[color:var(--ex-accent-bg)]"
                                    : "border-l-transparent hover:bg-black/[0.03]"
                            }`}
                        >
                            <Icon size={14} className={active ? "text-[color:var(--ex-accent)]" : "text-foreground"} />
                            <div className="min-w-0">
                                <div className="font-heading text-[12px] tracking-[0.02em] text-foreground">{agent.label}</div>
                                <div className="truncate font-sans text-[11px] text-muted">{agent.badge}</div>
                            </div>
                        </button>
                    )
                })}
            </div>
        </aside>
    )
}
