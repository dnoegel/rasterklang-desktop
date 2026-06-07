import {
  GetFavorites,
  ImportFavorites,
  SetFavorites,
} from "../../wailsjs/go/main/App.js";

const LEGACY_STORAGE_KEY = "rasterklang-webplayer:favorites:v1";

export async function createNativeFavorites(ctx) {
  let ids = new Set(normalizeState(await GetFavorites()));
  let saveQueue = Promise.resolve();
  let saveVersion = 0;

  await migrateLegacyFavorites();

  function normalizeState(state) {
    return Array.isArray(state?.ids) ? state.ids.filter(Boolean) : [];
  }

  function emit() {
    ctx.events.emit("favorites.changed", { ids: Array.from(ids) });
  }

  async function migrateLegacyFavorites() {
    const legacyIds = readLegacyIds();
    if (legacyIds.length === 0) return;

    try {
      ids = new Set(normalizeState(await ImportFavorites(legacyIds)));
      globalThis.localStorage?.removeItem(LEGACY_STORAGE_KEY);
    } catch (error) {
      console.warn("[favorites] legacy migration failed:", error);
      ctx.toast?.warn?.("Favoriten konnten nicht migriert werden.", 4200);
    }
  }

  function readLegacyIds() {
    try {
      const raw = globalThis.localStorage?.getItem(LEGACY_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
    } catch {
      return [];
    }
  }

  function queueSave() {
    const version = ++saveVersion;
    const snapshot = Array.from(ids);
    emit();

    saveQueue = saveQueue
      .catch(() => {})
      .then(() => SetFavorites(snapshot))
      .then((state) => {
        if (version !== saveVersion) return;
        ids = new Set(normalizeState(state));
        emit();
      })
      .catch((error) => {
        console.error("[favorites] save failed:", error);
        ctx.toast?.warn?.("Favoriten konnten nicht gespeichert werden.", 4200);
      });
  }

  return {
    has(trackId) {
      return ids.has(trackId);
    },
    toggle(trackId) {
      const active = !ids.has(trackId);
      if (active) ids.add(trackId);
      else ids.delete(trackId);
      queueSave();
      return active;
    },
    add(trackId) {
      if (ids.has(trackId)) return;
      ids.add(trackId);
      queueSave();
    },
    remove(trackId) {
      if (!ids.has(trackId)) return;
      ids.delete(trackId);
      queueSave();
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
