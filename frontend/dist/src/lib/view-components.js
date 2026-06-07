import { clear, el, svg } from "./ui.js";
import { currentTrack, formatDuration, playTrack } from "./catalog.js?v=2026-06-06-180836";

const DEFAULT_PAGE_SIZE = 200;

export function sectionHead(title, sub = "") {
  return el("div", { class: "section-title" }, [
    el("h2", {}, title),
    sub ? el("small", {}, sub) : null,
  ]);
}

export function cover(seed, label = "SID", size = 220) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const c = canvas.getContext("2d");
  const h = hash(seed || label);
  const a = 120 + (h % 70);
  const b = 210 + ((h >> 3) % 80);
  const grad = c.createLinearGradient(0, 0, size, size);
  grad.addColorStop(0, `hsl(${a}, 62%, 34%)`);
  grad.addColorStop(1, `hsl(${b}, 52%, 14%)`);
  c.fillStyle = grad;
  c.fillRect(0, 0, size, size);
  c.globalAlpha = 0.7;
  c.strokeStyle = "rgba(255,255,255,0.18)";
  c.lineWidth = 2;
  c.beginPath();
  for (let x = 0; x < size; x += 1) {
    const y = size * 0.55 + Math.sin(x * 0.04 + h) * size * 0.12 + Math.sin(x * 0.017) * size * 0.06;
    if (x === 0) c.moveTo(x, y);
    else c.lineTo(x, y);
  }
  c.stroke();
  c.globalAlpha = 1;
  c.fillStyle = "rgba(255,255,255,0.88)";
  c.font = `700 ${Math.floor(size * 0.13)}px ui-monospace, monospace`;
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.fillText(initials(label), size / 2, size / 2);
  return canvas;
}

export function entityCard({ title, subtitle, kind, seed, onclick }) {
  return el("button", { class: "entity-card", onclick }, [
    el("div", { class: "entity-card__art" }, [cover(seed || title, title)]),
    el("strong", {}, title || "Untitled"),
    subtitle ? el("span", {}, subtitle) : null,
    kind ? el("small", {}, kind) : null,
  ]);
}

export function tuneTypeSelect(ctx, { value = "", onchange, allLabel = "All types" } = {}) {
  const select = el("select", {
    class: "search-select",
    onchange: (event) => onchange?.(event.target.value),
  }, [
    el("option", { value: "" }, allLabel),
    ...(ctx.catalog.tuneTypes || []).map((type) => (
      el("option", { value: type.label }, `${type.label} (${type.count.toLocaleString("en-US")})`)
    )),
  ]);
  select.value = value || "";
  return select;
}

export function trackTable(ctx, tracks, options = {}) {
  const pageSize = options.pageSize || options.limit || DEFAULT_PAGE_SIZE;
  const queue = options.queue || tracks;
  const wrap = el("div", { class: "track-table" });
  const footer = el("div", { class: "list-more" });
  const sentinel = el("div", { class: "list-sentinel", "aria-hidden": "true" });
  let visible = Math.min(pageSize, tracks.length);
  let observer = null;

  const loadMore = () => {
    if (visible >= tracks.length) return;
    visible = Math.min(visible + pageSize, tracks.length);
    render();
    if (visible >= tracks.length) observer?.disconnect();
  };

  function render() {
    clear(wrap);
    wrap.append(el("div", { class: "track-row track-row--head" }, [
      el("span", {}, "#"),
      el("span", {}, "Title"),
      el("span", {}, "Artist"),
      el("span", {}, "Type"),
      el("span", {}, "Time"),
      el("span", {}, ""),
    ]));

    tracks.slice(0, visible).forEach((track, index) => {
      wrap.append(trackRow(ctx, track, index, queue));
    });
    paintActiveRows();
    if (!tracks.length) {
      wrap.append(el("div", { class: "empty-state" }, options.empty || "No tracks."));
      return;
    }
    renderPager(footer, visible, tracks.length, loadMore);
    if (visible < tracks.length) wrap.append(footer, sentinel);
  }

  render();
  const offEvents = [
    "player.track.started",
    "engine.state",
    "engine.play.started",
    "engine.play.paused",
    "engine.play.resumed",
    "engine.play.stopped",
  ].map((name) => ctx.events.on(name, paintActiveRows));
  cleanupWhenDetached(wrap, () => offEvents.forEach((off) => off()));
  observer = attachInfinitePager(sentinel, loadMore, () => visible < tracks.length, options);
  return wrap;

  function paintActiveRows() {
    const snap = ctx.engine?.snapshot?.();
    const activeTrack = snap?.playing || snap?.paused ? currentTrack(ctx) : null;
    const activeId = activeTrack?.id || "";
    for (const row of wrap.querySelectorAll(".track-row[data-track-id]")) {
      const active = activeId && row.dataset.trackId === activeId;
      row.dataset.current = active ? "true" : "false";
      row.dataset.playing = active && snap?.playing && !snap?.paused ? "true" : "false";
      if (active) row.setAttribute("aria-current", "true");
      else row.removeAttribute("aria-current");
    }
  }
}

