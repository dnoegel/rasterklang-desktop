// Hash-based router. Knows the registered sections and dispatches to them.
import { el, clear } from "../lib/ui.js";

export function createRouter({ container, sections, ctx, onChange }) {
  let current = null;

  async function go(name, params = {}) {
    const section = sections[name];
    if (!section) {
      console.warn("[router] unknown section:", name);
      return;
    }
    if (current && current.name === name) {
      // Allow re-render with new params.
      if (typeof current.module.update === "function") {
        current.module.update(params);
        if (onChange) onChange(name, params);
        return;
      }
    }
    if (current) {
      try { current.module?.unmount?.(); } catch (e) { console.warn(e); }
    }
    clear(container);
    const host = el("div", { class: "section-page", dataset: { section: name } });
    container.append(host);

    let mod;
    try {
      mod = await section.load();
    } catch (error) {
      console.error(`[router] failed to load section ${name}:`, error);
      host.append(el("div", { class: "empty-state" }, `Section could not be loaded: ${error.message || error}`));
      return;
    }
    let api;
    try {
      api = mod.mount ? mod.mount(host, ctx, params) : null;
    } catch (error) {
      console.error(`[router] mount failed for ${name}:`, error);
      host.append(el("div", { class: "empty-state" }, `Section error: ${error.message || error}`));
      return;
    }
    current = { name, module: api || {}, params };
    if (onChange) onChange(name, params);
  }

  function attachHashListener() {
    function read() {
      const raw = location.hash.replace(/^#/, "");
      if (!raw) {
        go("home");
        return;
      }
      const [name, query] = raw.split("?");
      const params = Object.fromEntries(new URLSearchParams(query || ""));
      go(name, params);
    }
    window.addEventListener("hashchange", read);
    read();
  }

  function navigate(name, params = {}) {
    const usp = new URLSearchParams(params);
    const tail = usp.toString();
    const hash = `#${name}${tail ? "?" + tail : ""}`;
    if (location.hash === hash) {
      go(name, params);
    } else {
      location.hash = hash;
    }
  }

  function refresh() {
    if (!current) return;
    const { name, params } = current;
    current = null;
    go(name, params);
  }

  return { go, navigate, refresh, attachHashListener, current: () => current };
}
