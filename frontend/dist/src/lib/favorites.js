const STORAGE_KEY = "rasterklang-webplayer:favorites:v1";

export function createFavorites(ctx) {
  let ids = load();

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return new Set(Array.isArray(parsed) ? parsed : []);
    } catch {
      return new Set();
    }
  }

  function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(ids)));
    ctx.events.emit("favorites.changed", { ids: Array.from(ids) });
  }

  return {
    has(trackId) {
      return ids.has(trackId);
    },
    toggle(trackId) {
      if (ids.has(trackId)) ids.delete(trackId);
      else ids.add(trackId);
      save();
      return ids.has(trackId);
    },
    add(trackId) {
      ids.add(trackId);
      save();
    },
    remove(trackId) {
      ids.delete(trackId);
      save();
    },
    tracks() {
      return Array.from(ids).map((id) => ctx.catalog.trackById.get(id)).filter(Boolean);
    },
    count() {
      return ids.size;
    },
    ids() {
      return Array.from(ids);
    },
  };
}
