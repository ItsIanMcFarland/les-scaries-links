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

grant execute on function public.request_write_in(text, text, text, text, text) to anon;
