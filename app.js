const SONGS_URL = "songs.json";
const QUEUE_KEY = "scaries.queueDemo.v2";
const DEVICE_KEY = "scaries.deviceId.v1";
const HOST_KEY = "scaries.hostCode.v1";
const VENMO_HANDLE = "itsianmcfarland";
const REQUEST_AMOUNT = "5";

const state = {
  songs: [],
  selectedSong: null,
  queue: readQueue(),
  backend: "local",
  supabase: null,
  channel: null,
  deviceId: getDeviceId(),
  hostCode: localStorage.getItem(HOST_KEY) || "",
};

function getDeviceId() {
  let deviceId = localStorage.getItem(DEVICE_KEY);
  if (!deviceId) {
    deviceId = crypto.randomUUID();
    localStorage.setItem(DEVICE_KEY, deviceId);
  }
  return deviceId;
}

function readQueue() {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY)) || [];
  } catch {
    return [];
  }
}

function writeQueue() {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(state.queue));
}

function normalize(value) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function compactKey(value) {
  return normalize(value).replace(/\s+/g, "");
}

function scoreSong(song, query) {
  const haystack = normalize(`${song.title} ${song.artist} ${song.album}`);
  const needle = normalize(query);

  if (!needle) return 0;
  if (haystack === needle) return 100;
  if (haystack.startsWith(needle)) return 90;
  if (normalize(song.title).startsWith(needle)) return 86;
  if (haystack.includes(needle)) return 72;

  const terms = needle.split(" ").filter(Boolean);
  const matches = terms.filter((term) => haystack.includes(term)).length;
  return matches ? 45 + matches * 8 : 0;
}

function searchSongs(query, limit = 8) {
  return state.songs
    .map((song) => ({ song, score: scoreSong(song, query) }))
    .filter((result) => result.score > 0)
    .sort((a, b) => b.score - a.score || a.song.sort - b.song.sort)
    .slice(0, limit)
    .map((result) => result.song);
}

function songLabel(song) {
  return `${song.title} - ${song.artist}`;
}

function getSong(id) {
  return state.songs.find((song) => song.id === id);
}

function getEntrySongId(entry) {
  return entry.song_id || entry.songId;
}

function getEntryTime(entry) {
  return entry.created_at || entry.requestedAt || "";
}

function isHostPage() {
  return document.body.dataset.page === "host";
}

function isDoorOpenRoute() {
  return new URLSearchParams(window.location.search).get("door") === "open";
}

function isSupabaseConfigured() {
  const config = window.SCARIES_SUPABASE;
  return Boolean(config?.url && config?.anonKey && window.supabase?.createClient);
}

async function initBackend() {
  if (!isSupabaseConfigured()) {
    setBackendStatus("Local demo mode");
    await refreshData();
    return;
  }

  try {
    state.backend = "supabase";
    state.supabase = window.supabase.createClient(
      window.SCARIES_SUPABASE.url,
      window.SCARIES_SUPABASE.anonKey,
    );

    await refreshData();
    state.channel = state.supabase
      .channel("queue-requests")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "queue_requests" },
        () => refreshData(),
      )
      .subscribe();

    setBackendStatus("Live backend connected");
  } catch (error) {
    console.error(error);
    state.backend = "local";
    state.supabase = null;
    setBackendStatus("Local demo mode");
    await refreshData();
  }
}

function setBackendStatus(message) {
  document.querySelectorAll("[data-backend-status]").forEach((element) => {
    element.textContent = message;
  });
}

async function refreshData() {
  if (isHostPage()) {
    await loadHostQueue();
  } else {
    await loadPublicQueue();
  }
}

async function loadPublicQueue() {
  if (state.backend !== "supabase") {
    state.queue = readQueue().filter((entry) => entry.status === "accepted");
    renderQueue();
    return;
  }

  const { data, error } = await state.supabase
    .from("queue_requests")
    .select("id,singer,song_id,status,created_at")
    .eq("status", "accepted")
    .order("accepted_at", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });

  if (error) throw error;
  state.queue = data || [];
  renderQueue();
}

