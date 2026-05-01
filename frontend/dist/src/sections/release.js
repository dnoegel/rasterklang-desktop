import { clear, el, svg } from "../lib/ui.js";
import { playTrack } from "../lib/catalog.js?v=2026-05-01-084125";
import { cover, pill, sectionHead, trackTable, tuneTypeSelect, typeLabel } from "../lib/view-components.js?v=2026-05-01-084125";

export function mount(host, ctx, params = {}) {
  const release = ctx.catalog.releaseById.get(params.id);
  if (!release) {
    host.append(el("div", { class: "empty-state" }, "Release nicht gefunden."));
    return;
  }
  const tracks = ctx.catalog.releaseTracks(release.id);
  const state = { tuneType: "" };
  const tableHost = el("div", {});
  const typeSelect = tuneTypeSelect(ctx, {
    onchange: (value) => {
      state.tuneType = value;
      renderTracks();
    },
  });
  host.append(el("section", { class: "detail-hero" }, [
    el("div", { class: "detail-hero__art" }, [cover(release.coverSeed, release.title)]),
    el("div", { class: "detail-hero__copy" }, [
      el("p", { class: "kicker" }, typeLabel(release.type)),
      el("h1", {}, release.title),
      el("p", {}, release.artist),
      el("div", { class: "pill-row" }, [
        pill("Tracks", tracks.length.toLocaleString("de-DE")),
        pill("Zeit", release.duration ? `${Math.round(release.duration / 60)} min` : "--"),
        pill("Quelle", typeLabel(release.type)),
      ]),
      el("div", { class: "hero-actions" }, [
        el("button", { class: "btn btn--accent", onclick: () => tracks[0] && playTrack(ctx, tracks[0], tracks) }, [svg("play", 16), "Abspielen"]),
        el("button", { class: "btn btn--ghost", onclick: () => ctx.router.navigate("artist", { id: release.artistId }) }, [svg("artist", 16), "Profil"]),
      ]),
    ]),
  ]));
  host.append(sectionHead("Tracks"));
  host.append(el("section", { class: "search-panel" }, [typeSelect]), tableHost);
  renderTracks();

  function renderTracks() {
    const filtered = tracks.filter((track) => ctx.catalog.trackMatchesTuneType(track, state.tuneType));
    clear(tableHost);
    tableHost.append(trackTable(ctx, filtered, { pageSize: 200, queue: filtered }));
  }
}
