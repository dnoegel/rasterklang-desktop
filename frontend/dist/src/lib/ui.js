// Small DOM helpers + toast factory used everywhere.
export function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props || {})) {
    if (value == null || value === false) continue;
    if (key === "class" || key === "className") {
      node.className = Array.isArray(value) ? value.filter(Boolean).join(" ") : value;
    } else if (key === "style" && typeof value === "object") {
      Object.assign(node.style, value);
    } else if (key === "dataset" && typeof value === "object") {
      for (const [k, v] of Object.entries(value)) {
        if (v == null) continue;
        node.dataset[k] = String(v);
      }
    } else if (key === "html") {
      node.innerHTML = value;
    } else if (key.startsWith("on") && typeof value === "function") {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key in node) {
      try { node[key] = value; } catch { node.setAttribute(key, value); }
    } else {
      node.setAttribute(key, value);
    }
  }
  appendChildren(node, children);
  return node;
}

export function appendChildren(node, children) {
  if (children == null) return;
  if (!Array.isArray(children)) children = [children];
  for (const child of children) {
    if (child == null || child === false) continue;
    if (typeof child === "string" || typeof child === "number") {
      node.append(document.createTextNode(String(child)));
    } else {
      node.append(child);
    }
  }
}

export function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

export function svg(name, size = 18) {
  const ICONS = {
    play:    "M8 5v14l11-7z",
    pause:   "M6 5h4v14H6zM14 5h4v14h-4z",
    stop:    "M6 6h12v12H6z",
    next:    "M6 18l8.5-6L6 6zM16 6h2v12h-2z",
    prev:    "M18 6l-8.5 6L18 18zM6 6h2v12H6z",
    home:    "M12 3l9 8h-2v9h-5v-6H10v6H5v-9H3z",
    library: "M4 6h2v14H4zM8 6h2v14H8zM12 6l8 14-1.7 1L10.3 7z",
    create:  "M12 4v16M4 12h16",
    notelab: "M9 3v18M5 7h8M5 11h8M5 15h8M15 9l3 3-3 3",
    insight: "M3 12h3l3-7 4 14 3-7h5",
    course:  "M4 6l8-3 8 3v8c0 5-4 7-8 8-4-1-8-3-8-8z",
    eject:   "M12 4l8 10H4zM4 18h16v2H4z",
    upload:  "M12 3l5 5h-3v8h-4V8H7zM4 18h16v3H4z",
    record:  "M12 6a6 6 0 1 1 0 12 6 6 0 0 1 0-12z",
    save:    "M5 3h11l4 4v14H5zM7 5v6h10V5z",
    download:"M12 3v10l4-4 1.4 1.4L12 16l-5.4-5.6L8 9l4 4V3zM4 18h16v3H4z",
    cog:     "M12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10zm0-4l1 2 2 .5L14 7l1.5 1.5L17 9l.5 2L19 12l-1.5 1L17 15l-1.5.5-1.5 1.5-2-1L11 19l-1-2-2-.5L9 14l-1.5-1.5L6 12l1.5-1.5L7 9l1.5-.5L10 7l1-2z",
    info:    "M11 7h2v2h-2zM11 11h2v6h-2zM12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z",
    chevron: "M9 6l6 6-6 6",
    search:  "M10 4a6 6 0 1 0 4 10.5l5 5 1.5-1.5-5-5A6 6 0 0 0 10 4zm0 2a4 4 0 1 1 0 8 4 4 0 0 1 0-8z",
    volume:  "M4 9v6h4l5 5V4L8 9zM18 7l1.4-1.4A8 8 0 0 1 20 12a8 8 0 0 1-.6 2.4L18 13z",
    eq:      "M6 4h2v7h2v2H8v7H6v-7H4v-2h2zM11 4h2v3h2v2h-2v11h-2V9H9V7h2zM16 4h2v10h2v2h-2v4h-2v-4h-2v-2h2z",
    heart:   "M12 21s-7.5-4.7-9.3-9.3C1.2 8 3.4 5 6.8 5c2 0 3.4 1 4.2 2.1C11.8 6 13.2 5 15.2 5c3.4 0 5.6 3 4.1 6.7C19.5 16.3 12 21 12 21z",
    artist:  "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0z",
    album:   "M5 4h14v16H5zM8 7h8v8H8zM10 17h4v1h-4z",
    list:    "M5 6h14v2H5zM5 11h14v2H5zM5 16h14v2H5z",
    clock:   "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm1 5v4l3 2-1 1.7-4-2.7V8z",
    spark:   "M12 2l2.2 6.5L21 12l-6.8 3.5L12 22l-2.2-6.5L3 12l6.8-3.5z",
    grid:    "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
    step:    "M5 5l5 5-5 5V5zM12 5h2v14h-2z",
    chip:    "M9 4h6v3h2v2h3v6h-3v2h-2v3H9v-3H7v-2H4V9h3V7h2z",
  };
  const path = ICONS[name] || ICONS.info;
  const ns = "http://www.w3.org/2000/svg";
  const node = document.createElementNS(ns, "svg");
  node.setAttribute("viewBox", "0 0 24 24");
  node.setAttribute("width", size);
  node.setAttribute("height", size);
  node.setAttribute("fill", "currentColor");
  node.setAttribute("aria-hidden", "true");
  const p = document.createElementNS(ns, "path");
  p.setAttribute("d", path);
  node.append(p);
  return node;
}

export function fmtHex(n, width = 2) {
  return Number(n).toString(16).toUpperCase().padStart(width, "0");
}

export function fmtBin(n, width = 8) {
  return Number(n).toString(2).padStart(width, "0");
}

export function fmtTime(seconds) {
  if (!Number.isFinite(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

export function createToast(host) {
  if (!host) host = document.body;

  function push(message, kind = "info", duration = 3200) {
    const node = el("div", { class: `toast toast--${kind}` }, message);
    host.append(node);
    setTimeout(() => {
      node.style.transition = "opacity 200ms ease, transform 200ms ease";
      node.style.opacity = "0";
      node.style.transform = "translateY(8px)";
      setTimeout(() => node.remove(), 220);
    }, duration);
    return node;
  }

  return {
    push,
    info: (msg, ms) => push(msg, "info", ms),
    ok: (msg, ms) => push(msg, "ok", ms),
    warn: (msg, ms) => push(msg, "warn", ms),
    error: (msg, ms) => push(msg, "error", ms),
  };
}

export function debounce(fn, ms = 120) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

export function throttle(fn, ms = 60) {
  let last = 0;
  let scheduled = null;
  return (...args) => {
    const now = performance.now();
    const delta = now - last;
    if (delta >= ms) {
      last = now;
      fn(...args);
    } else if (!scheduled) {
      scheduled = setTimeout(() => {
        scheduled = null;
        last = performance.now();
        fn(...args);
      }, ms - delta);
    }
  };
}