async function loadHostQueue() {
  if (!isDoorOpenRoute()) {
    renderHostLocked();
    return;
  }

  if (state.backend !== "supabase") {
    state.queue = readQueue().filter((entry) =>
      ["pending_payment", "accepted", "refund_needed"].includes(entry.status),
    );
    renderHostQueue();
    return;
  }

  if (!state.hostCode) {
    renderHostLocked();
    return;
  }

  const { data, error } = await state.supabase.rpc("host_queue", {
    p_host_code: state.hostCode,
  });

  if (error) {
    renderHostLocked(error.message);
    return;
  }

  state.queue = data || [];
  renderHostQueue();
}

async function createRequest({ singer, venmoHandle, song }) {
  if (state.backend !== "supabase") {
    const queue = readQueue();
    const activeBySinger = queue.filter(
      (entry) =>
        ["pending_payment", "accepted"].includes(entry.status) &&
        compactKey(entry.singer) === compactKey(singer),
    );
    const activeByDevice = queue.filter(
      (entry) =>
        ["pending_payment", "accepted"].includes(entry.status) &&
        entry.deviceId === state.deviceId,
    );

    if (activeBySinger.length >= 1) throw new Error("You already have an open request.");
    if (activeByDevice.length >= 2) throw new Error("This device already has two open requests.");

    const request = {
      id: crypto.randomUUID(),
      singer,
      singerKey: compactKey(singer),
      venmoHandle,
      songId: song.id,
      status: "pending_payment",
      venmoMemo: makeMemo(),
      paymentAmount: REQUEST_AMOUNT,
      deviceId: state.deviceId,
      requestedAt: new Date().toISOString(),
    };
    state.queue = queue;
    state.queue.push(request);
    writeQueue();
    return request;
  }

  const { data, error } = await state.supabase.rpc("request_song", {
    p_singer: singer,
    p_song_id: song.id,
    p_device_id: state.deviceId,
    p_venmo_handle: venmoHandle,
  });

  if (error) throw error;
  return data;
}

function makeMemo() {
  return `SCARIES-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

function venmoPayUrl({ recipient = VENMO_HANDLE, amount = REQUEST_AMOUNT, memo }) {
  const params = new URLSearchParams({
    txn: "pay",
    recipients: recipient.replace(/^@/, ""),
    amount,
    note: memo,
  });
  return `venmo://paycharge?${params.toString()}`;
}

function venmoWebUrl(recipient = VENMO_HANDLE) {
  return `https://account.venmo.com/u/${encodeURIComponent(recipient.replace(/^@/, ""))}`;
}

async function hostUpdate(id, status) {
  if (state.backend !== "supabase") {
    state.queue = readQueue().map((entry) =>
      entry.id === id
        ? {
            ...entry,
            status,
            acceptedAt: status === "accepted" ? new Date().toISOString() : entry.acceptedAt,
            updatedAt: new Date().toISOString(),
          }
        : entry,
    );
    writeQueue();
    await loadHostQueue();
    return;
  }

  const { error } = await state.supabase.rpc("host_update_request", {
    p_request_id: id,
    p_status: status,
    p_host_code: state.hostCode,
  });

  if (error) throw error;
  await loadHostQueue();
}

function initRequestForm() {
  const form = document.querySelector("[data-request-form]");
  const searchInput = document.querySelector("[data-song-search]");
  const singerInput = document.querySelector("[data-singer-name]");
  const venmoInput = document.querySelector("[data-venmo-handle]");
  const results = document.querySelector("[data-search-results]");
  const selected = document.querySelector("[data-selected-song]");
  const status = document.querySelector("[data-form-status]");
  const payment = document.querySelector("[data-payment-panel]");

  if (!form || !searchInput || !results) return;

  function setSelected(song) {
    state.selectedSong = song;
    searchInput.value = songLabel(song);
    selected.innerHTML = `
      <span>${escapeHtml(song.title)}</span>
      <small>${escapeHtml(song.artist)} - ${escapeHtml(song.id)}</small>
    `;
    selected.hidden = false;
    results.hidden = true;
    status.textContent = "";
  }

  function renderResults() {
    const query = searchInput.value;
    state.selectedSong = null;
    selected.hidden = true;

    if (query.trim().length < 2) {
      results.hidden = true;
      results.innerHTML = "";
      return;
    }

    const matches = searchSongs(query);
    results.innerHTML = matches
      .map(
        (song) => `
          <button type="button" class="song-result" data-song-id="${song.id}">
            <img src="${song.cover}" alt="" loading="lazy" />
            <span>
              <strong>${escapeHtml(song.title)}</strong>
              <small>${escapeHtml(song.artist)}</small>
            </span>
          </button>
        `,
      )
      .join("");
    results.hidden = matches.length === 0;
  }

  searchInput.addEventListener("input", renderResults);

  results.addEventListener("click", (event) => {
    const button = event.target.closest("[data-song-id]");
    if (!button) return;
    const song = getSong(button.dataset.songId);
    if (song) setSelected(song);
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const singer = singerInput.value.trim();
    const venmoHandle = venmoInput.value.trim().replace(/^@/, "");
    const song = state.selectedSong;

    if (!singer) {
      status.textContent = "Add your name first.";
      singerInput.focus();
      return;
    }

    if (!venmoHandle) {
      status.textContent = "Add your Venmo handle so refunds are easy.";
      venmoInput.focus();
      return;
    }

    if (!song) {
      status.textContent = "Choose a song from the search results.";
      searchInput.focus();
      return;
    }

    try {
      status.textContent = "Creating payment memo...";
      const request = await createRequest({ singer, venmoHandle, song });
      form.reset();
      state.selectedSong = null;
      selected.hidden = true;
      results.hidden = true;
      status.textContent = "Request created. Venmo with the memo below.";
      renderPaymentPanel(payment, request, song);
    } catch (error) {
      status.textContent = error.message || "Could not create that request.";
    }
  });
}

