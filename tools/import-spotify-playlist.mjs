import fs from "node:fs/promises";

const PLAYLIST_ID = process.env.SPOTIFY_PLAYLIST_ID || "4KyUr7vipHnMKR1Wc5ZtrO";
const SOURCE_URL = `https://open.spotify.com/playlist/${PLAYLIST_ID}`;
const SONGS_PATH = new URL("../songs.json", import.meta.url);
const SQL_PATH = new URL("../supabase-songs-upsert.sql", import.meta.url);

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}.`);
  return value;
}

function sqlString(value) {
  return `'${String(value || "").replaceAll("'", "''")}'`;
}

async function getToken() {
  const clientId = requireEnv("SPOTIFY_CLIENT_ID");
  const clientSecret = requireEnv("SPOTIFY_CLIENT_SECRET");
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ grant_type: "client_credentials" }),
  });

  if (!response.ok) {
    throw new Error(`Spotify token failed: ${response.status} ${await response.text()}`);
  }

  return (await response.json()).access_token;
}

async function fetchPlaylist(token) {
  let url = `https://api.spotify.com/v1/playlists/${PLAYLIST_ID}/tracks?limit=100&market=US`;
  const songs = [];
  let total = 0;

  while (url) {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      throw new Error(`Spotify playlist fetch failed: ${response.status} ${await response.text()}`);
    }

    const page = await response.json();
    total = page.total;
    for (const item of page.items || []) {
      const track = item.track;
      if (!track || track.type !== "track" || !track.id) continue;
      songs.push({
        id: track.id,
        uri: track.uri,
        title: track.name,
        artist: (track.artists || []).map((artist) => artist.name).join(", "),
        album: track.album?.name || "",
        spotifyUrl: track.external_urls?.spotify || `https://open.spotify.com/track/${track.id}`,
        cover:
          track.album?.images?.find((image) => image.width === 300)?.url ||
          track.album?.images?.at(-1)?.url ||
          "",
        sort: songs.length + 1,
      });
    }
    url = page.next;
  }

  return { songs, total };
}

function buildSql(songs) {
  const rows = songs
    .map(
      (song) =>
        `  (${sqlString(song.id)}, ${sqlString(song.title)}, ${sqlString(song.artist)}, ${sqlString(song.album)}, ${sqlString(song.spotifyUrl)}, ${sqlString(song.cover)}, ${song.sort})`,
    )
    .join(",\n");

  return `insert into public.songs (id, title, artist, album, spotify_url, cover, sort) values\n${rows}\non conflict (id) do update set\n  title = excluded.title,\n  artist = excluded.artist,\n  album = excluded.album,\n  spotify_url = excluded.spotify_url,\n  cover = excluded.cover,\n  sort = excluded.sort;\n`;
}

const token = await getToken();
const { songs, total } = await fetchPlaylist(token);
const payload = {
  sourcePlaylistId: PLAYLIST_ID,
  sourceName: "Sunday Scaries",
  sourceUrl: SOURCE_URL,
  importedAt: new Date().toISOString().slice(0, 10),
  totalAvailable: total,
  importedCount: songs.length,
  songs,
};

await fs.writeFile(SONGS_PATH, `${JSON.stringify(payload, null, 2)}\n`);
await fs.writeFile(SQL_PATH, buildSql(songs));
console.log(`Imported ${songs.length}/${total} songs.`);
console.log(`Updated ${SONGS_PATH.pathname}`);
console.log(`Wrote ${SQL_PATH.pathname}`);
