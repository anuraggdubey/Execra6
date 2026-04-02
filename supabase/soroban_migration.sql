alter table public.tasks
    add column if not exists on_chain_task_id bigint,
    add column if not exists reward_stroops bigint,
    add column if not exists contract_id text,
    add column if not exists on_chain_status text not null default 'uninitialized',
    add column if not exists create_tx_hash text,
    add column if not exists complete_tx_hash text,
    add column if not exists cancel_tx_hash text;

do $$
begin
    alter table public.tasks
        add constraint tasks_on_chain_status_check
        check (on_chain_status in ('uninitialized', 'pending', 'completed', 'cancelled', 'failed'));
exception
    when duplicate_object then null;
end $$;
