create table if not exists public.email_signups (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  name text not null default '',
  source text not null default 'links',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.email_signups enable row level security;

revoke all on public.email_signups from anon;
revoke all on public.email_signups from authenticated;

create or replace function public.join_email_list(
  p_email text,
  p_name text default '',
  p_source text default 'links'
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_name text := trim(coalesce(p_name, ''));
  v_source text := left(trim(coalesce(p_source, 'links')), 40);
  v_id uuid;
begin
  if v_email !~ '^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$' then
    raise exception 'Enter a valid email address.';
  end if;

  insert into public.email_signups (email, name, source)
  values (v_email, v_name, v_source)
  on conflict (email) do update set
    name = coalesce(nullif(excluded.name, ''), public.email_signups.name),
    source = excluded.source,
    updated_at = now()
  returning id into v_id;

  return jsonb_build_object('id', v_id, 'ok', true);
end;
$$;

grant execute on function public.join_email_list(text, text, text) to anon;
