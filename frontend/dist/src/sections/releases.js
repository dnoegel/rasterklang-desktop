import { el, clear, debounce } from "../lib/ui.js";
import { entityCard, pagedGrid, sectionHead, tuneTypeSelect, typeLabel } from "../lib/view-components.js?v=dev";

export function mount(host, ctx) {
  const state = { q: "", tuneType: "" };
  const input = el("input", {
    type: "search",
    class: "search-field",
    placeholder: "Filter releases, tracks, or authors",
    oninput: debounce((event) => {
      state.q = event.target.value.trim().toLowerCase();
      render();
    }, 120),
  });
  const typeSelect = tuneTypeSelect(ctx, {
    onchange: (value) => {
      state.tuneType = value;
      render();
    },
  });
  const gridHost = el("div", {});
  host.append(sectionHead("Releases", "HVSC files as releases"), el("section", { class: "search-panel" }, [input, typeSelect]), gridHost);

  function render() {
    clear(gridHost);
    const items = ctx.catalog.releases.filter((release) => (
      (!state.q || release.searchText.includes(state.q)) &&
      (!state.tuneType || (release.tuneTypes || []).includes(state.tuneType))
    ));
    gridHost.append(pagedGrid(items, (release) => (
      entityCard({
        title: release.title,
        subtitle: release.artist,
        kind: typeLabel(release.type),
        seed: release.coverSeed,
        onclick: () => ctx.router.navigate("release", { id: release.id }),
      })
    ), { pageSize: 200, empty: "No releases found." }));
  }

  render();
}
