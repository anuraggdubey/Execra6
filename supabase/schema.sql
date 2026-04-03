create extension if not exists "pgcrypto";

create table if not exists public.users (
    id uuid primary key default gen_random_uuid(),
    wallet_address text not null unique,
    github_connected boolean not null default false,
    created_at timestamptz not null default now()
);

create index if not exists users_wallet_address_idx on public.users (wallet_address);

create table if not exists public.tasks (
    id uuid primary key default gen_random_uuid(),
    wallet_address text not null,
    agent_type text not null check (agent_type in ('github', 'coding', 'document', 'email', 'search', 'browser')),
    input_prompt text not null,
    output_result jsonb,
    status text not null check (status in ('pending', 'completed', 'failed')),
    on_chain_task_id bigint,
    reward_stroops bigint,
    contract_id text,
    on_chain_status text not null default 'uninitialized' check (on_chain_status in ('uninitialized', 'pending', 'completed', 'cancelled', 'failed')),
    create_tx_hash text,
    complete_tx_hash text,
    cancel_tx_hash text,
    created_at timestamptz not null default now()
);

create index if not exists tasks_wallet_address_idx on public.tasks (wallet_address);
create index if not exists tasks_created_at_idx on public.tasks (created_at desc);

create table if not exists public.agent_runs (
    id uuid primary key default gen_random_uuid(),
    task_id uuid not null references public.tasks(id) on delete cascade,
    execution_logs jsonb,
    duration numeric,
    created_at timestamptz not null default now()
);

create index if not exists agent_runs_task_id_idx on public.agent_runs (task_id);

alter table public.users enable row level security;
alter table public.tasks enable row level security;
alter table public.agent_runs enable row level security;

drop policy if exists "deny_all_users" on public.users;
drop policy if exists "deny_all_tasks" on public.tasks;
drop policy if exists "deny_all_agent_runs" on public.agent_runs;

create policy "deny_all_users"
on public.users
for all
to public
using (false)
with check (false);

create policy "deny_all_tasks"
on public.tasks
for all
to public
using (false)
with check (false);

create policy "deny_all_agent_runs"
on public.agent_runs
for all
to public
using (false)
with check (false);

comment on table public.users is 'Wallet-identified users. Ready to map to authenticated wallet claims later.';
comment on table public.tasks is 'Agent task history persisted for GitHub, coding, document, email, web search, and browser automation flows.';
comment on table public.agent_runs is 'Execution metadata and logs for individual task runs.';