export function pagedGrid(items, renderItem, options = {}) {
  const pageSize = options.pageSize || DEFAULT_PAGE_SIZE;
  const wrap = el("div", { class: "paged-list" });
  const grid = el("div", { class: options.className || "entity-grid" });
  const footer = el("div", { class: "list-more" });
  const sentinel = el("div", { class: "list-sentinel", "aria-hidden": "true" });
  let visible = Math.min(pageSize, items.length);
  let observer = null;

  const loadMore = () => {
    if (visible >= items.length) return;
    visible = Math.min(visible + pageSize, items.length);
    render();
    if (visible >= items.length) observer?.disconnect();
  };

  function render() {
    clear(wrap);
    if (!items.length) {
      wrap.append(el("div", { class: "empty-state" }, options.empty || "No results."));
      return;
    }
    clear(grid);
    items.slice(0, visible).forEach((item, index) => {
      grid.append(renderItem(item, index));
    });
    wrap.append(grid);
    renderPager(footer, visible, items.length, loadMore);
    if (visible < items.length) wrap.append(footer, sentinel);
  }

  render();
  observer = attachInfinitePager(sentinel, loadMore, () => visible < items.length, options);
  return wrap;
}

export function trackRow(ctx, track, index = 0, queue = null) {
  const fav = el("button", {
    class: "icon-btn",
    title: "Favorite",
    onclick: (event) => {
      event.stopPropagation();
      const active = ctx.favorites.toggle(track.id);
      fav.dataset.active = active ? "true" : "false";
    },
  }, [svg("heart", 16)]);
  fav.dataset.active = ctx.favorites.has(track.id) ? "true" : "false";
  ctx.events.on("favorites.changed", () => {
    fav.dataset.active = ctx.favorites.has(track.id) ? "true" : "false";
  });

  const indexCell = el("span", { class: "track-row__index" }, [
    el("span", { class: "track-row__number" }, String(index + 1)),
    el("span", { class: "track-row__now" }, [svg("play", 12)]),
  ]);

  return el("button", {
    class: "track-row",
    dataset: { trackId: track.id },
    onclick: () => playTrack(ctx, track, queue || [track]),
  }, [
    indexCell,
    el("span", { class: "track-row__title" }, [
      el("strong", {}, track.title || "Untitled"),
      el("small", {}, track.author || track.hvscPath),
    ]),
    el("span", {}, track.artist || "Unknown"),
    el("span", { class: "track-row__info" }, [
      el("strong", {}, tuneTypeSummary(track)),
      el("small", {}, track.source || track.released || track.hvscPath || "-"),
    ]),
    el("span", {}, formatDuration(track)),
    el("span", { class: "track-row__actions" }, [fav]),
  ]);
}

export function pill(label, value) {
  return el("span", { class: "info-pill" }, [
    el("strong", {}, value),
    el("small", {}, label),
  ]);
}

export function typeLabel(type) {
  if (type === "game") return "Game";
  if (type === "demo") return "Demo";
  return "Artist";
}

export function tuneTypeSummary(track) {
  const types = Array.isArray(track?.tuneTypes) && track.tuneTypes.length
    ? track.tuneTypes
    : [track?.format].filter(Boolean);
  return types.slice(0, 3).join(", ") || "SID";
}

function renderPager(host, visible, total, loadMore) {
  clear(host);
  if (visible >= total) return;
  host.append(
    el("span", { class: "list-more__status" }, `${visible.toLocaleString("en-US")} of ${total.toLocaleString("en-US")} visible`),
    el("button", { class: "btn btn--ghost", onclick: loadMore }, [svg("chevron", 14), "Load more"]),
  );
}

function attachInfinitePager(sentinel, loadMore, hasMore, options) {
  if (options.infinite === false || typeof IntersectionObserver === "undefined") return null;
  let cleanup = null;
  const observer = new IntersectionObserver((entries) => {
    if (!sentinel.isConnected) {
      controller.disconnect();
      return;
    }
    if (entries.some((entry) => entry.isIntersecting) && hasMore()) loadMore();
    if (!hasMore()) controller.disconnect();
  }, { rootMargin: "640px 0px" });
  const controller = {
    disconnect() {
      observer.disconnect();
      cleanup?.disconnect();
    },
  };
  const schedule = typeof requestAnimationFrame === "function" ? requestAnimationFrame : (fn) => setTimeout(fn, 0);
  schedule(() => {
    if (!hasMore() || !sentinel.isConnected) return;
    if (typeof MutationObserver !== "undefined" && typeof document !== "undefined" && document.body) {
      cleanup = new MutationObserver(() => {
        if (!sentinel.isConnected) {
          controller.disconnect();
        }
      });
      cleanup.observe(document.body, { childList: true, subtree: true });
    }
    observer.observe(sentinel);
  });
  return controller;
}

function cleanupWhenDetached(node, cleanup) {
  if (typeof MutationObserver === "undefined" || typeof document === "undefined" || !document.body) return;
  let done = false;
  const observer = new MutationObserver(() => {
    if (done || node.isConnected) return;
    done = true;
    observer.disconnect();
    cleanup();
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

function hash(s) {
  let n = 0;
  for (let i = 0; i < String(s).length; i += 1) n = ((n << 5) - n + String(s).charCodeAt(i)) | 0;
  return Math.abs(n);
}

function initials(label) {
  return String(label || "SID")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 3) || "SID";
}
