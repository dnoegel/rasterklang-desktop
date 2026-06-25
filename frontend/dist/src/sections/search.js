import { el, clear, debounce } from "../lib/ui.js";
import { entityCard, sectionHead, trackTable, tuneTypeSelect, typeLabel } from "../lib/view-components.js?v=dev";

let api = null;

export function mount(host, ctx, params = {}) {
  const state = { tuneType: "" };
  const input = el("input", {
    type: "search",
    class: "search-field",
    placeholder: "Title, author, game, path, or release",
    value: params.q || "",
  });
  const typeSelect = tuneTypeSelect(ctx, {
    onchange: (value) => {
      state.tuneType = value;
      render();
    },
  });
  const resultHost = el("div", {});
  host.append(el("section", { class: "search-panel" }, [input, typeSelect]), resultHost);

  function render() {
    const q = input.value.trim();
    const tuneType = state.tuneType;
    clear(resultHost);
    if (!q && !tuneType) {
      resultHost.append(sectionHead("Search", "Enter a search term; Enter is not required."));
      resultHost.append(el("div", { class: "empty-state" }, "Ready for HVSC search."));
      return;
    }
    const results = ctx.catalog.search(q, q ? 400 : ctx.catalog.tracks.length, { tuneType });
    resultHost.append(sectionHead("Top results", `${results.tracks.length} Tracks, ${results.artists.length} Profiles`));
    if (results.artists.length) {
      const grid = el("div", { class: "entity-grid entity-grid--compact" });
      for (const artist of results.artists.slice(0, 8)) {
        grid.append(entityCard({
          title: artist.name,
          subtitle: `${artist.trackCount.toLocaleString("en-US")} Tracks`,
          kind: typeLabel(artist.type),
          seed: artist.id,
          onclick: () => ctx.router.navigate("artist", { id: artist.id }),
        }));
      }
      resultHost.append(grid);
    }
    resultHost.append(trackTable(ctx, results.tracks, { pageSize: 200, queue: results.tracks, empty: "No tracks found." }));
  }

  input.addEventListener("input", debounce(render, 120));
  render();
  api = {
    update(next = {}) {
      input.value = next.q || "";
      state.tuneType = next.tuneType || "";
      typeSelect.value = state.tuneType;
      render();
    },
  };
  return api;
}

export function update(params) {
  api?.update(params);
}
