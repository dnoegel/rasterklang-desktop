import { fmtTime } from "./ui.js";

export function createCatalog(raw) {
  const tracks = raw.tracks || [];
  const artists = raw.artists || [];
  normalizeTuneTypes(tracks);
  annotateArtistTuneTypes(artists, tracks);
  const trackById = new Map(tracks.map((track) => [track.id, track]));
  const trackByFile = new Map(tracks.map((track) => [track.file, track]));
  const artistById = new Map(artists.map((artist) => [artist.id, artist]));
  const releases = buildReleases(tracks);
  const releaseById = new Map(releases.map((release) => [release.id, release]));

  for (const track of tracks) {
    track.hvscPath = track.hvscPath || `/${track.file}`;
    track.searchText = [
      track.title,
      track.artist,
      track.author,
      track.release,
      track.released,
      track.hvscPath,
      track.originalArtist,
      track.source,
      track.primaryTuneType,
      track.tuneTypes.join(" "),
    ].filter(Boolean).join(" ").toLowerCase();
  }
  for (const artist of artists) {
    artist.searchText = [artist.name, artist.type, artist.grouping, (artist.tuneTypes || []).join(" ")].filter(Boolean).join(" ").toLowerCase();
  }
  for (const release of releases) {
    release.searchText = [release.title, release.artist, release.released, release.type, (release.tuneTypes || []).join(" ")].filter(Boolean).join(" ").toLowerCase();
  }
  const tuneTypeCounts = countTuneTypes(tracks);

  return {
    raw,
    basePath: raw.basePath || "../test_tunes/C64Music/",
    tracks,
    artists,
    releases,
    trackById,
    trackByFile,
    artistById,
    releaseById,
    featuredTracks: pickFeaturedTracks(tracks),
    topArtists: artists.filter((a) => a.type === "artist").sort((a, b) => b.trackCount - a.trackCount).slice(0, 48),
    topGames: artists.filter((a) => a.type === "game").sort((a, b) => b.trackCount - a.trackCount).slice(0, 48),
    topDemos: artists.filter((a) => a.type === "demo").sort((a, b) => b.trackCount - a.trackCount).slice(0, 48),
    tuneTypes: orderedTuneTypes(tuneTypeCounts),
    tuneTypeCounts,
    games: tracks.filter((track) => track.artistType === "game"),
    demos: tracks.filter((track) => track.artistType === "demo"),
    search(query, limit = 60, filters = {}) {
      const q = (query || "").trim().toLowerCase();
      const scopedTracks = filterTracks(tracks, filters);
      const scopedArtists = filterEntitiesByTuneType(artists, filters.tuneType);
      const scopedReleases = filterEntitiesByTuneType(releases, filters.tuneType);
      if (!q) {
        return {
          tracks: scopedTracks.slice(0, limit),
          artists: [],
          releases: [],
        };
      }
      return {
        tracks: rankedSearch(scopedTracks, q, limit),
        artists: rankedSearch(scopedArtists, q, Math.min(24, limit)),
        releases: rankedSearch(scopedReleases, q, Math.min(36, limit)),
      };
    },
    filterTracks,
    trackMatchesTuneType,
    artistTracks(artistId) {
      return tracks.filter((track) => track.artistId === artistId);
    },
    artistReleases(artistId) {
      return releases.filter((release) => release.artistId === artistId);
    },
    releaseTracks(releaseId) {
      const release = releaseById.get(releaseId);
      return release ? release.trackIds.map((id) => trackById.get(id)).filter(Boolean) : [];
    },
  };
}

