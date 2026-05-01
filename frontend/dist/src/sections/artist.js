import { clear, el, svg } from "../lib/ui.js";
import { playTrack } from "../lib/catalog.js?v=2026-05-01-084125";
import { cover, pill, sectionHead, trackTable, tuneTypeSelect, typeLabel } from "../lib/view-components.js?v=2026-05-01-084125";

export function mount(host, ctx, params = {}) {
  const artist = ctx.catalog.artistById.get(params.id);
  if (!artist) {
    host.append(el("div", { class: "empty-state" }, "Profil nicht gefunden."));
    return;
  }
  const tracks = ctx.catalog.artistTracks(artist.id);
  const state = { tuneType: "" };
  const tableHost = el("div", {});
  const typeSelect = tuneTypeSelect(ctx, {
    onchange: (value) => {
      state.tuneType = value;
      renderTracks();
    },
  });
  host.append(el("section", { class: "detail-hero" }, [
    el("div", { class: "detail-hero__art" }, [cover(artist.id, artist.name)]),
    el("div", { class: "detail-hero__copy" }, [
      el("p", { class: "kicker" }, typeLabel(artist.type)),
      el("h1", {}, artist.name),
      el("div", { class: "pill-row" }, [
        pill("Tracks", tracks.length.toLocaleString("de-DE")),
        pill("Typ", typeLabel(artist.type)),
      ]),
      el("div", { class: "hero-actions" }, [
        el("button", { class: "btn btn--accent", onclick: () => tracks[0] && playTrack(ctx, tracks[0], tracks) }, [svg("play", 16), "Abspielen"]),
      ]),
    ]),
  ]));

  host.append(sectionHead("Tracks", "SID-Dateien dieses Profils"));
  host.append(el("section", { class: "search-panel" }, [typeSelect]), tableHost);
  renderTracks();

  function renderTracks() {
    const filtered = tracks.filter((track) => ctx.catalog.trackMatchesTuneType(track, state.tuneType));
    clear(tableHost);
    tableHost.append(trackTable(ctx, filtered, { pageSize: 200, queue: filtered }));
  }
}
