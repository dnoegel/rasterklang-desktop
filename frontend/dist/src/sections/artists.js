import { el, clear, debounce } from "../lib/ui.js";
import { entityCard, pagedGrid, sectionHead, tuneTypeSelect, typeLabel } from "../lib/view-components.js?v=dev";

export function mount(host, ctx) {
  const state = { q: "", tuneType: "" };
  const input = el("input", {
    type: "search",
    class: "search-field",
    placeholder: "Filter artists",
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
  host.append(sectionHead("Artists", "Composers and crews from the local SID library"), el("section", { class: "search-panel" }, [input, typeSelect]), gridHost);

  function render() {
    clear(gridHost);
    const items = ctx.catalog.artists.filter((artist) => {
      if (artist.type !== "artist") return false;
      if (state.q && !artist.searchText.includes(state.q)) return false;
      if (state.tuneType && !(artist.tuneTypes || []).includes(state.tuneType)) return false;
      return true;
    }).sort((a, b) => b.trackCount - a.trackCount);
    gridHost.append(pagedGrid(items, (artist) => (
      entityCard({
        title: artist.name,
        subtitle: `${artist.trackCount.toLocaleString("en-US")} Tracks`,
        kind: typeLabel(artist.type),
        seed: artist.id,
        onclick: () => ctx.router.navigate("artist", { id: artist.id }),
      })
    ), { pageSize: 200, empty: "No artists found." }));
  }

  render();
}