function buildReleases(tracks) {
  const map = new Map();
  for (const track of tracks) {
    if (!map.has(track.releaseId)) {
      map.set(track.releaseId, {
        id: track.releaseId,
        title: track.release || track.title,
        artistId: track.artistId,
        artist: track.artist,
        type: track.artistType,
        released: track.released || "",
        trackIds: [],
        duration: 0,
        coverSeed: track.file,
        tuneTypeSet: new Set(),
      });
    }
    const release = map.get(track.releaseId);
    release.trackIds.push(track.id);
    release.duration += track.duration || 0;
    for (const type of track.tuneTypes || []) release.tuneTypeSet.add(type);
  }
  return Array.from(map.values()).map((release) => {
    release.tuneTypes = orderedTuneTypeLabels(release.tuneTypeSet);
    release.primaryTuneType = primaryTuneType(release.tuneTypes, release.type);
    delete release.tuneTypeSet;
    return release;
  }).sort((a, b) => a.title.localeCompare(b.title));
}

function pickFeaturedTracks(tracks) {
  const wanted = [
    "Arkanoid.sid",
    "Commando.sid",
    "Monty_on_the_Run.sid",
    "Rambo_First_Blood_Part_II.sid",
    "International_Karate.sid",
    "Last_Ninja",
    "Comic_Bakery.sid",
    "Lightforce.sid",
    "Sanxion.sid",
    "Wizball.sid",
    "Delta.sid",
    "Airwolf_Title.sid",
  ];
  const out = [];
  for (const needle of wanted) {
    const found = tracks.find((track) => track.file.includes(needle));
    if (found && !out.includes(found)) out.push(found);
  }
  if (out.length < 18) {
    out.push(...tracks.filter((track) => track.duration && track.duration > 90).slice(0, 18 - out.length));
  }
  return out;
}

function rankedSearch(items, q, limit) {
  const terms = q.split(/\s+/).filter(Boolean);
  const scored = [];
  for (const item of items) {
    const hay = item.searchText || "";
    const primary = (item.title || item.name || "").toLowerCase();
    const secondary = (item.artist || item.author || "").toLowerCase();
    let score = 0;
    for (const term of terms) {
      const idx = hay.indexOf(term);
      if (idx < 0) {
        score = 0;
        break;
      }
      score += idx === 0 ? 12 : 4;
      if (primary === term) score += 70;
      else if (primary.startsWith(term)) score += 34;
      else if (startsWord(primary, term)) score += 20;
      if (secondary === term) score += 28;
      else if (startsWord(secondary, term)) score += 14;
    }
    if (primary === q) score += 180;
    else if (primary.startsWith(q)) score += 70;
    else if (startsWord(primary, q)) score += 36;
    if (secondary === q) score += 42;
    else if (startsWord(secondary, q)) score += 18;
    if (item.trackCount) score += Math.min(18, Math.log10(item.trackCount + 1) * 8);
    if (score > 0) scored.push({ item, score });
  }
  return scored
    .sort((a, b) => b.score - a.score || primaryLength(a.item) - primaryLength(b.item))
    .slice(0, limit)
    .map((row) => row.item);
}

function normalizeTuneTypes(tracks) {
  for (const track of tracks) {
    const types = Array.isArray(track.tuneTypes) && track.tuneTypes.length
      ? track.tuneTypes.filter(Boolean)
      : [track.format].filter(Boolean);
    track.tuneTypes = Array.from(new Set(types));
    track.primaryTuneType = track.primaryTuneType || primaryTuneType(track.tuneTypes, track.format);
  }
}

function annotateArtistTuneTypes(artists, tracks) {
  const map = new Map();
  for (const track of tracks) {
    if (!map.has(track.artistId)) map.set(track.artistId, new Set());
    const set = map.get(track.artistId);
    for (const type of track.tuneTypes || []) set.add(type);
  }
  for (const artist of artists) {
    artist.tuneTypes = orderedTuneTypeLabels(map.get(artist.id) || new Set());
    artist.primaryTuneType = primaryTuneType(artist.tuneTypes, artist.type);
  }
}

function filterTracks(items, filters = {}) {
  return items.filter((track) => trackMatchesTuneType(track, filters.tuneType));
}

function filterEntitiesByTuneType(items, tuneType = "") {
  if (!tuneType) return items;
  return items.filter((item) => (item.tuneTypes || []).includes(tuneType));
}

function trackMatchesTuneType(track, tuneType = "") {
  return !tuneType || (track.tuneTypes || []).includes(tuneType);
}

