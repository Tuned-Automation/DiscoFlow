-- DiscoFlow initial schema
-- profiles, sessions, templates with RLS

-- ============================================================
-- PROFILES (client profiles)
-- ============================================================
create table if not exists public.profiles (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  company     text,
  role        text,
  context     text,
  tags        text[],
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles: users own their rows"
  on public.profiles
  for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ============================================================
-- SESSIONS (discovery sessions)
-- ============================================================
create table if not exists public.sessions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  profile_id      uuid references public.profiles(id) on delete set null,
  intention       text,
  my_context      text,
  client_context  text,
  template_id     text,
  transcript      jsonb not null default '[]'::jsonb,
  questions       jsonb not null default '[]'::jsonb,
  status          text not null default 'active' check (status in ('active', 'completed')),
  duration        integer not null default 0,
  created_at      timestamptz not null default now(),
  ended_at        timestamptz
);

alter table public.sessions enable row level security;

create policy "sessions: users own their rows"
  on public.sessions
  for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ============================================================
-- TEMPLATES (custom conversation templates)
-- ============================================================
create table if not exists public.templates (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  name                text not null,
  intention           text,
  topic_areas         text,
  suggested_questions jsonb not null default '[]'::jsonb,
  context_prompt      text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

alter table public.templates enable row level security;

create policy "templates: users own their rows"
  on public.templates
  for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ============================================================
-- updated_at trigger (profiles + templates)
-- ============================================================
create or replace function public.handle_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_profiles_updated_at
  before update on public.profiles
  for each row execute function public.handle_updated_at();

create trigger set_templates_updated_at
  before update on public.templates
  for each row execute function public.handle_updated_at();