function renderPaymentPanel(panel, request, song) {
  if (!panel) return;
  const memo = request.venmo_memo || request.venmoMemo;
  const amount = String(request.payment_amount || request.paymentAmount || REQUEST_AMOUNT);
  const payUrl = venmoPayUrl({ amount, memo });

  panel.hidden = false;
  panel.innerHTML = `
    <h2>Venmo to finish</h2>
    <p>Your request is pending until the host sees the Venmo payment.</p>
    <div class="payment-code">
      <span>Memo</span>
      <strong>${escapeHtml(memo)}</strong>
    </div>
    <div class="payment-code">
      <span>Amount</span>
      <strong>$${escapeHtml(amount)}</strong>
    </div>
    <p>${escapeHtml(song.title)} - ${escapeHtml(song.artist)}</p>
    <div class="actions">
      <a class="button" href="${payUrl}">Open Venmo</a>
      <a class="button secondary" href="${venmoWebUrl()}">Venmo Profile</a>
    </div>
  `;
}

function renderQueue() {
  const list = document.querySelector("[data-queue-list]");
  const empty = document.querySelector("[data-empty-queue]");
  const count = document.querySelector("[data-queue-count]");

  if (!list) return;

  if (count) {
    count.textContent = `${state.queue.length} ${state.queue.length === 1 ? "singer" : "singers"}`;
  }

  empty.hidden = state.queue.length > 0;
  list.innerHTML = state.queue
    .map((entry, index) => {
      const song = getSong(getEntrySongId(entry));
      return `
        <li class="queue-item">
          <span class="queue-number">${index + 1}</span>
          <span class="queue-copy">
            <strong>${escapeHtml(entry.singer)}</strong>
            <span>${song ? escapeHtml(song.title) : "Unknown song"}</span>
            <small>${song ? `${escapeHtml(song.artist)} - ${escapeHtml(song.id)}` : escapeHtml(getEntrySongId(entry))}</small>
          </span>
          <span class="queue-time">${formatQueueTime(getEntryTime(entry))}</span>
        </li>
      `;
    })
    .join("");
}

function initHost() {
  const form = document.querySelector("[data-host-login]");
  const input = document.querySelector("[data-host-code]");
  const refresh = document.querySelector("[data-host-refresh]");
  const gate = document.querySelector("[data-host-gate]");
  const dashboard = document.querySelector("[data-host-dashboard]");
  const list = document.querySelector("[data-host-list]");

  if (!form) return;

  if (isDoorOpenRoute()) {
    if (gate) gate.hidden = true;
    if (dashboard) dashboard.hidden = false;
    if (list) list.hidden = false;
  } else {
    if (gate) gate.hidden = false;
    if (dashboard) dashboard.hidden = true;
    if (list) list.hidden = true;
  }

  input.value = state.hostCode;
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    state.hostCode = input.value.trim();
    localStorage.setItem(HOST_KEY, state.hostCode);
    window.location.href = `${window.location.pathname}?door=open`;
  });

  refresh?.addEventListener("click", () => loadHostQueue());
}

