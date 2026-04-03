alter table public.tasks
drop constraint if exists tasks_agent_type_check;

alter table public.tasks
add constraint tasks_agent_type_check
check (agent_type in ('github', 'coding', 'document', 'email', 'search', 'browser'));
