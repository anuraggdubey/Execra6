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
        <aside className="rounded-2xl bg-surface/80 p-1.5 ring-1 ring-black/5 sm:sticky sm:top-4 sm:self-start sm:p-2">
            <div className="mb-1.5 hidden px-2 pt-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted sm:block">
                Agents
            </div>

            <div className="flex gap-1.5 overflow-x-auto pb-1 sm:hidden">
                {agents.map((agent) => {
                    const Icon = agent.icon
                    const active = agent.id === selectedAgentId
                    return (
                        <button
                            key={agent.id}
                            onClick={() => onSelect(agent.id)}
                            className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl px-2.5 py-2 text-[11px] font-semibold transition-all duration-200 ${
                                active
                                    ? "bg-primary text-white shadow-sm"
                                    : "bg-background text-foreground-soft ring-1 ring-black/5"
                            }`}
                        >
                            <Icon size={13} />
                            {agent.label.replace(" Agent", "")}
                        </button>
                    )
                })}
            </div>

            <div className="hidden space-y-0.5 sm:block">
                {agents.map((agent) => {
                    const Icon = agent.icon
                    const active = agent.id === selectedAgentId

                    return (
                        <button
                            key={agent.id}
                            onClick={() => onSelect(agent.id)}
                            className={`group flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-all duration-150 ${
                                active
                                    ? "bg-primary-soft shadow-sm ring-1 ring-primary/15"
                                    : "text-foreground-soft hover:bg-background/80"
                            }`}
                        >
                            <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors duration-150 ${
                                active ? "bg-primary text-white" : "bg-background text-primary ring-1 ring-black/5"
                            }`}>
                                <Icon size={14} />
                            </div>
                            <div className="min-w-0">
                                <div className={`text-[13px] font-medium leading-tight ${active ? "text-foreground" : "text-foreground-soft group-hover:text-foreground"}`}>
                                    {agent.label}
                                </div>
                                <div className="mt-0.5 text-[10px] font-medium text-muted">
                                    {agent.badge}
                                </div>
                            </div>
                        </button>
                    )
                })}
            </div>
        </aside>
    )
}
