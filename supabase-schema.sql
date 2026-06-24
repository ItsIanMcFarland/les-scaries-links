create table if not exists public.songs (
  id text primary key,
  title text not null,
  artist text not null,
  album text not null default '',
  spotify_url text not null default '',
  cover text not null default '',
  sort integer not null default 0
);

create table if not exists public.app_settings (
  key text primary key,
  value text not null
);

create table if not exists public.queue_requests (
  id uuid primary key default gen_random_uuid(),
  singer text not null,
  singer_key text not null,
  venmo_handle text not null,
  song_id text not null references public.songs(id),
  device_id text not null,
  status text not null default 'pending_payment' check (
    status in (
      'pending_payment',
      'accepted',
      'rejected',
      'refund_needed',
      'refunded',
      'done',
      'removed'
    )
  ),
  venmo_memo text not null unique,
  payment_amount numeric(6, 2) not null default 5.00,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists queue_requests_accepted_idx
  on public.queue_requests (accepted_at, created_at)
  where status = 'accepted';

create index if not exists queue_requests_device_open_idx
  on public.queue_requests (device_id)
  where status in ('pending_payment', 'accepted');

create index if not exists queue_requests_singer_open_idx
  on public.queue_requests (singer_key)
  where status in ('pending_payment', 'accepted');

alter table public.songs enable row level security;
alter table public.app_settings enable row level security;
alter table public.queue_requests enable row level security;

grant select on public.songs to anon;
grant select on public.queue_requests to anon;
revoke insert, update, delete on public.queue_requests from anon;
revoke all on public.app_settings from anon;

drop policy if exists "songs are public" on public.songs;
create policy "songs are public"
  on public.songs for select
  to anon
  using (true);

drop policy if exists "active queue is public" on public.queue_requests;
drop policy if exists "queue changes are public" on public.queue_requests;
create policy "accepted queue is public"
  on public.queue_requests for select
  to anon
  using (status = 'accepted');

do $$
begin
  alter publication supabase_realtime add table public.queue_requests;
exception
  when duplicate_object then null;
end $$;

insert into public.app_settings (key, value)
values ('host_code', 'CHANGE-ME')
on conflict (key) do nothing;

insert into public.songs (id, title, artist, album, spotify_url, cover, sort) values
  ('003vvx7Niy0yvhvHt4a68B', 'Mr. Brightside', 'The Killers', 'Hot Fuss', 'https://open.spotify.com/track/003vvx7Niy0yvhvHt4a68B', 'https://i.scdn.co/image/ab67616d00001e02ccdddd46119a4ff53eaf1f5d', 1),
  ('25FTMokYEbEWHEdss5JLZS', 'Teenage Dirtbag', 'Wheatus', 'Wheatus', 'https://open.spotify.com/track/25FTMokYEbEWHEdss5JLZS', 'https://i.scdn.co/image/ab67616d00001e020a3740efa638f10f14fabc46', 2),
  ('2iUmqdfGZcHIhS3b9E9EWq', 'Everybody Talks', 'Neon Trees', 'Picture Show', 'https://open.spotify.com/track/2iUmqdfGZcHIhS3b9E9EWq', 'https://i.scdn.co/image/ab67616d00001e024a6c0376235e5aa44e59d2c2', 3),
  ('3fH4KjXFYMmljxrcGrbPj9', 'Don''t You (Forget About Me)', 'Simple Minds', 'Once Upon A Time (Super Deluxe)', 'https://open.spotify.com/track/3fH4KjXFYMmljxrcGrbPj9', 'https://i.scdn.co/image/ab67616d00001e025695a657aef0e81bde0c6001', 4),
  ('1k2pQc5i348DCHwbn5KTdc', 'Pink Pony Club', 'Chappell Roan', 'The Rise and Fall of a Midwest Princess', 'https://open.spotify.com/track/1k2pQc5i348DCHwbn5KTdc', 'https://i.scdn.co/image/ab67616d00001e0296fa88fb1789be437d5cb4b6', 5),
  ('27L8sESb3KR79asDUBu8nW', 'Stacy''s Mom', 'Fountains Of Wayne', 'Welcome Interstate Managers', 'https://open.spotify.com/track/27L8sESb3KR79asDUBu8nW', 'https://i.scdn.co/image/ab67616d00001e02079e826265dffc3a8a26bac5', 6),
  ('4xdBrk0nFZaP54vvZj0yx7', 'HOT TO GO!', 'Chappell Roan', 'The Rise and Fall of a Midwest Princess', 'https://open.spotify.com/track/4xdBrk0nFZaP54vvZj0yx7', 'https://i.scdn.co/image/ab67616d00001e0296fa88fb1789be437d5cb4b6', 7),
  ('7FOgcfdz9Nx5V9lCNXdBYv', 'Red Wine Supernova', 'Chappell Roan', 'The Rise and Fall of a Midwest Princess', 'https://open.spotify.com/track/7FOgcfdz9Nx5V9lCNXdBYv', 'https://i.scdn.co/image/ab67616d00001e0296fa88fb1789be437d5cb4b6', 8),
  ('6GG73Jik4jUlQCkKg9JuGO', 'The Middle', 'Jimmy Eat World', 'Bleed American', 'https://open.spotify.com/track/6GG73Jik4jUlQCkKg9JuGO', 'https://i.scdn.co/image/ab67616d00001e0295d1d98c5176e4f982bd73d6', 9),
  ('5G2f63n7IPVPPjfNIGih7Q', 'Taste', 'Sabrina Carpenter', 'Short n'' Sweet', 'https://open.spotify.com/track/5G2f63n7IPVPPjfNIGih7Q', 'https://i.scdn.co/image/ab67616d00001e02fd8d7a8d96871e791cb1f626', 10),
  ('4c6vZqYHFur11FbWATIJ9P', 'There She Goes', 'The La''s', 'The La''s', 'https://open.spotify.com/track/4c6vZqYHFur11FbWATIJ9P', 'https://i.scdn.co/image/ab67616d00001e020e42d457a15ef2f133976f6b', 11),
  ('754kgU5rWscRTfvlsuEwFp', 'Kiss Me', 'Sixpence None The Richer', 'Sixpence None The Richer', 'https://open.spotify.com/track/754kgU5rWscRTfvlsuEwFp', 'https://i.scdn.co/image/ab67616d00001e02cfc5eea6cfd77e89ed3ac5a4', 12),
  ('2hKdd3qO7cWr2Jo0Bcs0MA', 'Drops of Jupiter (Tell Me)', 'Train', 'Drops Of Jupiter', 'https://open.spotify.com/track/2hKdd3qO7cWr2Jo0Bcs0MA', 'https://i.scdn.co/image/ab67616d00001e021a0278d4109c0f974821aa33', 13),
  ('6ORqU0bHbVCRjXm9AjyHyZ', 'Good Riddance (Time of Your Life)', 'Green Day', 'Nimrod', 'https://open.spotify.com/track/6ORqU0bHbVCRjXm9AjyHyZ', 'https://i.scdn.co/image/ab67616d00001e02da4f6706ae0f2501c61ce776', 14),
  ('1fDsrQ23eTAVFElUMaf38X', 'American Pie', 'Don McLean', 'American Pie', 'https://open.spotify.com/track/1fDsrQ23eTAVFElUMaf38X', 'https://i.scdn.co/image/ab67616d00001e020085dd4362653ef4c54ebbeb', 15),
  ('2TfSHkHiFO4gRztVIkggkE', 'Sugar, We''re Goin Down', 'Fall Out Boy', 'From Under The Cork Tree', 'https://open.spotify.com/track/2TfSHkHiFO4gRztVIkggkE', 'https://i.scdn.co/image/ab67616d00001e0271565eda831124be86c603d5', 16),
  ('5lDriBxJd22IhOH9zTcFrV', 'Dirty Little Secret', 'The All-American Rejects', 'Move Along', 'https://open.spotify.com/track/5lDriBxJd22IhOH9zTcFrV', 'https://i.scdn.co/image/ab67616d00001e02aaf8c068ffe217db825a1945', 17),
  ('1fBl642IhJOE5U319Gy2Go', 'Animal', 'Neon Trees', 'Habits', 'https://open.spotify.com/track/1fBl642IhJOE5U319Gy2Go', 'https://i.scdn.co/image/ab67616d00001e0226ca7305db69aa21efcf2b7a', 18),
  ('2m1hi0nfMR9vdGC8UcrnwU', 'All The Small Things', 'blink-182', 'Enema Of The State', 'https://open.spotify.com/track/2m1hi0nfMR9vdGC8UcrnwU', 'https://i.scdn.co/image/ab67616d00001e026da502e35a7a3e48de2b0f74', 19),
  ('756CJtQRFSxEx9jV4P9hpA', 'I Believe in a Thing Called Love', 'The Darkness', 'Permission to Land', 'https://open.spotify.com/track/756CJtQRFSxEx9jV4P9hpA', 'https://i.scdn.co/image/ab67616d00001e0228fc13c41950199c0a49424f', 20),
  ('0JJP0IS4w0fJx01EcrfkDe', 'Dear Maria, Count Me In', 'All Time Low', 'So Wrong, It''s Right', 'https://open.spotify.com/track/0JJP0IS4w0fJx01EcrfkDe', 'https://i.scdn.co/image/ab67616d00001e02c8913cd7b91bb7f6bbbec305', 21),
  ('5oQcOu1omDykbIPSdSQQNJ', '1985', 'Bowling For Soup', 'A Hangover You Don''t Deserve', 'https://open.spotify.com/track/5oQcOu1omDykbIPSdSQQNJ', 'https://i.scdn.co/image/ab67616d00001e02f9b3ece3271d3a5fa73d3759', 22),
  ('4bPQs0PHn4xbipzdPfn6du', 'I Write Sins Not Tragedies', 'Panic! At The Disco', 'A Fever You Can''t Sweat Out', 'https://open.spotify.com/track/4bPQs0PHn4xbipzdPfn6du', 'https://i.scdn.co/image/ab67616d00001e023ab3ff3559d2664560e1fdb4', 23),
  ('1Dr1fXbc2IxaK1Mu8P8Khz', 'When I Come Around', 'Green Day', 'Dookie', 'https://open.spotify.com/track/1Dr1fXbc2IxaK1Mu8P8Khz', 'https://i.scdn.co/image/ab67616d00001e02db89b08034de626ebee6823d', 24),
  ('6nTiIhLmQ3FWhvrGafw2zj', 'American Idiot', 'Green Day', 'American Idiot', 'https://open.spotify.com/track/6nTiIhLmQ3FWhvrGafw2zj', 'https://i.scdn.co/image/ab67616d00001e0208a1b1e0674086d3f1995e1b', 25),
  ('33iv3wnGMrrDugd7GBso1z', 'My Own Worst Enemy', 'Lit', 'A Place In The Sun', 'https://open.spotify.com/track/33iv3wnGMrrDugd7GBso1z', 'https://i.scdn.co/image/ab67616d00001e027b40b2abdbcb8520874f29ed', 26),
  ('1FTSo4v6BOZH9QxKc3MbVM', 'Song 2 - 2012 Remaster', 'Blur', 'Blur (Special Edition)', 'https://open.spotify.com/track/1FTSo4v6BOZH9QxKc3MbVM', 'https://i.scdn.co/image/ab67616d00001e02de114203356c1f7b136960b6', 27),
  ('3d9DChrdc6BOeFsbrZ3Is0', 'Under the Bridge', 'Red Hot Chili Peppers', 'Blood Sugar Sex Magik (Deluxe Edition)', 'https://open.spotify.com/track/3d9DChrdc6BOeFsbrZ3Is0', 'https://i.scdn.co/image/ab67616d00001e02153d79816d853f2694b2cc70', 28),
  ('6WkSUgo1VdpzgtiXKlFPcY', 'Dammit', 'blink-182', 'Dude Ranch', 'https://open.spotify.com/track/6WkSUgo1VdpzgtiXKlFPcY', 'https://i.scdn.co/image/ab67616d00001e02330500a40905b093b134396a', 29),
  ('0zY7SkbIByXGKak663jHuI', 'Original Fire', 'Audioslave', 'Revelations', 'https://open.spotify.com/track/0zY7SkbIByXGKak663jHuI', 'https://i.scdn.co/image/ab67616d00001e022b8ac52203215122968d4d6a', 30)
on conflict (id) do update set
  title = excluded.title,
  artist = excluded.artist,
  album = excluded.album,
  spotify_url = excluded.spotify_url,
  cover = excluded.cover,
  sort = excluded.sort;

create or replace function public.make_venmo_memo()
returns text
language sql
as $$
  select 'SCARIES-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
$$;

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
    device_id,
    status,
    venmo_memo
  )
  values (
    v_singer,
    v_singer_key,
    v_venmo_handle,
    p_song_id,
    p_device_id,
    'pending_payment',
    public.make_venmo_memo()
  )
  returning * into v_request;

  return v_request;
