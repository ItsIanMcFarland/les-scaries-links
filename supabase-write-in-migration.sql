alter table public.queue_requests
  alter column song_id drop not null;

alter table public.queue_requests
  add column if not exists request_type text not null default 'catalog',
  add column if not exists write_in_title text not null default '',
  add column if not exists write_in_artist text not null default '';

do $$
begin
  alter table public.queue_requests
    add constraint queue_requests_request_type_check
    check (request_type in ('catalog', 'write_in'));
exception
  when duplicate_object then null;
end $$;

alter table public.queue_requests
  alter column payment_amount set default 7.00;

create or replace function public.request_song(
  p_singer text,
  p_song_id text,
  p_device_id text,
  p_venmo_handle text
) returns public.queue_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_singer text := trim(coalesce(p_singer, ''));
  v_singer_key text := lower(regexp_replace(trim(coalesce(p_singer, '')), '[^a-zA-Z0-9]+', '', 'g'));
  v_venmo_handle text := lower(regexp_replace(trim(coalesce(p_venmo_handle, '')), '^@', ''));
  v_song_exists boolean;
  v_open_by_singer integer;
  v_open_by_device integer;
  v_recent_by_device integer;
  v_request public.queue_requests;
begin
  if length(v_singer) < 2 or length(v_singer) > 60 then
    raise exception 'Use a real stage name between 2 and 60 characters.';
  end if;

  if v_venmo_handle !~ '^[a-z0-9_.-]{3,40}$' then
    raise exception 'Enter a valid Venmo handle.';
  end if;

  if length(coalesce(p_device_id, '')) < 16 then
    raise exception 'Refresh and try again.';
  end if;

  select exists(select 1 from public.songs where id = p_song_id)
    into v_song_exists;

  if not v_song_exists then
    raise exception 'Choose a song from the catalog.';
  end if;

  select count(*) into v_open_by_singer
  from public.queue_requests
  where status in ('pending_payment', 'accepted') and singer_key = v_singer_key;

  if v_open_by_singer >= 1 then
    raise exception 'You already have an open request.';
  end if;

  select count(*) into v_open_by_device
  from public.queue_requests
  where status in ('pending_payment', 'accepted') and device_id = p_device_id;

  if v_open_by_device >= 2 then
    raise exception 'This device already has two open requests.';
  end if;

  select count(*) into v_recent_by_device
  from public.queue_requests
  where device_id = p_device_id
    and created_at > now() - interval '90 seconds';

  if v_recent_by_device >= 1 then
    raise exception 'Give the queue a minute before adding another song.';
  end if;

  insert into public.queue_requests (
    singer,
    singer_key,
    venmo_handle,
    song_id,
    request_type,
    device_id,
    status,
    venmo_memo,
    payment_amount
  )
  values (
    v_singer,
    v_singer_key,
    v_venmo_handle,
    p_song_id,
    'catalog',
    p_device_id,
    'pending_payment',
    public.make_venmo_memo(),
    7.00
  )
  returning * into v_request;

  return v_request;
end;
$$;

create or replace function public.request_write_in(
  p_singer text,
  p_title text,
  p_artist text,
  p_device_id text,
  p_venmo_handle text
) returns public.queue_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_singer text := trim(coalesce(p_singer, ''));
  v_singer_key text := lower(regexp_replace(trim(coalesce(p_singer, '')), '[^a-zA-Z0-9]+', '', 'g'));
  v_venmo_handle text := lower(regexp_replace(trim(coalesce(p_venmo_handle, '')), '^@', ''));
  v_title text := trim(coalesce(p_title, ''));
  v_artist text := trim(coalesce(p_artist, ''));
  v_open_by_singer integer;
  v_open_by_device integer;
  v_recent_by_device integer;
  v_request public.queue_requests;
begin
  if length(v_singer) < 2 or length(v_singer) > 60 then
    raise exception 'Use a real stage name between 2 and 60 characters.';
  end if;

  if v_venmo_handle !~ '^[a-z0-9_.-]{3,40}$' then
    raise exception 'Enter a valid Venmo handle.';
  end if;

  if length(coalesce(p_device_id, '')) < 16 then
    raise exception 'Refresh and try again.';
  end if;

  if length(v_title) < 2 or length(v_title) > 120 then
    raise exception 'Add a song title between 2 and 120 characters.';
  end if;

  if length(v_artist) < 2 or length(v_artist) > 120 then
    raise exception 'Add an artist between 2 and 120 characters.';
  end if;

  select count(*) into v_open_by_singer
  from public.queue_requests
  where status in ('pending_payment', 'accepted') and singer_key = v_singer_key;

  if v_open_by_singer >= 1 then
    raise exception 'You already have an open request.';
  end if;

  select count(*) into v_open_by_device
  from public.queue_requests
  where status in ('pending_payment', 'accepted') and device_id = p_device_id;

  if v_open_by_device >= 2 then
    raise exception 'This device already has two open requests.';
  end if;

  select count(*) into v_recent_by_device
  from public.queue_requests
  where device_id = p_device_id
    and created_at > now() - interval '90 seconds';

  if v_recent_by_device >= 1 then
    raise exception 'Give the queue a minute before adding another song.';
  end if;

  insert into public.queue_requests (
    singer,
    singer_key,
    venmo_handle,
    song_id,
    request_type,
    write_in_title,
    write_in_artist,
    device_id,
    status,
    venmo_memo,
    payment_amount
  )
  values (
    v_singer,
    v_singer_key,
    v_venmo_handle,
    null,
    'write_in',
    v_title,
    v_artist,
    p_device_id,
    'pending_payment',
    public.make_venmo_memo(),
    10.00
  )
  returning * into v_request;

  return v_request;
end;
$$;

drop function if exists public.host_queue(text);

create or replace function public.host_queue(p_host_code text)
returns table (
  id uuid,
  singer text,
  venmo_handle text,
  song_id text,
  request_type text,
  write_in_title text,
  write_in_artist text,
  status text,
  venmo_memo text,
  payment_amount numeric,
  created_at timestamptz,
  accepted_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    q.id,
    q.singer,
    q.venmo_handle,
    q.song_id,
    q.request_type,
    q.write_in_title,
    q.write_in_artist,
    q.status,
    q.venmo_memo,
    q.payment_amount,
    q.created_at,
    q.accepted_at
  from public.queue_requests q
  where public.host_code_matches(p_host_code)
    and q.status in ('pending_payment', 'accepted', 'refund_needed')
  order by
    case q.status
      when 'pending_payment' then 1
      when 'accepted' then 2
      when 'refund_needed' then 3
      else 4
    end,
    coalesce(q.accepted_at, q.created_at);
$$;

grant execute on function public.request_song(text, text, text, text) to anon;
grant execute on function public.request_write_in(text, text, text, text, text) to anon;
grant execute on function public.host_queue(text) to anon;
