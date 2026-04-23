alter table public.tasks
add column if not exists feature_config jsonb not null default '{}'::jsonb;

alter table public.tasks
add column if not exists feature_state jsonb not null default '{}'::jsonb;