end;
$$;

create or replace function public.host_code_matches(p_host_code text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.app_settings
    where key = 'host_code'
      and value = coalesce(p_host_code, '')
      and value <> 'CHANGE-ME'
  );
$$;

create or replace function public.host_queue(p_host_code text)
returns table (
  id uuid,
  singer text,
  venmo_handle text,
  song_id text,
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

create or replace function public.host_update_request(
  p_request_id uuid,
  p_status text,
  p_host_code text
) returns public.queue_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.queue_requests;
begin
  if not public.host_code_matches(p_host_code) then
    raise exception 'Invalid host code.';
  end if;

  if p_status not in ('accepted', 'rejected', 'refund_needed', 'refunded', 'done', 'removed') then
    raise exception 'Invalid status.';
  end if;

  update public.queue_requests
  set
    status = p_status,
    accepted_at = case
      when p_status = 'accepted' and accepted_at is null then now()
      else accepted_at
    end,
    updated_at = now()
  where id = p_request_id
  returning * into v_request;

  if v_request.id is null then
    raise exception 'Request not found.';
  end if;

  return v_request;
end;
$$;

grant execute on function public.request_song(text, text, text, text) to anon;
grant execute on function public.host_queue(text) to anon;
grant execute on function public.host_update_request(uuid, text, text) to anon;
