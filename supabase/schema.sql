-- TheDeepSleepers Supabase schema
-- Run once in the Supabase SQL Editor to create the app's tables and user-scoped policies.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.evening_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  evening_date date not null,
  bedtime time not null,
  routine_completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, evening_date)
);

create table if not exists public.routine_steps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  label text not null,
  step_order integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.routine_completions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  step_id uuid not null references public.routine_steps(id) on delete cascade,
  evening_date date not null,
  completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, step_id, evening_date)
);

create index if not exists evening_logs_user_date_idx
  on public.evening_logs (user_id, evening_date);

create index if not exists routine_steps_user_order_idx
  on public.routine_steps (user_id, step_order);

create index if not exists routine_completions_user_date_idx
  on public.routine_completions (user_id, evening_date);

alter table public.profiles enable row level security;
alter table public.evening_logs enable row level security;
alter table public.routine_steps enable row level security;
alter table public.routine_completions enable row level security;

create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

create policy "Users can insert own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

create policy "Users can view own evening logs"
  on public.evening_logs for select
  using (auth.uid() = user_id);

create policy "Users can insert own evening logs"
  on public.evening_logs for insert
  with check (auth.uid() = user_id);

create policy "Users can update own evening logs"
  on public.evening_logs for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own evening logs"
  on public.evening_logs for delete
  using (auth.uid() = user_id);

create policy "Users can view own routine steps"
  on public.routine_steps for select
  using (auth.uid() = user_id);

create policy "Users can insert own routine steps"
  on public.routine_steps for insert
  with check (auth.uid() = user_id);

create policy "Users can update own routine steps"
  on public.routine_steps for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own routine steps"
  on public.routine_steps for delete
  using (auth.uid() = user_id);

create policy "Users can view own routine completions"
  on public.routine_completions for select
  using (auth.uid() = user_id);

create policy "Users can insert own routine completions"
  on public.routine_completions for insert
  with check (auth.uid() = user_id);

create policy "Users can update own routine completions"
  on public.routine_completions for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own routine completions"
  on public.routine_completions for delete
  using (auth.uid() = user_id);

create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.handle_updated_at();

create trigger evening_logs_updated_at
  before update on public.evening_logs
  for each row execute function public.handle_updated_at();

create trigger routine_steps_updated_at
  before update on public.routine_steps
  for each row execute function public.handle_updated_at();

create trigger routine_completions_updated_at
  before update on public.routine_completions
  for each row execute function public.handle_updated_at();
