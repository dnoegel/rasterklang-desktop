import { el, clear, svg } from "../lib/ui.js";
import { createRouter } from "./router.js";
import { mountPlayer } from "./player.js?v=2026-05-01-084125";

const SECTION_VERSION = "2026-05-01-084125";

const SECTIONS = {
  home: { label: "Home", icon: "home", load: () => loadSection("home") },
  search: { label: "Suche", icon: "search", load: () => loadSection("search") },
  artists: { label: "Interpreten", icon: "artist", load: () => loadSection("artists") },
  games: { label: "Games", icon: "grid", load: () => loadSection("games") },
  demos: { label: "Demos", icon: "spark", load: () => loadSection("demos") },
  favorites: { label: "Lieblingslieder", icon: "heart", load: () => loadSection("favorites") },
  insight: { label: "Insight", icon: "insight", load: () => loadSection("insight") },
  artist: { label: "Interpret", icon: "artist", load: () => loadSection("artist") },
  release: { label: "Release", icon: "album", load: () => loadSection("release") },
};

function loadSection(name) {
  return import(`../sections/${name}.js?v=${SECTION_VERSION}`);
}

export async function mountShell(rootEl, ctx) {
  clear(rootEl);
  rootEl.removeAttribute("data-loading");
  const brandName = ctx.brandName || "zmk-webplayer";

  const sidebar = el("aside", { class: "shell-sidebar" });
  const main = el("main", { class: "shell-main" });
  const playerHost = el("footer", { class: "shell-player-host" });
  rootEl.append(sidebar, main, playerHost);

  const navItems = new Map();
  function renderNav() {
    const nav = el("nav", { class: "shell-sidebar__nav", "aria-label": "Hauptbereiche" });
    for (const key of ["home", "search", "artists", "games", "demos", "favorites"]) {
      const def = SECTIONS[key];
      const btn = el("button", {
        class: "shell-nav-item",
        onclick: () => router.navigate(key),
      }, [el("span", { class: "nav-icon" }, [svg(def.icon, 18)]), def.label]);
      navItems.set(key, btn);
      nav.append(btn);
    }
    return nav;
  }

  sidebar.append(renderBrand(ctx), renderNav(), renderStats(ctx), renderLibraryPicker(ctx), renderFavoritePreview(ctx));

  const title = el("strong", {}, "Home");
  const searchInput = el("input", {
    type: "search",
    class: "top-search",
    placeholder: "Titel, Interpreten, Games, Demos suchen",
    onkeydown: (event) => {
      if (event.key !== "Enter") return;
      const q = event.currentTarget.value.trim();
      if (q) router.navigate("search", { q });
    },
  });
  const runtimePill = el("span", { class: "runtime-pill", dataset: { state: "loading" } }, [
    el("span", { class: "dot" }),
    el("span", { class: "label" }, ctx.native ? "Native startet" : "WASM laedt"),
  ]);
  const header = el("header", { class: "shell-main__header" }, [
    el("div", { class: "shell-main__crumbs" }, [title]),
    el("div", { class: "shell-main__search" }, [svg("search", 16), searchInput]),
    el("div", { class: "shell-main__sys" }, [runtimePill]),
  ]);
  const content = el("div", { class: "shell-main__content" });
  main.append(header, content);

  mountPlayer(playerHost, ctx);

  const router = createRouter({
    container: content,
    sections: SECTIONS,
    ctx,
    onChange: (name, params) => {
      for (const [key, btn] of navItems.entries()) {
        if (key === name) btn.setAttribute("aria-current", "page");
        else btn.removeAttribute("aria-current");
      }
      title.textContent = SECTIONS[name]?.label || brandName;
      if (name === "search" && params?.q) searchInput.value = params.q;
    },
  });
  ctx.router = router;

  function updateRuntime() {
    const snap = ctx.engine.snapshot();
    if (snap.ready) {
      runtimePill.dataset.state = "ready";
      runtimePill.querySelector(".label").textContent = ctx.native ? "Native bereit" : "WASM bereit";
    } else if (snap.error) {
      runtimePill.dataset.state = "error";
      runtimePill.querySelector(".label").textContent = ctx.native ? "Native Fehler" : "WASM Fehler";
      runtimePill.title = snap.error;
    } else {
      runtimePill.dataset.state = "loading";
      runtimePill.querySelector(".label").textContent = ctx.native ? "Native startet" : "WASM laedt";
    }
  }
  ctx.events.on("engine.sdk.ready", updateRuntime);
  ctx.events.on("engine.sdk.error", updateRuntime);
  ctx.events.on("engine.state", updateRuntime);
  updateRuntime();

  router.attachHashListener();
  return { router };
}

function renderBrand(ctx) {
  const brandName = ctx.brandName || "zmk-webplayer";
  return el("div", { class: "shell-sidebar__brand" }, [
    el("div", { class: "shell-sidebar__brand-mark" }, [el("span", {}, "SID")]),
    el("div", {}, [
      el("h1", {}, brandName),
      el("small", {}, `HVSC ${ctx.library.trackCount.toLocaleString("de-DE")} Tracks`),
    ]),
  ]);
}

function renderStats(ctx) {
  const artistCount = ctx.catalog.artists.filter((artist) => artist.type === "artist").length;
  return el("div", { class: "sidebar-stat-grid" }, [
    miniStat("Tracks", ctx.library.trackCount.toLocaleString("de-DE")),
    miniStat("Interpreten", artistCount.toLocaleString("de-DE")),
    miniStat("Games", ctx.catalog.games.length.toLocaleString("de-DE")),
    miniStat("Demos", ctx.catalog.demos.length.toLocaleString("de-DE")),
  ]);
}

function renderLibraryPicker(ctx) {
  if (!ctx.native) return el("span", { hidden: true });
  const title = el("strong", {}, "HVSC Collection");
  const sub = el("small", {}, ctx.native.state?.hvscRootLabel || "Keine HVSC gewaehlt");
  const btn = el("button", {
    class: "native-library-card",
    onclick: async () => {
      try {
        btn.disabled = true;
        await ctx.native.chooseHVSCRoot();
      } catch (error) {
        ctx.toast.error(`HVSC konnte nicht geoeffnet werden: ${error.message || error}`);
      } finally {
        btn.disabled = false;
      }
    },
  }, [
    el("span", { class: "native-library-card__icon" }, [svg("library", 18)]),
    el("span", {}, [title, sub]),
  ]);
  function paint(state = ctx.native.state) {
    btn.dataset.ready = state?.hvscRootValid ? "true" : "false";
    sub.textContent = state?.hvscRootValid ? (state.hvscRootLabel || "C64Music") : "Ordner auswaehlen";
  }
  ctx.events.on("native.library.changed", paint);
  paint();
  return btn;
}

function renderFavoritePreview(ctx) {
  const count = el("strong", {}, String(ctx.favorites.count()));
  const node = el("button", {
    class: "favorite-preview",
    onclick: () => ctx.router?.navigate("favorites"),
  }, [
    el("span", { class: "favorite-preview__icon" }, [svg("heart", 18)]),
    el("span", {}, [count, el("small", {}, "Lieblingslieder")]),
  ]);
  ctx.events.on("favorites.changed", () => {
    count.textContent = String(ctx.favorites.count());
  });
  return node;
}

function miniStat(label, value) {
  return el("div", { class: "sidebar-stat" }, [
    el("strong", {}, value),
    el("span", {}, label),
  ]);
}