function renderHostLocked(message = "Enter the host code to run the door.") {
  const list = document.querySelector("[data-host-list]");
  const status = document.querySelector("[data-host-status]");
  const dashboardStatus = document.querySelector("[data-host-dashboard-status]");
  const stats = document.querySelector("[data-host-stats]");
  const gate = document.querySelector("[data-host-gate]");
  const dashboard = document.querySelector("[data-host-dashboard]");
  if (status) status.textContent = message;
  if (dashboardStatus) dashboardStatus.textContent = message;
  if (list) list.innerHTML = "";
  if (!isDoorOpenRoute()) {
    if (gate) gate.hidden = false;
    if (dashboard) dashboard.hidden = true;
    if (list) list.hidden = true;
  }
  if (stats) {
    stats.hidden = true;
    stats.innerHTML = "";
  }
}

function renderHostQueue() {
  const list = document.querySelector("[data-host-list]");
  const status = document.querySelector("[data-host-status]");
  const dashboardStatus = document.querySelector("[data-host-dashboard-status]");
  const stats = document.querySelector("[data-host-stats]");
  const gate = document.querySelector("[data-host-gate]");
  const dashboard = document.querySelector("[data-host-dashboard]");
  if (!list) return;

  if (gate) gate.hidden = true;
  if (dashboard) dashboard.hidden = false;
  list.hidden = false;

  const counts = {
    pending: state.queue.filter((entry) => entry.status === "pending_payment").length,
    accepted: state.queue.filter((entry) => entry.status === "accepted").length,
    refunds: state.queue.filter((entry) => entry.status === "refund_needed").length,
  };

  if (status) {
    status.textContent =
      state.backend === "supabase"
        ? "Live door is open."
        : "Local demo door is open.";
  }
  if (dashboardStatus) {
    dashboardStatus.textContent =
      state.backend === "supabase"
        ? "Live door is open."
        : "Local demo door is open.";
  }

  if (stats) {
    stats.hidden = false;
    stats.innerHTML = `
      <div class="door-stat">
        <strong>${counts.pending}</strong>
        <span>Need yes/no</span>
      </div>
      <div class="door-stat">
        <strong>${counts.accepted}</strong>
        <span>In queue</span>
      </div>
      <div class="door-stat">
        <strong>${counts.refunds}</strong>
        <span>Refunds</span>
      </div>
    `;
  }

  if (state.queue.length === 0) {
    list.innerHTML = `
      <section class="door-section">
        <div class="section-head">
          <div>
            <h3>Requests Pending</h3>
            <p>New singers waiting for a yes or no.</p>
          </div>
        </div>
        <p class="empty-door">No requests pending right now.</p>
      </section>
      <section class="door-section">
        <div class="section-head">
          <div>
            <h3>Requests In Queue</h3>
            <p>Approved singers ready to be called up.</p>
          </div>
        </div>
        <p class="empty-door">No singers in the queue yet.</p>
      </section>
    `;
    return;
  }

  const pendingEntries = state.queue.filter((entry) => entry.status === "pending_payment");
  const acceptedEntries = state.queue.filter((entry) => entry.status === "accepted");
  const refundEntries = state.queue.filter((entry) => entry.status === "refund_needed");

  list.innerHTML = `
    <section class="door-section">
      <div class="section-head">
        <div>
          <h3>Requests Pending</h3>
          <p>New singers waiting for a yes or no.</p>
        </div>
        <span class="status-pill">${pendingEntries.length}</span>
      </div>
      <div class="door-section-list">
        ${
          pendingEntries.length
            ? pendingEntries.map(renderHostCard).join("")
            : `<p class="empty-door">No requests pending right now.</p>`
        }
      </div>
    </section>
    <section class="door-section">
      <div class="section-head">
        <div>
          <h3>Requests In Queue</h3>
          <p>Approved singers ready to be called up.</p>
        </div>
        <span class="status-pill">${acceptedEntries.length}</span>
      </div>
      <div class="door-section-list">
        ${
          acceptedEntries.length
            ? acceptedEntries.map(renderHostCard).join("")
            : `<p class="empty-door">No singers in the queue yet.</p>`
        }
      </div>
    </section>
    <section class="door-section">
      <div class="section-head">
        <div>
          <h3>Refunds</h3>
          <p>Paid requests that need money sent back.</p>
        </div>
        <span class="status-pill">${refundEntries.length}</span>
      </div>
      <div class="door-section-list">
        ${
          refundEntries.length
            ? refundEntries.map(renderHostCard).join("")
            : `<p class="empty-door">No refunds waiting.</p>`
        }
      </div>
    </section>
  `;

  list.querySelectorAll("[data-host-action]").forEach((button) => {
    button.addEventListener("click", async () => {
      button.disabled = true;
      try {
        await hostUpdate(button.dataset.requestId, button.dataset.hostAction);
      } catch (error) {
        if (dashboardStatus) dashboardStatus.textContent = error.message || "Host update failed.";
        if (status) status.textContent = error.message || "Host update failed.";
      } finally {
        button.disabled = false;
      }
    });
  });
}

