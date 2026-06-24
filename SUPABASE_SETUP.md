# Scaries Realtime Queue Setup

The site runs in local demo mode until Supabase credentials are added.

## 1. Create the backend

1. Create a Supabase project.
2. Open the Supabase SQL editor.
3. Run `supabase-schema.sql`.
4. In Supabase Realtime, confirm `public.queue_requests` is enabled.

The schema blocks direct anonymous inserts. Requests must go through the `request_song` RPC, which validates:

- Singer name must be 2-60 characters.
- Song must exist in `public.songs`.
- One active request per normalized singer name.
- Two active requests max per browser/device.
- 90-second cooldown per browser/device.

Public clients can add requests but cannot directly insert, clear, or remove queue rows.
Until there is an authenticated host view, mark rows `done` or `removed` from the
Supabase table editor.

## 2. Connect the site

Edit `supabase-config.js`:

```js
window.SCARIES_SUPABASE = {
  url: "https://YOUR_PROJECT.supabase.co",
  anonKey: "YOUR_PUBLIC_ANON_KEY",
};
```

Commit and push. GitHub Pages will switch from local demo mode to live synced queue mode.

## Notes

This is anonymous browser-based validation. It prevents casual duplicate and back-to-back spam, but it cannot perfectly identify one human across multiple devices without authentication, check-in codes, or host approval.
