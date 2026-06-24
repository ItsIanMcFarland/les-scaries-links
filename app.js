const SONGS_URL = "songs.json";
const QUEUE_KEY = "scaries.activeQueue.v1";
const DEVICE_KEY = "scaries.deviceId.v1";

const state = {
  songs: [],
  selectedSong: null,
  queue: readQueue(),
  backend: "local",
  supabase: null,
  channel: null,
  deviceId: getDeviceId(),
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

function isSupabaseConfigured() {
  const config = window.SCARIES_SUPABASE;
  return Boolean(config?.url && config?.anonKey && window.supabase?.createClient);
}

async function initBackend() {
  if (!isSupabaseConfigured()) {
    setBackendStatus("Local demo queue");
    return;
  }

  try {
    state.backend = "supabase";
    state.supabase = window.supabase.createClient(
      window.SCARIES_SUPABASE.url,
      window.SCARIES_SUPABASE.anonKey,
    );

    await loadRemoteQueue();
    state.channel = state.supabase
      .channel("active-queue")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "queue_requests" },
        () => loadRemoteQueue(),
      )
      .subscribe();

    setBackendStatus("Live queue synced");
  } catch (error) {
    console.error(error);
    state.backend = "local";
    state.supabase = null;
    state.queue = readQueue();
    setBackendStatus("Local demo queue");
  }
}

function setBackendStatus(message) {
  document.querySelectorAll("[data-backend-status]").forEach((element) => {
    element.textContent = message;
  });

  document.querySelectorAll("[data-local-only]").forEach((element) => {
    element.hidden = state.backend === "supabase";
  });
}

async function loadRemoteQueue() {
  const { data, error } = await state.supabase
    .from("queue_requests")
    .select("id,singer,song_id,status,created_at")
    .eq("status", "active")
    .order("created_at", { ascending: true });

  if (error) throw error;
  state.queue = data || [];
  renderQueue();
}

async function addQueueEntry(singer, song) {
  if (state.backend !== "supabase") {
    state.queue.push({
      id: crypto.randomUUID(),
      singer,
      songId: song.id,
      requestedAt: new Date().toISOString(),
    });
    writeQueue();
    renderQueue();
    return;
  }

  const { error } = await state.supabase.rpc("request_song", {
    p_singer: singer,
    p_song_id: song.id,
    p_device_id: state.deviceId,
  });

  if (error) throw error;
  await loadRemoteQueue();
}

async function removeQueueEntry(id) {
  if (state.backend !== "supabase") {
    state.queue = state.queue.filter((entry) => entry.id !== id);
    writeQueue();
    renderQueue();
    return;
  }

  const { error } = await state.supabase
    .from("queue_requests")
    .update({ status: "removed", updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) throw error;
  await loadRemoteQueue();
}

async function clearQueue() {
  if (state.backend !== "supabase") {
    state.queue = [];
    writeQueue();
    renderQueue();
    return;
  }

  const { error } = await state.supabase
    .from("queue_requests")
    .update({ status: "removed", updated_at: new Date().toISOString() })
    .eq("status", "active");

  if (error) throw error;
  await loadRemoteQueue();
}

function initSearchForm(options = {}) {
  const form = document.querySelector("[data-request-form]");
  const searchInput = document.querySelector("[data-song-search]");
  const singerInput = document.querySelector("[data-singer-name]");
  const results = document.querySelector("[data-search-results]");
  const selected = document.querySelector("[data-selected-song]");
  const status = document.querySelector("[data-form-status]");

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
    const song = state.selectedSong;

    if (!singer) {
      status.textContent = "Add your name first.";
      singerInput.focus();
      return;
    }

    if (!song) {
      status.textContent = "Choose a song from the search results.";
      searchInput.focus();
      return;
    }

    try {
      status.textContent = "Adding...";
      await addQueueEntry(singer, song);
      form.reset();
      state.selectedSong = null;
      selected.hidden = true;
      results.hidden = true;
      status.textContent = `${song.title} is in the queue.`;

      if (options.redirectToQueue) {
        window.location.href = "index.html";
      }
    } catch (error) {
      status.textContent = error.message || "Could not add that request.";
    }
  });
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
          ${
            state.backend === "local"
              ? `<button type="button" class="icon-button" data-remove-entry="${entry.id}" aria-label="Remove ${escapeHtml(entry.singer)}">x</button>`
              : `<span class="queue-time">${formatQueueTime(getEntryTime(entry))}</span>`
          }
        </li>
      `;
    })
    .join("");
}

function formatQueueTime(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat([], {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function initQueueControls() {
  const list = document.querySelector("[data-queue-list]");
  const clear = document.querySelector("[data-clear-queue]");

  list?.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-remove-entry]");
    if (!button) return;
    await removeQueueEntry(button.dataset.removeEntry);
  });

  clear?.addEventListener("click", async () => {
    await clearQueue();
  });
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

  initSearchForm({ redirectToQueue: document.body.dataset.page === "request" });
  initQueueControls();
  renderQueue();
  renderSongList();
}

boot().catch((error) => {
  console.error(error);
  const status = document.querySelector("[data-form-status]");
  if (status) status.textContent = "Song catalog could not load.";
});
