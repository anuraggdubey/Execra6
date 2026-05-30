-- Fix: on_chain_task_id was bigint but the app generates alphanumeric IDs (e.g. "brompnke5c109n9").
-- PostgreSQL cannot cast these to bigint, causing every task insert to fail.
-- Also changing reward_stroops to text to match the string values the app sends.

alter table public.tasks
alter column on_chain_task_id type text using on_chain_task_id::text;

alter table public.tasks
alter column reward_stroops type text using reward_stroops::text;