function renderHostCard(entry) {
  const song = getSong(getEntrySongId(entry));
  const memo = entry.venmo_memo || entry.venmoMemo || "";
  const venmo = entry.venmo_handle || entry.venmoHandle || "";
  const amount = String(entry.payment_amount || entry.paymentAmount || REQUEST_AMOUNT);
  const refundMemo = `Refund ${memo} - ${song ? song.title : "Scaries request"}`;

  return `
    <article class="host-card ${escapeHtml(entry.status)}">
      <div class="host-topline">
        <strong>${escapeHtml(entry.singer || "Unknown singer")}</strong>
        <span class="status-pill">${escapeHtml(statusLabel(entry.status))}</span>
      </div>
      <div>
        <span>${song ? escapeHtml(song.title) : "Unknown song"}</span>
        <small>${song ? escapeHtml(song.artist) : escapeHtml(getEntrySongId(entry))}</small>
      </div>
      <div class="host-meta">
        <code>${escapeHtml(memo)}</code>
        <span>$${escapeHtml(amount)}</span>
        <a href="${venmoWebUrl(venmo)}">@${escapeHtml(venmo)}</a>
      </div>
      <div class="host-actions">
        <button class="yes" type="button" data-host-action="accepted" data-request-id="${entry.id}">Yes, add</button>
        <button class="no" type="button" data-host-action="rejected" data-request-id="${entry.id}">No, pass</button>
        <button class="warn" type="button" data-host-action="refund_needed" data-request-id="${entry.id}">Needs refund</button>
        <a class="button secondary" href="${venmoPayUrl({
          recipient: venmo,
          amount,
          memo: refundMemo,
        })}">Open refund</a>
        <button class="secondary" type="button" data-host-action="refunded" data-request-id="${entry.id}">Sent refund</button>
        <button class="secondary" type="button" data-host-action="done" data-request-id="${entry.id}">Sang it</button>
      </div>
    </article>
  `;
}

function statusLabel(status) {
  return {
    pending_payment: "At the door",
    accepted: "In queue",
    rejected: "Passed",
    refund_needed: "Needs refund",
    refunded: "Refunded",
    done: "Done",
    removed: "Removed",
  }[status] || status;
}

function formatQueueTime(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat([], {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function renderSongList() {
  const list = document.querySelector("[data-song-list]");
  const search = document.querySelector("[data-catalog-search]");
  const count = document.querySelector("[data-song-count]");

  if (!list) return;

  function draw(songs) {
    if (count) count.textContent = `${songs.length} songs`;
    list.innerHTML = songs
      .map(
        (song) => `
          <article class="catalog-song">
            <img src="${song.cover}" alt="" loading="lazy" />
            <span>
              <strong>${escapeHtml(song.title)}</strong>
              <small>${escapeHtml(song.artist)}</small>
              <code>${escapeHtml(song.id)}</code>
            </span>
          </article>
        `,
      )
      .join("");
  }

  search?.addEventListener("input", () => {
    const query = search.value.trim();
    draw(query ? searchSongs(query, 100) : state.songs);
  });

  draw(state.songs);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function boot() {
  const response = await fetch(SONGS_URL);
  const catalog = await response.json();
  state.songs = catalog.songs;
  await initBackend();

  initRequestForm();
  initHost();
  renderQueue();
  renderSongList();
}

boot().catch((error) => {
  console.error(error);
  const status = document.querySelector("[data-form-status]");
  if (status) status.textContent = "Song catalog could not load.";
});
