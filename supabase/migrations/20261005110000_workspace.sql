create table public.axn_projects(id text primary key,name text not null,color text not null);
create table public.axn_tasks(id text primary key,project_id text not null references public.axn_projects(id),title text not null check(length(title) between 1 and 160),brief text not null default '',deliverable text not null default '',status text not null default 'todo' check(status in ('backlog','todo','in_progress','review','done')),assignee text not null default 'Nandini',priority text not null default 'media' check(priority in ('bassa','media','alta')),due_date date,created_by text not null default 'team',created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create index axn_tasks_project on public.axn_tasks(project_id);
create table public.axn_comments(id uuid primary key default gen_random_uuid(),task_id text not null references public.axn_tasks(id) on delete cascade,author_name text not null default 'Team',author_email text not null default '',body text not null check(length(body) between 1 and 5000),created_at timestamptz not null default now());
create index axn_comments_task on public.axn_comments(task_id);
create table public.axn_attachments(id uuid primary key default gen_random_uuid(),task_id text not null references public.axn_tasks(id) on delete cascade,file_name text not null,content_type text not null,file_size bigint not null check(file_size between 1 and 104857600),storage_key text not null unique,uploaded_by text not null default 'Team',uploaded_at timestamptz not null default now(),ready boolean not null default false);
create index axn_attachments_task on public.axn_attachments(task_id);
create table public.axn_settings(id boolean primary key default true check(id),username text not null,password_salt text not null,password_hash text not null,session_secret text not null);
create table public.axn_login_attempts(window_start timestamptz primary key,attempts integer not null);
alter table public.axn_projects enable row level security;
alter table public.axn_tasks enable row level security;
alter table public.axn_comments enable row level security;
alter table public.axn_attachments enable row level security;
alter table public.axn_settings enable row level security;
alter table public.axn_login_attempts enable row level security;
revoke all on public.axn_projects,public.axn_tasks,public.axn_comments,public.axn_attachments,public.axn_settings,public.axn_login_attempts from anon, authenticated;
grant all on public.axn_projects,public.axn_tasks,public.axn_comments,public.axn_attachments,public.axn_settings,public.axn_login_attempts to service_role;
create function public.axn_login_allowed() returns boolean language plpgsql security invoker set search_path = '' as $$
declare n integer; begin
 insert into public.axn_login_attempts(window_start,attempts) values(date_trunc('minute',now()),1) on conflict(window_start) do update set attempts=public.axn_login_attempts.attempts+1 returning attempts into n;
 delete from public.axn_login_attempts where window_start<now()-interval '1 hour';
 return n<=30;
end;$$;
revoke execute on function public.axn_login_allowed() from public,anon,authenticated;
grant execute on function public.axn_login_allowed() to service_role;
insert into storage.buckets(id,name,public,file_size_limit) values('axn-deliverables','axn-deliverables',false,104857600);
