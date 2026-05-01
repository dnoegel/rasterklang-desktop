import { el, clear, debounce } from "../lib/ui.js";
import { entityCard, pagedGrid, sectionHead, tuneTypeSelect, typeLabel } from "../lib/view-components.js?v=2026-05-01-084125";

export function mount(host, ctx) {
  const state = { q: "", tuneType: "" };
  const input = el("input", {
    type: "search",
    class: "search-field",
    placeholder: "Interpreten filtern",
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
  host.append(sectionHead("Interpreten", "Komponisten und Crews aus der HVSC"), el("section", { class: "search-panel" }, [input, typeSelect]), gridHost);

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
        subtitle: `${artist.trackCount.toLocaleString("de-DE")} Tracks`,
        kind: typeLabel(artist.type),
        seed: artist.id,
        onclick: () => ctx.router.navigate("artist", { id: artist.id }),
      })
    ), { pageSize: 200, empty: "Keine Interpreten gefunden." }));
  }

  render();
}
