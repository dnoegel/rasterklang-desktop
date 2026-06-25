import { el, clear, svg } from "../lib/ui.js";
import { playTrack } from "../lib/catalog.js?v=dev";
import { sectionHead, trackTable, tuneTypeSelect } from "../lib/view-components.js?v=dev";

export function mount(host, ctx) {
  const state = { tuneType: "" };
  const tableHost = el("div", {});
  const playBtn = el("button", { class: "btn btn--accent" }, [svg("play", 16), "Play"]);
  const typeSelect = tuneTypeSelect(ctx, {
    onchange: (value) => {
      state.tuneType = value;
      render();
    },
  });
  host.append(el("section", { class: "playlist-hero" }, [
    el("div", { class: "playlist-hero__art" }, [svg("heart", 56)]),
    el("div", {}, [
      el("p", { class: "kicker" }, "Playlist"),
      el("h1", {}, "Your favorites"),
      el("p", {}, "All favorited SID tracks in an automatically maintained playlist."),
      el("div", { class: "hero-actions" }, [playBtn]),
    ]),
  ]), sectionHead("Tracks"), el("section", { class: "search-panel" }, [typeSelect]), tableHost);

  function render() {
    const tracks = ctx.favorites.tracks().filter((track) => ctx.catalog.trackMatchesTuneType(track, state.tuneType));
    playBtn.onclick = () => tracks[0] && playTrack(ctx, tracks[0], tracks);
    clear(tableHost);
    tableHost.append(trackTable(ctx, tracks, { pageSize: 200, queue: tracks, empty: "No favorites yet." }));
  }

  const off = ctx.events.on("favorites.changed", render);
  render();
  return { unmount: off };
}
