import { el, clear, debounce } from "../lib/ui.js";
import { sectionHead, trackTable, tuneTypeSelect } from "../lib/view-components.js?v=2026-06-06-180836";

export function mount(host, ctx) {
  mountTypeBrowser(host, ctx, {
    title: "Demos",
    subtitle: "Demos, intros, and tools from the HVSC as directly playable SID files",
    placeholder: "Search demos",
    tracks: ctx.catalog.demos,
    empty: "No demos found.",
  });
}

function mountTypeBrowser(host, ctx, config) {
  const state = { q: "", tuneType: "" };
  const input = el("input", {
    type: "search",
    class: "search-field",
    placeholder: config.placeholder,
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
  const tableHost = el("div", {});
  host.append(
    sectionHead(config.title, config.subtitle),
    el("section", { class: "search-panel" }, [input, typeSelect]),
    tableHost,
  );

  function render() {
    const tracks = config.tracks.filter((track) => (
      (!state.q || track.searchText.includes(state.q)) &&
      ctx.catalog.trackMatchesTuneType(track, state.tuneType)
    ));
    clear(tableHost);
    tableHost.append(trackTable(ctx, tracks, { pageSize: 200, queue: tracks, empty: config.empty }));
  }

  render();
}
