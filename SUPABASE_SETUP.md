# Scaries Queue Backend Setup

The public site works as a Linktree-style landing page. The queue app runs in local demo mode until Supabase credentials are added.

## 1. Create the Backend

1. Create a Supabase project.
2. Open the Supabase SQL editor.
3. Run `supabase-schema.sql`.
4. In Supabase Realtime, confirm `public.queue_requests` is enabled.
5. Set the private host code:

```sql
update public.app_settings
set value = 'YOUR-HOST-CODE'
where key = 'host_code';
```

Requests must go through the `request_song` RPC. It validates:

- Singer name must be 2-60 characters.
- Venmo handle must look valid.
- Song must exist in `public.songs`.
- One open request per normalized singer name.
- Two open requests max per browser/device.
- 90-second cooldown per browser/device.

## 2. Connect the Site

Edit `supabase-config.js`:

```js
window.SCARIES_SUPABASE = {
  url: "https://YOUR_PROJECT.supabase.co",
  anonKey: "YOUR_PUBLIC_ANON_KEY",
  hostCodeHint: "",
};
```

Commit and push. GitHub Pages will switch from local demo mode to live synced queue mode.

## 3. Run the Night

- Public links page: `index.html`
- Request page: `signup.html`
- Public approved queue: `queue.html`
- Shared band door: `host.html`
- Local song catalog: `songs.html`

Everyone in the band can open `host.html` and use the same host code. With Supabase configured, every connected host device sees incoming requests in realtime.

The request flow creates a unique Venmo memo and keeps the singer out of the public queue until a host marks the request `Yes, add`.

The band door can mark requests:

- `Yes, add`: moves the singer into the public queue.
- `No, pass`: declines a pending request.
- `Needs refund`: flags a request the band cannot play after payment.
- `Open refund`: opens Venmo with the singer handle, amount, and refund memo.
- `Sent refund`: clears the request after refunding.
- `Sang it`: removes a completed singer from the public queue.

## Notes

Venmo does not expose a simple public confirmation API for this use case. This flow is payment-assisted: it generates the memo, sends the singer to Venmo, and gives the host an approval dashboard. The host still verifies the payment manually in Venmo before adding the singer.

This is anonymous browser-based validation. It prevents casual duplicate and back-to-back spam, but it cannot perfectly identify one human across multiple devices without authentication, check-in codes, or host approval.