function countTuneTypes(tracks) {
  const counts = new Map();
  for (const track of tracks) {
    for (const type of track.tuneTypes || []) {
      counts.set(type, (counts.get(type) || 0) + 1);
    }
  }
  return counts;
}

function orderedTuneTypes(counts) {
  return orderedTuneTypeLabels(counts.keys()).map((label) => ({ label, count: counts.get(label) || 0 }));
}

function orderedTuneTypeLabels(labels) {
  const order = [
    "PSID",
    "RSID",
    "BASIC",
    "MUS",
    "PlaySID-specific",
    "Sound Master",
    "SySound",
    "Music Expansion",
    "Magic Voice",
    "SAM/Reciter",
    "C64 Speech System",
    "Speech extension",
    "Custom BASIC extension",
  ];
  return Array.from(labels).sort((a, b) => {
    const ai = order.indexOf(a);
    const bi = order.indexOf(b);
    if (ai >= 0 || bi >= 0) return (ai >= 0 ? ai : 999) - (bi >= 0 ? bi : 999);
    return a.localeCompare(b);
  });
}

function primaryTuneType(types, format) {
  return types.find((type) => type !== format) || types[0] || format || "SID";
}

function startsWord(text, term) {
  if (!text || !term) return false;
  return text.split(/[^a-z0-9]+/).some((part) => part.startsWith(term));
}

function primaryLength(item) {
  return String(item.title || item.name || "").length;
}

export async function playTrack(ctx, track, queue = null) {
  if (!track) return;
  if (queue?.length) {
    const tracks = Array.from(queue);
    ctx.queue = { tracks, index: Math.max(0, tracks.findIndex((item) => item.id === track.id)) };
  } else if (!ctx.queue.tracks.length) {
    ctx.queue = { tracks: [track], index: 0 };
  }
  if (typeof ctx.engine.playLibraryTrack === "function") {
    await ctx.engine.playLibraryTrack(track);
    ctx.events.emit("player.track.started", { track });
    return;
  }
  const source = {
    kind: "hvsc",
    file: track.file,
    label: track.title,
    trackId: track.id,
    releaseId: track.releaseId,
    artistId: track.artistId,
    duration: track.duration,
  };
  await ctx.engine.loadFromUrl(trackURL(ctx, track), source);
  await ctx.engine.play({ subtune: track.defaultSubtune || 1 });
  ctx.events.emit("player.track.started", { track });
}

export async function playNextTrack(ctx, options = {}) {
  const wrap = options.wrap !== false;
  const queue = ctx.queue?.tracks || [];
  if (!queue.length) return false;
  if (ctx.queue.index + 1 >= queue.length && !wrap) return false;
  const nextIndex = ctx.queue.index + 1 < queue.length ? ctx.queue.index + 1 : 0;
  ctx.queue.index = nextIndex;
  await playTrack(ctx, queue[nextIndex], queue);
  return true;
}

export async function playPrevTrack(ctx) {
  const queue = ctx.queue?.tracks || [];
  if (!queue.length) return false;
  const prevIndex = ctx.queue.index > 0 ? ctx.queue.index - 1 : queue.length - 1;
  ctx.queue.index = prevIndex;
  await playTrack(ctx, queue[prevIndex], queue);
  return true;
}

export function currentTrack(ctx) {
  const file = ctx.engine.snapshot().tune?.source?.file;
  return file ? ctx.catalog.trackByFile.get(file) : null;
}

export function formatDuration(trackOrSeconds) {
  const seconds = typeof trackOrSeconds === "number" ? trackOrSeconds : trackOrSeconds?.duration;
  return seconds ? fmtTime(seconds) : "--:--";
}

function trackURL(ctx, track) {
  const basePath = ctx.catalog.basePath || "../test_tunes/C64Music/";
  if (basePath.includes("/api/sids/")) {
    return basePath + String(track.file || "").split("/").map(encodeURIComponent).join("/");
  }
  return basePath + track.file;
}
